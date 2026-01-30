// Shared page layout component with header and footer

import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import './PageLayout.css';

interface User {
  id: string;
  firstName: string;
  lastName: string;
  username: string;
  role: string;
}

type NavItem = 'dashboard' | 'my-team' | 'golfers' | 'leaderboard' | 'users' | 'tournaments' | 'profile';

interface PageLayoutProps {
  children: React.ReactNode;
  activeNav?: NavItem;
}

const PageLayout: React.FC<PageLayoutProps> = ({ children, activeNav }) => {
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);
  const { user: authUser, logout: authLogout } = useAuth();

  useEffect(() => {
    if (!authUser) {
      navigate('/login');
      return;
    }
    setUser(authUser as User);
  }, [authUser, navigate]);

  const handleLogout = () => {
    authLogout();
    navigate('/login');
  };

  if (!user) {
    return (
      <div className="page-layout">
        <div className="page-loading">
          <div className="loading-spinner"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="page-layout">
      {/* Header */}
      <header className="page-header">
        <div className="header-container">
          <Link to="/dashboard" className="header-brand">
            <img src="/bearwood_lakes_logo.png" alt="Bearwood Lakes" className="brand-logo" />
            <span className="brand-text">Bearwood Lakes Fantasy</span>
          </Link>

          <nav className="header-nav">
            <Link 
              to="/dashboard" 
              className={`nav-link ${activeNav === 'dashboard' ? 'active' : ''}`}
            >
              Dashboard
            </Link>
            <Link 
              to="/my-team" 
              className={`nav-link ${activeNav === 'my-team' ? 'active' : ''}`}
            >
              My Team
            </Link>
            <Link 
              to="/golfers" 
              className={`nav-link ${activeNav === 'golfers' ? 'active' : ''}`}
            >
              Golfers
            </Link>
            <Link 
              to="/leaderboard" 
              className={`nav-link ${activeNav === 'leaderboard' ? 'active' : ''}`}
            >
              Leaderboard
            </Link>
            <Link 
              to="/users" 
              className={`nav-link ${activeNav === 'users' ? 'active' : ''}`}
            >
              Users
            </Link>
          </nav>

          <div className="header-user">
            <Link to="/profile" className="user-greeting-link">
              Hi, <strong>{user.firstName}</strong>
            </Link>
            <button onClick={handleLogout} className="btn-logout">
              Logout
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="page-main">
        {children}
      </main>

      {/* Footer */}
      <footer className="page-footer">
        <div className="footer-container">
          <div className="footer-brand">
            <img src="/bearwood_lakes_logo.png" alt="Bearwood Lakes" className="footer-logo-img" />
            <span>Bearwood Lakes Fantasy Golf</span>
          </div>
          <div className="footer-links">
            <Link to="/dashboard">Dashboard</Link>
            <Link to="/my-team">My Team</Link>
            <Link to="/leaderboard">Leaderboard</Link>
            {user.role === 'admin' && (
              <Link to="/admin" className="footer-admin-link">
                Admin Panel
              </Link>
            )}
            <button onClick={handleLogout} className="footer-logout">
              Logout
            </button>
          </div>
          <div className="footer-copyright">
            © 2026 Bearwood Lakes Golf Club
          </div>
        </div>
      </footer>
    </div>
  );
};

export default PageLayout;
