// Admin Layout component - shared header/nav for admin pages

import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import './AdminLayout.css';

interface User {
  id: string;
  firstName: string;
  lastName: string;
  username: string;
  role: string;
}

interface AdminLayoutProps {
  children: React.ReactNode;
  title: string;
}

const AdminLayout: React.FC<AdminLayoutProps> = ({ children, title }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [user, setUser] = useState<User | null>(null);
  const { user: authUser, logout: authLogout } = useAuth();

  useEffect(() => {
    if (!authUser) {
      navigate('/login');
      return;
    }
    if (authUser.role !== 'admin') {
      navigate('/dashboard');
      return;
    }
    setUser(authUser as User);
  }, [authUser, navigate]);

  const handleLogout = () => {
    authLogout();
    navigate('/login');
  };

  const isActive = (path: string) => location.pathname === path;

  if (!user) {
    return (
      <div className="admin-layout">
        <div className="admin-loading">
          <div className="loading-spinner"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-layout">
      {/* Admin Header */}
      <header className="admin-header">
        <div className="admin-header-container">
          <Link to="/admin" className="admin-brand">
            <img src="/bearwood_lakes_logo.png" alt="Bearwood Lakes" className="brand-logo" />
            <span className="brand-text">Admin Panel</span>
          </Link>

          <div className="admin-header-actions">
            <Link to="/dashboard" className="back-to-app">
              ← Back to App
            </Link>
            <span className="admin-user">
              {user.firstName} <span className="admin-badge">Admin</span>
            </span>
            <button onClick={handleLogout} className="btn-logout">
              Logout
            </button>
          </div>
        </div>
      </header>

      <div className="admin-body">
        {/* Sidebar */}
        <aside className="admin-sidebar">
          <nav className="admin-nav">
            <Link
              to="/admin"
              className={`admin-nav-link ${isActive('/admin') ? 'active' : ''}`}
            >
              <span className="nav-icon">📊</span>
              Overview
            </Link>
            <Link
              to="/admin/golfers"
              className={`admin-nav-link ${isActive('/admin/golfers') ? 'active' : ''}`}
            >
              <span className="nav-icon">🏌️</span>
              Golfers
            </Link>
            <Link
              to="/admin/tournaments"
              className={`admin-nav-link ${isActive('/admin/tournaments') ? 'active' : ''}`}
            >
              <span className="nav-icon">🏆</span>
              Tournaments
            </Link>
            <Link
              to="/admin/scores"
              className={`admin-nav-link ${isActive('/admin/scores') ? 'active' : ''}`}
            >
              <span className="nav-icon">📝</span>
              Scores
            </Link>
            <Link
              to="/admin/seasons"
              className={`admin-nav-link ${isActive('/admin/seasons') ? 'active' : ''}`}
            >
              <span className="nav-icon">📅</span>
              Seasons
            </Link>
            <Link
              to="/admin/users"
              className={`admin-nav-link ${isActive('/admin/users') ? 'active' : ''}`}
            >
              <span className="nav-icon">👥</span>
              Users
            </Link>

            <div className="nav-divider" />

            <Link
              to="/admin/season-upload"
              className={`admin-nav-link ${isActive('/admin/season-upload') ? 'active' : ''}`}
            >
              <span className="nav-icon">📤</span>
              Season Upload
            </Link>
            <Link
              to="/admin/settings"
              className={`admin-nav-link ${isActive('/admin/settings') ? 'active' : ''}`}
            >
              <span className="nav-icon">⚙️</span>
              Settings
            </Link>
          </nav>
        </aside>

        {/* Main Content */}
        <main className="admin-main">
          <div className="admin-page-header">
            <h1>{title}</h1>
          </div>
          <div className="admin-content">{children}</div>
        </main>
      </div>
    </div>
  );
};

export default AdminLayout;
