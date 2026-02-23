// Public Home page - Bearwood Lakes Fantasy Golf

import React from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import './HomePage.css';

const HomePage: React.FC = () => {
  const currentYear = new Date().getFullYear();
  const { user, isAuthenticated } = useAuth();
  useDocumentTitle('Home');

  return (
    <main className="home-page">
      {/* Top Navigation */}
      <nav className="top-nav">
        <div className="nav-brand">
          <img
            src="/bearwood_lakes_logo.png"
            alt="Bearwood Lakes Fantasy"
            className="nav-logo-img"
            width="69"
            height="36"
          />
          <span className="nav-title">Bearwood Lakes Fantasy</span>
        </div>
        <div className="nav-links">
          {isAuthenticated ? (
            <>
              <Link to="/dashboard" className="nav-link">
                Dashboard
              </Link>
              <Link to="/scoring" className="nav-link">
                Rules
              </Link>
              <span className="nav-user">Hi, {user?.firstName}</span>
            </>
          ) : (
            <>
              <Link to="/login" className="nav-link">
                Sign In
              </Link>
              <Link to="/register" className="nav-link nav-link-primary">
                Join Now
              </Link>
            </>
          )}
        </div>
      </nav>

      {/* Hero Section */}
      <header className="hero">
        <video
          className="hero-video"
          autoPlay
          muted
          loop
          playsInline
          preload="auto"
        >
          <source src="/video.mp4" type="video/mp4" />
        </video>
        <div className="hero-overlay" />
        <div className="hero-content">
          <div className="logo-badge animate-fade-in">
            <img
              src="/bearwood_lakes_logo.png"
              alt="Bearwood Lakes"
              className="logo-icon-img"
              width="70"
              height="70"
            />
          </div>
          <h1 className="hero-title animate-fade-in animate-delay-1">
            Bearwood Lakes
            <span className="hero-subtitle">Fantasy Golf</span>
          </h1>
          <p className="hero-tagline animate-fade-in animate-delay-2">
            Think you know Bearwood Lakes? Think you know the members? Prove it by battling it out
            in the Bearwood Lakes 2026 Fantasy Golf League.{' '}
          </p>
          <div className="hero-cta animate-fade-in animate-delay-3">
            <Link to="/register" className="btn btn-primary btn-lg">
              Join the Competition
            </Link>
            <Link to="/login" className="btn btn-secondary btn-lg">
              Sign In
            </Link>
          </div>
          <p className="hero-members animate-fade-in animate-delay-4">
            🏆 {currentYear} Season Now Open
          </p>
        </div>
        <div className="hero-scroll-indicator">
          <span>Scroll to learn more</span>
          <div className="scroll-arrow">↓</div>
        </div>
      </header>

      {/* How It Works Section */}
      <section className="how-it-works">
        <div className="container">
          <h2 className="section-title">How It Works</h2>
          <p className="section-subtitle">Three simple steps to fantasy golf glory</p>

          <div className="steps-grid">
            <div className="step-card">
              <div className="step-number">1</div>
              <div className="step-icon">💰</div>
              <h3>Build Your Team</h3>
              <p>
                You have <strong>$50 million</strong> to assemble your dream team of{' '}
                <strong>6 professional golfers</strong>. Choose wisely – budget management is key!
              </p>
            </div>

            <div className="step-card">
              <div className="step-number">2</div>
              <div className="step-icon">📊</div>
              <h3>Score Points</h3>
              <p>
                Your team earns points based on real tournament performances. Eagles, birdies, top
                finishes – it all counts towards your total.
              </p>
            </div>

            <div className="step-card">
              <div className="step-number">3</div>
              <div className="step-icon">🏆</div>
              <h3>Climb the Leaderboard</h3>
              <p>
                Compete against fellow Bearwood members throughout the season. Bragging rights and
                glory await the champion!
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Rules Section */}
      <section className="rules-section">
        <div className="container">
          <div className="rules-content">
            <div className="rules-text">
              <h2 className="section-title">The Rules</h2>
              <ul className="rules-list">
                <li>
                  <span className="rule-icon">�</span>
                  <div>
                    <strong>$50M Budget</strong>
                    <p>Spend wisely across your 6 picks – no going over budget!</p>
                  </div>
                </li>
                <li>
                  <span className="rule-icon">👥</span>
                  <div>
                    <strong>Exactly 6 golfers</strong>
                    <p>No more, no less. Every roster spot matters.</p>
                  </div>
                </li>
                <li>
                  <span className="rule-icon">🔒</span>
                  <div>
                    <strong>Transfer Windows</strong>
                    <p>Transfers lock before each major tournament. Plan ahead!</p>
                  </div>
                </li>
                <li>
                  <span className="rule-icon">⚡</span>
                  <div>
                    <strong>Live Scoring</strong>
                    <p>Watch your points update as the action unfolds.</p>
                  </div>
                </li>
              </ul>
            </div>
            <div className="rules-visual">
              <div className="trophy-display">
                <span className="big-trophy">🏆</span>
                <p className="trophy-text">
                  Will you be the {currentYear} Bearwood Lakes Fantasy Champion?
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Trash Talk Section */}
      <section className="fun-section">
        <div className="container">
          <div className="fun-content">
            <h2 className="fun-title">⚠️ Fair Warning ⚠️</h2>
            <p className="fun-text">
              This game has been known to cause heated debates at the 19th hole, questionable
              predictions, and sudden expertise in golfers you've never heard of.
            </p>
            <div className="fun-quotes">
              <div className="quote">
                "I <em>definitely</em> meant to pick him before he won..."
                <span className="quote-author">— Every member, ever</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="final-cta">
        <div className="container">
          <h2>Ready to Play?</h2>
          <p>Join your fellow Bearwood members and see who really knows golf.</p>
          <div className="cta-buttons">
            <Link to="/register" className="btn btn-primary btn-xl">
              Create Your Team
            </Link>
            <Link to="/login" className="btn btn-secondary btn-xl">
              Already a Member? Sign In
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="footer">
        <div className="container">
          <div className="footer-content">
            <div className="footer-brand">
              <img
                src="/bearwood_lakes_logo.png"
                alt="Bearwood Lakes"
                className="footer-logo-img"
                width="62"
                height="32"
              />
              <span>Bearwood Lakes Fantasy Golf</span>
            </div>
            <div className="footer-links">
              {isAuthenticated ? (
                <>
                  <Link to="/dashboard">Dashboard</Link>
                  <Link to="/profile">Profile</Link>
                </>
              ) : (
                <>
                  <Link to="/login">Sign In</Link>
                  <Link to="/register">Register</Link>
                </>
              )}
            </div>
            <p className="footer-text">
              A friendly competition for Bearwood Lakes Golf Club members.
            </p>
            <p className="footer-copyright">
              © {currentYear} Bearwood Lakes Golf Club. All rights reserved.
            </p>
          </div>
        </div>
      </footer>
    </main>
  );
};

export default HomePage;
