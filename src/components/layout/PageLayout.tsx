// Shared page layout component with header and footer

import React, { useEffect, useState, useRef, useCallback } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import './PageLayout.css';

interface User {
  id: string;
  firstName: string;
  lastName: string;
  username: string;
  role: string;
}

type NavItem =
  | 'dashboard'
  | 'my-team'
  | 'golfers'
  | 'leaderboard'
  | 'users'
  | 'tournaments'
  | 'scoring'
  | 'profile';

interface PageLayoutProps {
  children: React.ReactNode;
  activeNav?: NavItem;
}

const PageLayout: React.FC<PageLayoutProps> = ({ children, activeNav }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [user, setUser] = useState<User | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [navCollapsed, setNavCollapsed] = useState(false);
  const { user: authUser, logout: authLogout } = useAuth();

  const headerRef = useRef<HTMLDivElement>(null);
  const navRef = useRef<HTMLElement>(null);
  const brandRef = useRef<HTMLAnchorElement>(null);
  const userRef = useRef<HTMLDivElement>(null);

  // Detect when nav content overflows the header and toggle burger menu
  const checkNavOverflow = useCallback(() => {
    const header = headerRef.current;
    const nav = navRef.current;
    const brand = brandRef.current;
    const userSection = userRef.current;
    if (!header || !nav || !brand || !userSection) return;

    const headerWidth = header.clientWidth;
    const padding = 48; // 1.5rem × 2
    const gaps = 32; // grid gaps
    const contentWidth =
      brand.scrollWidth + nav.scrollWidth + userSection.scrollWidth + padding + gaps;
    const shouldCollapse = contentWidth > headerWidth;
    setNavCollapsed((prev) => (prev !== shouldCollapse ? shouldCollapse : prev));
  }, []);

  useEffect(() => {
    const header = headerRef.current;
    if (!header) return;

    const observer = new ResizeObserver(checkNavOverflow);
    observer.observe(header);
    checkNavOverflow();

    return () => observer.disconnect();
  }, [checkNavOverflow]);

  // Close mobile menu when route changes
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location.pathname]);

  // Close mobile menu on escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMobileMenuOpen(false);
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, []);

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
      <header className={`page-header ${navCollapsed ? 'nav-collapsed' : ''}`}>
        <div className="header-container" ref={headerRef}>
          <Link to="/dashboard" className="header-brand" ref={brandRef}>
            <img
              src="/bearwood_lakes_logo.png"
              alt="Bearwood Lakes"
              className="brand-logo"
              width="69"
              height="36"
            />
            <span className="brand-text">Bearwood Lakes Fantasy</span>
          </Link>

          <nav className="header-nav" ref={navRef}>
            <Link
              to="/dashboard"
              className={`nav-link ${activeNav === 'dashboard' ? 'active' : ''}`}
            >
              Dashboard
            </Link>
            <Link to="/my-team" className={`nav-link ${activeNav === 'my-team' ? 'active' : ''}`}>
              My Team
            </Link>
            <Link to="/golfers" className={`nav-link ${activeNav === 'golfers' ? 'active' : ''}`}>
              Golfers
            </Link>
            <Link
              to="/leaderboard"
              className={`nav-link ${activeNav === 'leaderboard' ? 'active' : ''}`}
            >
              Leaderboard
            </Link>
            <Link to="/users" className={`nav-link ${activeNav === 'users' ? 'active' : ''}`}>
              Users
            </Link>
            <Link
              to="/tournaments"
              className={`nav-link ${activeNav === 'tournaments' ? 'active' : ''}`}
            >
              Tournaments
            </Link>
            <Link
              to="/scoring"
              className={`nav-link ${activeNav === 'scoring' ? 'active' : ''}`}
            >
              Rules
            </Link>
          </nav>

          <div className="header-user" ref={userRef}>
            <Link to="/profile" className="user-greeting-link">
              Hi, <strong>{user.firstName}</strong>
            </Link>
            <button onClick={handleLogout} className="btn-logout">
              Logout
            </button>
          </div>

          {/* Mobile Menu Button */}
          <button
            className="mobile-menu-btn"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-expanded={mobileMenuOpen}
            aria-controls="mobile-nav"
            aria-label={mobileMenuOpen ? 'Close menu' : 'Open menu'}
          >
            <span className={`hamburger ${mobileMenuOpen ? 'open' : ''}`}>
              <span></span>
              <span></span>
              <span></span>
            </span>
          </button>
        </div>
      </header>

      {/* Mobile Menu Overlay */}
      <div
        className={`mobile-menu-overlay ${mobileMenuOpen ? 'active' : ''}`}
        onClick={() => setMobileMenuOpen(false)}
      />

      {/* Mobile Menu Panel */}
      <nav
        id="mobile-nav"
        className={`mobile-menu ${mobileMenuOpen ? 'open' : ''}`}
        aria-hidden={!mobileMenuOpen}
      >
        <div className="mobile-menu-header">
          <span className="mobile-user-greeting">Hi, {user.firstName}</span>
        </div>
        <div className="mobile-menu-links">
          <Link
            to="/dashboard"
            className={`mobile-nav-link ${activeNav === 'dashboard' ? 'active' : ''}`}
          >
            Dashboard
          </Link>
          <Link
            to="/my-team"
            className={`mobile-nav-link ${activeNav === 'my-team' ? 'active' : ''}`}
          >
            My Team
          </Link>
          <Link
            to="/golfers"
            className={`mobile-nav-link ${activeNav === 'golfers' ? 'active' : ''}`}
          >
            Golfers
          </Link>
          <Link
            to="/leaderboard"
            className={`mobile-nav-link ${activeNav === 'leaderboard' ? 'active' : ''}`}
          >
            Leaderboard
          </Link>
          <Link
            to="/tournaments"
            className={`mobile-nav-link ${activeNav === 'tournaments' ? 'active' : ''}`}
          >
            Tournaments
          </Link>
          <Link to="/users" className={`mobile-nav-link ${activeNav === 'users' ? 'active' : ''}`}>
            Users
          </Link>
          <Link
            to="/scoring"
            className={`mobile-nav-link ${activeNav === 'scoring' ? 'active' : ''}`}
          >
            Rules
          </Link>
          {user.role === 'admin' && (
            <Link to="/admin" className="mobile-nav-link mobile-nav-admin">
              Admin
            </Link>
          )}
        </div>
        <div className="mobile-menu-footer">
          <button onClick={handleLogout} className="mobile-logout-btn">
            Sign Out
          </button>
        </div>
      </nav>

      {/* Main Content */}
      <main className="page-main">{children}</main>

      {/* Footer */}
      <footer className="page-footer">
        <div className="footer-container">
          <div className="footer-brand">
            <img
              src="/bearwood_lakes_logo.png"
              alt="Bearwood Lakes"
              className="footer-logo-img"
              width="54"
              height="28"
            />
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
          <div className="footer-copyright">© 2026 Bearwood Lakes Golf Club</div>
        </div>
      </footer>
    </div>
  );
};

export default PageLayout;
