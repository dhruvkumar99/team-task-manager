import React, { useState, useEffect, createContext, useContext } from 'react';
import { BrowserRouter, Routes, Route, Navigate, Link, useNavigate } from 'react-router-dom';

// Use environment variable for API URL (works on both local and Railway)
const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';

// Auth Context
const AuthContext = createContext(null);
const useAuth = () => useContext(AuthContext);

// Auth Provider
const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [token, setToken] = useState(localStorage.getItem('token'));

  useEffect(() => {
    if (token) {
      try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        setUser({ id: payload.userId, ...payload });
      } catch (e) {
        console.error('Invalid token');
      }
    }
    setLoading(false);
  }, [token]);

  const login = async (email, password) => {
    try {
      const res = await fetch(`${API_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      const data = await res.json();
      if (res.ok) {
        localStorage.setItem('token', data.token);
        setToken(data.token);
        setUser(data.user);
        return { success: true };
      }
      return { success: false, error: data.error };
    } catch (error) {
      return { success: false, error: 'Cannot connect to server' };
    }
  };

  const signup = async (email, password, name) => {
    try {
      const res = await fetch(`${API_URL}/auth/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, name })
      });
      const data = await res.json();
      if (res.ok) {
        localStorage.setItem('token', data.token);
        setToken(data.token);
        setUser(data.user);
        return { success: true };
      }
      return { success: false, error: data.error };
    } catch (error) {
      return { success: false, error: 'Cannot connect to server' };
    }
  };

  const logout = () => {
    localStorage.removeItem('token');
    setToken(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, login, signup, logout, token, loading }}>
      {children}
    </AuthContext.Provider>
  );
};

// Protected Route
const ProtectedRoute = ({ children }) => {
  const { user, loading } = useAuth();
  if (loading) return <LoadingSpinner />;
  if (!user) return <Navigate to="/login" />;
  return children;
};

// Loading Spinner
const LoadingSpinner = () => (
  <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-50 flex items-center justify-center">
    <div className="text-center">
      <div className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
      <p className="text-gray-600">Loading...</p>
    </div>
  </div>
);

// Sidebar Component
const Sidebar = ({ isOpen, setIsOpen, currentPage, setCurrentPage }) => {
  const { user, logout } = useAuth();
  
  const menuItems = [
    { id: 'dashboard', label: 'Dashboard', icon: '📊', path: '/dashboard' },
    { id: 'projects', label: 'Projects', icon: '📁', path: '/projects' },
    { id: 'tasks', label: 'Tasks', icon: '✅', path: '/tasks' },
  ];

  return (
    <>
      {isOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-20 lg:hidden" onClick={() => setIsOpen(false)} />
      )}
      
      <div className={`fixed left-0 top-0 h-full bg-gradient-to-b from-indigo-900 to-purple-900 text-white z-30 transition-all duration-300 ${isOpen ? 'w-64' : 'w-20'} lg:w-64`}>
        <div className="p-6 flex items-center justify-between border-b border-indigo-700">
          <div className={`flex items-center space-x-2 ${!isOpen && 'lg:hidden'}`}>
            <span className="text-2xl">🎯</span>
            <span className="font-bold text-xl">TaskFlow</span>
          </div>
          <button onClick={() => setIsOpen(!isOpen)} className="lg:hidden">
            {isOpen ? '✕' : '☰'}
          </button>
        </div>
        
        <nav className="mt-8">
          {menuItems.map((item) => (
            <Link
              key={item.id}
              to={item.path}
              onClick={() => setCurrentPage(item.id)}
              className={`flex items-center space-x-3 px-6 py-3 mx-3 rounded-lg transition-all duration-200 ${
                currentPage === item.id 
                  ? 'bg-indigo-600 shadow-lg' 
                  : 'hover:bg-indigo-800'
              }`}
            >
              <span className="text-xl">{item.icon}</span>
              <span className={`${!isOpen && 'lg:hidden'} transition-all`}>{item.label}</span>
            </Link>
          ))}
        </nav>
        
        <div className="absolute bottom-0 left-0 right-0 p-6 border-t border-indigo-700">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-full bg-indigo-600 flex items-center justify-center text-xl">
              👤
            </div>
            <div className={`flex-1 ${!isOpen && 'lg:hidden'}`}>
              <p className="font-semibold text-sm">{user?.name}</p>
              <p className="text-xs text-indigo-300">{user?.role}</p>
            </div>
            <button onClick={logout} className={`p-2 hover:bg-indigo-800 rounded-lg transition text-lg ${!isOpen && 'lg:hidden'}`}>
              🚪
            </button>
          </div>
        </div>
      </div>
    </>
  );
};

