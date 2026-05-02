// server.js - Backend entry point
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// Database connection - CORRECT SSL CONFIGURATION FOR LOCAL POSTGRESQL
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// JWT Secret
const JWT_SECRET = process.env.JWT_SECRET || 'your_jwt_secret_key_change_in_production';

// ========== Database Schema Setup ==========
const initDb = async () => {
  const client = await pool.connect();
  try {
    // Users table
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        name VARCHAR(255) NOT NULL,
        role VARCHAR(50) DEFAULT 'member',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Projects table
    await client.query(`
      CREATE TABLE IF NOT EXISTS projects (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        created_by INTEGER REFERENCES users(id),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Team members (project assignments)
    await client.query(`
      CREATE TABLE IF NOT EXISTS team_members (
        id SERIAL PRIMARY KEY,
        project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        role VARCHAR(50) DEFAULT 'member',
        joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(project_id, user_id)
      )
    `);

    // Tasks table
    await client.query(`
      CREATE TABLE IF NOT EXISTS tasks (
        id SERIAL PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        description TEXT,
        status VARCHAR(50) DEFAULT 'pending',
        priority VARCHAR(50) DEFAULT 'medium',
        due_date DATE,
        project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
        assigned_to INTEGER REFERENCES users(id),
        created_by INTEGER REFERENCES users(id),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Insert default admin if not exists
    const adminEmail = 'admin@example.com';
    const adminExists = await client.query('SELECT id FROM users WHERE email = $1', [adminEmail]);
    if (adminExists.rows.length === 0) {
      const hashedPassword = await bcrypt.hash('admin123', 10);
      await client.query(
        'INSERT INTO users (email, password_hash, name, role) VALUES ($1, $2, $3, $4)',
        [adminEmail, hashedPassword, 'Admin User', 'admin']
      );
      console.log('Default admin created: admin@example.com / admin123');
    }

    console.log('Database initialized successfully');
  } catch (err) {
    console.error('Database init error:', err);
  } finally {
    client.release();
  }
};

initDb();

// ========== Authentication Middleware ==========
const authenticate = async (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) {
    return res.status(401).json({ error: 'Access denied. No token provided.' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const result = await pool.query('SELECT id, email, name, role FROM users WHERE id = $1', [decoded.userId]);
    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid token.' });
    }
    req.user = result.rows[0];
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid token.' });
  }
};

const requireAdmin = (req, res, next) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required.' });
  }
  next();
};