// Stat Card
const StatCard = ({ title, value, icon, color }) => (
  <div className="bg-white rounded-2xl shadow-sm hover:shadow-md transition-all duration-300 p-6 border border-gray-100">
    <div className="flex justify-between items-start">
      <div>
        <p className="text-gray-500 text-sm mb-1">{title}</p>
        <p className="text-3xl font-bold text-gray-800">{value}</p>
      </div>
      <div className={`p-3 rounded-xl ${color} text-2xl`}>
        {icon}
      </div>
    </div>
  </div>
);

// Login Page
const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    const result = await login(email, password);
    setLoading(false);
    if (result.success) {
      navigate('/dashboard');
    } else {
      setError(result.error);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-900 via-purple-900 to-pink-900 flex items-center justify-center p-4">
      <div className="max-w-md w-full">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-white/10 mb-4 text-3xl">
            🎯
          </div>
          <h1 className="text-4xl font-bold text-white mb-2">TaskFlow</h1>
          <p className="text-indigo-200">Team Task Management Made Simple</p>
        </div>
        
        <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-8 shadow-xl">
          <h2 className="text-2xl font-bold text-white mb-6">Welcome Back</h2>
          
          {error && (
            <div className="bg-red-500/20 border border-red-500 text-red-200 p-3 rounded-lg mb-4">
              {error}
            </div>
          )}
          
          <form onSubmit={handleSubmit}>
            <div className="mb-4">
              <label className="block text-indigo-200 mb-2 text-sm">Email Address</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-indigo-300">📧</span>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 bg-white/20 border border-indigo-300 rounded-lg text-white placeholder-indigo-300 focus:outline-none focus:ring-2 focus:ring-white"
                  placeholder="admin@example.com"
                  required
                />
              </div>
            </div>
            
            <div className="mb-6">
              <label className="block text-indigo-200 mb-2 text-sm">Password</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-indigo-300">🔒</span>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 bg-white/20 border border-indigo-300 rounded-lg text-white placeholder-indigo-300 focus:outline-none focus:ring-2 focus:ring-white"
                  placeholder="••••••••"
                  required
                />
              </div>
            </div>
            
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-white text-indigo-900 py-3 rounded-lg font-semibold hover:bg-indigo-50 transition-all duration-200 disabled:opacity-50"
            >
              {loading ? <div className="w-5 h-5 border-2 border-indigo-900 border-t-transparent rounded-full animate-spin mx-auto"></div> : 'Sign In'}
            </button>
          </form>
          
          <p className="text-center text-indigo-200 text-sm mt-6">
            Demo: admin@example.com / admin123
          </p>
        </div>
      </div>
    </div>
  );
};

// Dashboard Page
const Dashboard = () => {
  const [stats, setStats] = useState({});
  const [recentTasks, setRecentTasks] = useState([]);
  const { token } = useAuth();

  useEffect(() => {
    fetchStats();
    fetchRecentTasks();
  }, []);

  const fetchStats = async () => {
    try {
      const res = await fetch(`${API_URL}/dashboard/stats`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      setStats(data);
    } catch (error) {
      console.error('Error:', error);
    }
  };

  const fetchRecentTasks = async () => {
    try {
      const res = await fetch(`${API_URL}/tasks`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      setRecentTasks(data.slice(0, 6));
    } catch (error) {
      console.error('Error:', error);
    }
  };

  const updateTaskStatus = async (taskId, newStatus) => {
    try {
      await fetch(`${API_URL}/tasks/${taskId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ status: newStatus })
      });
      fetchRecentTasks();
      fetchStats();
    } catch (error) {
      console.error('Error:', error);
    }
  };

  const statCards = [
    { title: 'Total Projects', value: stats.total_projects || 0, icon: '📁', color: 'bg-gradient-to-r from-blue-500 to-blue-600' },
    { title: 'Total Tasks', value: stats.total_tasks || 0, icon: '✅', color: 'bg-gradient-to-r from-purple-500 to-purple-600' },
    { title: 'Completed', value: stats.completed_tasks || 0, icon: '✔️', color: 'bg-gradient-to-r from-green-500 to-green-600' },
    { title: 'In Progress', value: stats.in_progress_tasks || 0, icon: '🔄', color: 'bg-gradient-to-r from-yellow-500 to-yellow-600' },
    { title: 'Pending', value: stats.pending_tasks || 0, icon: '⏳', color: 'bg-gradient-to-r from-orange-500 to-orange-600' },
    { title: 'Overdue', value: stats.overdue_tasks || 0, icon: '⚠️', color: 'bg-gradient-to-r from-red-500 to-red-600' },
  ];

  return (
    <div className="p-6">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-800">Dashboard</h1>
        <p className="text-gray-500 mt-1">Welcome back! Here's what's happening with your projects.</p>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-6 mb-8">
        {statCards.map((stat, index) => (
          <StatCard key={index} {...stat} />
        ))}
      </div>
      
      <div className="mb-8">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-bold text-gray-800">Recent Tasks</h2>
          <Link to="/tasks" className="text-indigo-600 hover:text-indigo-700 text-sm font-medium">
            View All Tasks →
          </Link>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {recentTasks.map(task => (
            <div key={task.id} className="bg-white rounded-xl shadow-sm hover:shadow-md transition-all duration-300 p-5 border border-gray-100">
              <div className="flex items-start justify-between mb-3">
                <div className="flex-1">
                  <h3 className="font-semibold text-gray-800 mb-1">{task.title}</h3>
                  <p className="text-sm text-gray-500">{task.project_name}</p>
                </div>
              </div>
              
              {task.description && (
                <p className="text-sm text-gray-600 mb-3 line-clamp-2">{task.description}</p>
              )}
              
              <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-100">
                <div className="flex items-center space-x-3 text-xs text-gray-500">
                  {task.due_date && (
                    <div className="flex items-center space-x-1">
                      <span>📅</span>
                      <span>{new Date(task.due_date).toLocaleDateString()}</span>
                    </div>
                  )}
                </div>
                
                <select
                  value={task.status || 'pending'}
                  onChange={(e) => updateTaskStatus(task.id, e.target.value)}
                  className="text-sm border rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="pending">Pending</option>
                  <option value="in_progress">In Progress</option>
                  <option value="completed">Completed</option>
                </select>
              </div>
            </div>
          ))}
          {recentTasks.length === 0 && (
            <div className="col-span-3 text-center py-12 bg-white rounded-xl">
              <div className="text-5xl mb-3">✅</div>
              <p className="text-gray-500">No tasks yet. Create your first task!</p>
            </div>
          )}
        </div>
      </div>
      
      <div className="bg-gradient-to-r from-indigo-600 to-purple-600 rounded-2xl p-8 text-white">
        <div className="flex flex-col md:flex-row justify-between items-center">
          <div className="mb-4 md:mb-0">
            <h3 className="text-2xl font-bold mb-2">Ready to boost productivity?</h3>
            <p className="text-indigo-100">Create a new project and start assigning tasks to your team.</p>
          </div>
          <Link
            to="/projects"
            className="bg-white text-indigo-600 px-6 py-3 rounded-lg font-semibold hover:bg-indigo-50 transition-all duration-200"
          >
            + New Project
          </Link>
        </div>
      </div>
    </div>
  );
};

// Projects Page
const Projects = () => {
  const [projects, setProjects] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [newProject, setNewProject] = useState({ name: '', description: '' });
  const { token } = useAuth();

  useEffect(() => {
    fetchProjects();
  }, []);

  const fetchProjects = async () => {
    try {
      const res = await fetch(`${API_URL}/projects`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      setProjects(data);
    } catch (error) {
      console.error('Error:', error);
    }
  };

  const createProject = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch(`${API_URL}/projects`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(newProject)
      });
      if (res.ok) {
        setShowModal(false);
        setNewProject({ name: '', description: '' });
        fetchProjects();
      }
    } catch (error) {
      console.error('Error:', error);
    }
  };

  const getProjectColor = (id) => {
    const colors = [
      'from-blue-500 to-blue-600',
      'from-purple-500 to-purple-600',
      'from-green-500 to-green-600',
      'from-orange-500 to-orange-600',
    ];
    return colors[id % colors.length];
  };

  return (
    <div className="p-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-800">Projects</h1>
          <p className="text-gray-500 mt-1">Manage all your projects in one place</p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="mt-4 md:mt-0 bg-gradient-to-r from-indigo-600 to-purple-600 text-white px-6 py-3 rounded-xl font-semibold hover:shadow-lg transition-all duration-200 flex items-center space-x-2"
        >
          <span>➕</span>
          <span>New Project</span>
        </button>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {projects.map((project, index) => (
          <div key={project.id} className="bg-white rounded-2xl shadow-sm hover:shadow-xl transition-all duration-300 overflow-hidden group">
            <div className={`h-2 bg-gradient-to-r ${getProjectColor(index)}`} />
            <div className="p-6">
              <h3 className="text-xl font-bold text-gray-800 mb-2">{project.name}</h3>
              <p className="text-gray-600 mb-4 line-clamp-2">{project.description || 'No description provided'}</p>
              <div className="flex items-center justify-between pt-4 border-t border-gray-100">
                <div className="flex items-center space-x-2 text-sm text-gray-500">
                  <span>👥</span>
                  <span>{project.member_count || 1} members</span>
                </div>
                <Link
                  to={`/tasks?projectId=${project.id}`}
                  className="text-indigo-600 hover:text-indigo-700 text-sm font-medium flex items-center space-x-1"
                >
                  <span>View Tasks</span>
                  <span>→</span>
                </Link>
              </div>
            </div>
          </div>
        ))}
      </div>
      
      {projects.length === 0 && (
        <div className="text-center py-12 bg-white rounded-2xl">
          <div className="text-6xl mb-4">📁</div>
          <p className="text-gray-500 mb-4">No projects yet</p>
          <button
            onClick={() => setShowModal(true)}
            className="text-indigo-600 hover:text-indigo-700 font-medium"
          >
            Create your first project →
          </button>
        </div>
      )}
      
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6">
            <h2 className="text-2xl font-bold mb-4">Create New Project</h2>
            <form onSubmit={createProject}>
              <div className="mb-4">
                <label className="block text-gray-700 mb-2 font-medium">Project Name</label>
                <input
                  type="text"
                  value={newProject.name}
                  onChange={(e) => setNewProject({ ...newProject, name: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="Enter project name"
                  required
                />
              </div>
              <div className="mb-6">
                <label className="block text-gray-700 mb-2 font-medium">Description</label>
                <textarea
                  value={newProject.description}
                  onChange={(e) => setNewProject({ ...newProject, description: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  rows="4"
                  placeholder="Enter project description"
                />
              </div>
              <div className="flex justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-lg hover:shadow-lg transition"
                >
                  Create Project
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

// Tasks Page
const Tasks = () => {
  const [tasks, setTasks] = useState([]);
  const [filter, setFilter] = useState('all');
  const { token } = useAuth();

  useEffect(() => {
    fetchTasks();
  }, []);

  const fetchTasks = async () => {
    try {
      const res = await fetch(`${API_URL}/tasks`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      setTasks(data);
    } catch (error) {
      console.error('Error:', error);
    }
  };

  const updateTaskStatus = async (taskId, newStatus) => {
    try {
      await fetch(`${API_URL}/tasks/${taskId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ status: newStatus })
      });
      fetchTasks();
    } catch (error) {
      console.error('Error:', error);
    }
  };

  const filteredTasks = tasks.filter(task => {
    if (filter === 'all') return true;
    return task.status === filter;
  });

  const getStatusBadge = (status) => {
    const badges = {
      pending: 'bg-yellow-100 text-yellow-700',
      in_progress: 'bg-blue-100 text-blue-700',
      completed: 'bg-green-100 text-green-700'
    };
    return badges[status] || 'bg-gray-100 text-gray-700';
  };

  return (
    <div className="p-6">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-800">Tasks</h1>
        <p className="text-gray-500 mt-1">Track and manage all your tasks</p>
      </div>
      
      <div className="flex space-x-2 mb-6">
        {['all', 'pending', 'in_progress', 'completed'].map(status => (
          <button
            key={status}
            onClick={() => setFilter(status)}
            className={`px-4 py-2 rounded-lg capitalize transition-all duration-200 ${
              filter === status
                ? 'bg-indigo-600 text-white shadow-md'
                : 'bg-white text-gray-600 hover:bg-gray-50'
            }`}
          >
            {status.replace('_', ' ')}
          </button>
        ))}
      </div>
      
      <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-4 text-left text-sm font-semibold text-gray-600">Task</th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-gray-600">Project</th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-gray-600">Status</th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-gray-600">Priority</th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-gray-600">Due Date</th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-gray-600">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredTasks.map(task => (
                <tr key={task.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-4">
                    <p className="font-medium text-gray-800">{task.title}</p>
                  </td>
                  <td className="px-6 py-4 text-gray-600">{task.project_name}</td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusBadge(task.status)}`}>
                      {task.status?.replace('_', ' ') || 'pending'}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                      task.priority === 'high' ? 'bg-red-100 text-red-700' :
                      task.priority === 'medium' ? 'bg-yellow-100 text-yellow-700' :
                      'bg-green-100 text-green-700'
                    }`}>
                      {task.priority || 'medium'}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-gray-600">
                    {task.due_date ? new Date(task.due_date).toLocaleDateString() : 'No date'}
                  </td>
                  <td className="px-6 py-4">
                    <select
                      value={task.status || 'pending'}
                      onChange={(e) => updateTaskStatus(task.id, e.target.value)}
                      className="border border-gray-300 rounded-lg px-3 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    >
                      <option value="pending">Pending</option>
                      <option value="in_progress">In Progress</option>
                      <option value="completed">Completed</option>
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      
      {filteredTasks.length === 0 && (
        <div className="text-center py-12 bg-white rounded-2xl mt-6">
          <div className="text-5xl mb-3">✅</div>
          <p className="text-gray-500">No tasks found</p>
        </div>
      )}
    </div>
  );
};

// Main App Layout
const AppLayout = () => {
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [currentPage, setCurrentPage] = useState('dashboard');
  
  const renderPage = () => {
    switch(currentPage) {
      case 'dashboard': return <Dashboard />;
      case 'projects': return <Projects />;
      case 'tasks': return <Tasks />;
      default: return <Dashboard />;
    }
  };
  
  return (
    <div className="min-h-screen bg-gray-50">
      <Sidebar isOpen={isSidebarOpen} setIsOpen={setIsSidebarOpen} currentPage={currentPage} setCurrentPage={setCurrentPage} />
      <div className={`transition-all duration-300 ${isSidebarOpen ? 'lg:ml-64' : 'lg:ml-20'}`}>
        {renderPage()}
      </div>
    </div>
  );
};

// Main App
function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/dashboard/*" element={
            <ProtectedRoute>
              <AppLayout />
            </ProtectedRoute>
          } />
          <Route path="/projects/*" element={
            <ProtectedRoute>
              <AppLayout />
            </ProtectedRoute>
          } />
          <Route path="/tasks/*" element={
            <ProtectedRoute>
              <AppLayout />
            </ProtectedRoute>
          } />
          <Route path="/" element={<Navigate to="/dashboard" />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;