// ========== Auth Routes ==========
app.post('/api/auth/signup', async (req, res) => {
  const { email, password, name } = req.body;
  
  if (!email || !password || !name) {
    return res.status(400).json({ error: 'All fields are required.' });
  }

  try {
    const existing = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
    if (existing.rows.length > 0) {
      return res.status(400).json({ error: 'Email already registered.' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const result = await pool.query(
      'INSERT INTO users (email, password_hash, name, role) VALUES ($1, $2, $3, $4) RETURNING id, email, name, role',
      [email, hashedPassword, name, 'member']
    );

    const token = jwt.sign({ userId: result.rows[0].id }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, user: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error.' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password required.' });
  }

  try {
    const result = await pool.query('SELECT id, email, name, role, password_hash FROM users WHERE email = $1', [email]);
    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials.' });
    }

    const user = result.rows[0];
    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid credentials.' });
    }

    const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, user: { id: user.id, email: user.email, name: user.name, role: user.role } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// ========== Project Routes ==========
app.get('/api/projects', authenticate, async (req, res) => {
  try {
    let query;
    let params;
    
    if (req.user.role === 'admin') {
      query = `
        SELECT p.*, u.name as created_by_name,
        (SELECT COUNT(*) FROM team_members WHERE project_id = p.id) as member_count
        FROM projects p
        LEFT JOIN users u ON p.created_by = u.id
        ORDER BY p.created_at DESC
      `;
      params = [];
    } else {
      query = `
        SELECT p.*, u.name as created_by_name,
        (SELECT COUNT(*) FROM team_members WHERE project_id = p.id) as member_count
        FROM projects p
        LEFT JOIN users u ON p.created_by = u.id
        INNER JOIN team_members tm ON p.id = tm.project_id
        WHERE tm.user_id = $1
        ORDER BY p.created_at DESC
      `;
      params = [req.user.id];
    }
    
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error.' });
  }
});

app.post('/api/projects', authenticate, async (req, res) => {
  const { name, description } = req.body;
  
  if (!name) {
    return res.status(400).json({ error: 'Project name is required.' });
  }

  try {
    const result = await pool.query(
      'INSERT INTO projects (name, description, created_by) VALUES ($1, $2, $3) RETURNING *',
      [name, description, req.user.id]
    );
    
    await pool.query(
      'INSERT INTO team_members (project_id, user_id, role) VALUES ($1, $2, $3)',
      [result.rows[0].id, req.user.id, 'admin']
    );
    
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error.' });
  }
});

app.put('/api/projects/:id', authenticate, async (req, res) => {
  const { id } = req.params;
  const { name, description } = req.body;
  
  try {
    const project = await pool.query('SELECT created_by FROM projects WHERE id = $1', [id]);
    if (project.rows.length === 0) {
      return res.status(404).json({ error: 'Project not found.' });
    }
    
    if (req.user.role !== 'admin' && project.rows[0].created_by !== req.user.id) {
      return res.status(403).json({ error: 'Permission denied.' });
    }
    
    const result = await pool.query(
      'UPDATE projects SET name = $1, description = $2 WHERE id = $3 RETURNING *',
      [name, description, id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error.' });
  }
});

app.delete('/api/projects/:id', authenticate, async (req, res) => {
  const { id } = req.params;
  
  try {
    const project = await pool.query('SELECT created_by FROM projects WHERE id = $1', [id]);
    if (project.rows.length === 0) {
      return res.status(404).json({ error: 'Project not found.' });
    }
    
    if (req.user.role !== 'admin' && project.rows[0].created_by !== req.user.id) {
      return res.status(403).json({ error: 'Permission denied.' });
    }
    
    await pool.query('DELETE FROM projects WHERE id = $1', [id]);
    res.json({ message: 'Project deleted successfully.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// ========== Team Management Routes ==========
app.get('/api/projects/:projectId/team', authenticate, async (req, res) => {
  const { projectId } = req.params;
  
  try {
    const result = await pool.query(`
      SELECT u.id, u.email, u.name, u.role as global_role, tm.role as project_role, tm.joined_at
      FROM team_members tm
      JOIN users u ON tm.user_id = u.id
      WHERE tm.project_id = $1
    `, [projectId]);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error.' });
  }
});

app.post('/api/projects/:projectId/team', authenticate, async (req, res) => {
  const { projectId } = req.params;
  const { email, role } = req.body;
  
  try {
    const memberCheck = await pool.query(
      'SELECT role FROM team_members WHERE project_id = $1 AND user_id = $2',
      [projectId, req.user.id]
    );
    
    const isAdmin = req.user.role === 'admin' || (memberCheck.rows[0]?.role === 'admin');
    if (!isAdmin) {
      return res.status(403).json({ error: 'Admin permission required to add team members.' });
    }
    
    const userResult = await pool.query('SELECT id, name, email FROM users WHERE email = $1', [email]);
    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found.' });
    }
    
    const user = userResult.rows[0];
    
    const existing = await pool.query(
      'SELECT id FROM team_members WHERE project_id = $1 AND user_id = $2',
      [projectId, user.id]
    );
    
    if (existing.rows.length > 0) {
      return res.status(400).json({ error: 'User is already a team member.' });
    }
    
    await pool.query(
      'INSERT INTO team_members (project_id, user_id, role) VALUES ($1, $2, $3)',
      [projectId, user.id, role || 'member']
    );
    
    res.status(201).json({ message: 'Team member added successfully.', user });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error.' });
  }
});

app.delete('/api/projects/:projectId/team/:userId', authenticate, async (req, res) => {
  const { projectId, userId } = req.params;
  
  try {
    const memberCheck = await pool.query(
      'SELECT role FROM team_members WHERE project_id = $1 AND user_id = $2',
      [projectId, req.user.id]
    );
    
    const isAdmin = req.user.role === 'admin' || (memberCheck.rows[0]?.role === 'admin');
    if (!isAdmin) {
      return res.status(403).json({ error: 'Admin permission required to remove team members.' });
    }
    
    await pool.query(
      'DELETE FROM team_members WHERE project_id = $1 AND user_id = $2',
      [projectId, userId]
    );
    
    res.json({ message: 'Team member removed successfully.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// ========== Task Routes ==========
app.get('/api/tasks', authenticate, async (req, res) => {
  const { projectId, status } = req.query;
  
  try {
    let query = `
      SELECT t.*, 
             p.name as project_name,
             assigned.name as assigned_to_name,
             creator.name as created_by_name
      FROM tasks t
      JOIN projects p ON t.project_id = p.id
      LEFT JOIN users assigned ON t.assigned_to = assigned.id
      LEFT JOIN users creator ON t.created_by = creator.id
    `;
    
    const conditions = [];
    const params = [];
    
    if (req.user.role !== 'admin') {
      conditions.push(`
        (t.assigned_to = $${params.length + 1} OR p.id IN (
          SELECT project_id FROM team_members WHERE user_id = $${params.length + 1}
        ))
      `);
      params.push(req.user.id);
    }
    
    if (projectId) {
      conditions.push(`t.project_id = $${params.length + 1}`);
      params.push(projectId);
    }
    
    if (status) {
      conditions.push(`t.status = $${params.length + 1}`);
      params.push(status);
    }
    
    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }
    
    query += ' ORDER BY t.due_date ASC NULLS LAST, t.created_at DESC';
    
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error.' });
  }
});

app.post('/api/tasks', authenticate, async (req, res) => {
  const { title, description, status, priority, due_date, project_id, assigned_to } = req.body;
  
  if (!title || !project_id) {
    return res.status(400).json({ error: 'Title and project ID are required.' });
  }
  
  try {
    let hasAccess = false;
    if (req.user.role === 'admin') {
      hasAccess = true;
    } else {
      const memberCheck = await pool.query(
        'SELECT id FROM team_members WHERE project_id = $1 AND user_id = $2',
        [project_id, req.user.id]
      );
      hasAccess = memberCheck.rows.length > 0;
    }
    
    if (!hasAccess) {
      return res.status(403).json({ error: 'You do not have access to this project.' });
    }
    
    if (assigned_to) {
      const teamCheck = await pool.query(
        'SELECT id FROM team_members WHERE project_id = $1 AND user_id = $2',
        [project_id, assigned_to]
      );
      if (teamCheck.rows.length === 0) {
        return res.status(400).json({ error: 'Assigned user is not a team member of this project.' });
      }
    }
    
    const result = await pool.query(
      `INSERT INTO tasks (title, description, status, priority, due_date, project_id, assigned_to, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [title, description, status || 'pending', priority || 'medium', due_date, project_id, assigned_to || null, req.user.id]
    );
    
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error.' });
  }
});

app.put('/api/tasks/:id', authenticate, async (req, res) => {
  const { id } = req.params;
  const { title, description, status, priority, due_date, assigned_to } = req.body;
  
  try {
    const taskCheck = await pool.query(`
      SELECT t.*, p.created_by as project_creator
      FROM tasks t
      JOIN projects p ON t.project_id = p.id
      WHERE t.id = $1
    `, [id]);
    
    if (taskCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Task not found.' });
    }
    
    const task = taskCheck.rows[0];
    let canEdit = false;
    
    if (req.user.role === 'admin') {
      canEdit = true;
    } else if (task.created_by === req.user.id || task.assigned_to === req.user.id) {
      canEdit = true;
    } else {
      const memberCheck = await pool.query(
        'SELECT role FROM team_members WHERE project_id = $1 AND user_id = $2',
        [task.project_id, req.user.id]
      );
      if (memberCheck.rows[0]?.role === 'admin') {
        canEdit = true;
      }
    }
    
    if (!canEdit) {
      return res.status(403).json({ error: 'Permission denied.' });
    }
    
    const result = await pool.query(
      `UPDATE tasks SET title = COALESCE($1, title), description = COALESCE($2, description),
       status = COALESCE($3, status), priority = COALESCE($4, priority),
       due_date = COALESCE($5, due_date), assigned_to = COALESCE($6, assigned_to),
       updated_at = CURRENT_TIMESTAMP
       WHERE id = $7 RETURNING *`,
      [title, description, status, priority, due_date, assigned_to, id]
    );
    
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error.' });
  }
});

app.delete('/api/tasks/:id', authenticate, async (req, res) => {
  const { id } = req.params;
  
  try {
    const taskCheck = await pool.query(`
      SELECT t.*, p.created_by as project_creator
      FROM tasks t
      JOIN projects p ON t.project_id = p.id
      WHERE t.id = $1
    `, [id]);
    
    if (taskCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Task not found.' });
    }
    
    const task = taskCheck.rows[0];
    let canDelete = false;
    
    if (req.user.role === 'admin') {
      canDelete = true;
    } else if (task.created_by === req.user.id) {
      canDelete = true;
    } else {
      const memberCheck = await pool.query(
        'SELECT role FROM team_members WHERE project_id = $1 AND user_id = $2',
        [task.project_id, req.user.id]
      );
      if (memberCheck.rows[0]?.role === 'admin') {
        canDelete = true;
      }
    }
    
    if (!canDelete) {
      return res.status(403).json({ error: 'Permission denied.' });
    }
    
    await pool.query('DELETE FROM tasks WHERE id = $1', [id]);
    res.json({ message: 'Task deleted successfully.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// ========== Dashboard Stats ==========
app.get('/api/dashboard/stats', authenticate, async (req, res) => {
  try {
    let taskQuery = `
      SELECT 
        COUNT(*) as total_tasks,
        COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_tasks,
        COUNT(CASE WHEN status = 'in_progress' THEN 1 END) as in_progress_tasks,
        COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_tasks,
        COUNT(CASE WHEN due_date < CURRENT_DATE AND status != 'completed' THEN 1 END) as overdue_tasks
      FROM tasks t
      JOIN projects p ON t.project_id = p.id
    `;
    
    let params = [];
    
    if (req.user.role !== 'admin') {
      taskQuery += ` WHERE (t.assigned_to = $1 OR p.id IN (SELECT project_id FROM team_members WHERE user_id = $1))`;
      params = [req.user.id];
    }
    
    const taskStats = await pool.query(taskQuery, params);
    
    let projectQuery = 'SELECT COUNT(*) as total_projects FROM projects p';
    if (req.user.role !== 'admin') {
      projectQuery += ' WHERE p.id IN (SELECT project_id FROM team_members WHERE user_id = $1)';
      const projectStats = await pool.query(projectQuery, [req.user.id]);
      res.json({ ...taskStats.rows[0], ...projectStats.rows[0] });
    } else {
      const projectStats = await pool.query(projectQuery);
      res.json({ ...taskStats.rows[0], ...projectStats.rows[0] });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error.' });
  }
});

app.get('/api/users', authenticate, requireAdmin, async (req, res) => {
  try {
    const result = await pool.query('SELECT id, email, name, role, created_at FROM users ORDER BY created_at DESC');
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error.' });
  }
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});