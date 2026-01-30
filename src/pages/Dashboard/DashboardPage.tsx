// Dashboard page (logged-in home)

import React from 'react';
import { Link } from 'react-router-dom';
import PageLayout from '../../components/layout/PageLayout';
import { useAuth } from '../../hooks/useAuth';
import './DashboardPage.css';

// Dummy data for demonstration
const DUMMY_LEADERBOARD = [
  { rank: 1, username: 'TigerFan2026', totalPoints: 1250, lastTournament: 185 },
  { rank: 2, username: 'GolfPro_Mike', totalPoints: 1180, lastTournament: 210 },
  { rank: 3, username: 'BearwoodBandit', totalPoints: 1145, lastTournament: 165 },
  { rank: 4, username: 'FairwayKing', totalPoints: 1090, lastTournament: 140 },
  { rank: 5, username: 'PuttMaster', totalPoints: 1055, lastTournament: 175 },
];

const DUMMY_RECENT_TOURNAMENTS = [
  { name: 'The Masters 2026', status: 'complete', winner: 'Scottie Scheffler', multiplier: 2 },
  { name: 'PGA Championship', status: 'in_progress', winner: '-', multiplier: 2 },
  { name: 'Arnold Palmer Invitational', status: 'complete', winner: 'Rory McIlroy', multiplier: 1 },
];

const DashboardPage: React.FC = () => {
  const { user } = useAuth();

  return (
    <PageLayout activeNav="dashboard">
      <div className="dashboard-content">
        <div className="dashboard-container">
          {/* Welcome Section */}
          <section className="welcome-section">
            <h1>Welcome back, {user?.firstName || 'Guest'}! 👋</h1>
            <p>Here's what's happening in the 2026 Fantasy Golf season.</p>
          </section>

          {/* Stats Cards */}
          <section className="stats-grid">
            <div className="stat-card">
              <div className="stat-icon">🏆</div>
              <div className="stat-content">
                <span className="stat-value">-</span>
                <span className="stat-label">Your Rank</span>
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-icon">📊</div>
              <div className="stat-content">
                <span className="stat-value">0</span>
                <span className="stat-label">Total Points</span>
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-icon">👥</div>
              <div className="stat-content">
                <span className="stat-value">0/6</span>
                <span className="stat-label">golfers Selected</span>
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-icon">💰</div>
              <div className="stat-content">
                <span className="stat-value">$50M</span>
                <span className="stat-label">Budget Remaining</span>
              </div>
            </div>
          </section>

          {/* Action Banner */}
          <section className="action-banner">
            <div className="banner-content">
              <h2>🚨 You haven't picked your team yet!</h2>
              <p>Select 6 golfers within your $50M budget to start competing.</p>
            </div>
            <Link to="/my-team" className="btn btn-primary">
              Pick Your Team
            </Link>
          </section>

          {/* Two Column Layout */}
          <div className="dashboard-grid">
            {/* Leaderboard Table */}
            <section className="dashboard-card">
              <div className="card-header">
                <h2>🏆 Leaderboard</h2>
                <Link to="/leaderboard" className="card-link">
                  View Full →
                </Link>
              </div>
              <div className="table-container">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Rank</th>
                      <th>golfer</th>
                      <th>Points</th>
                      <th>Last</th>
                    </tr>
                  </thead>
                  <tbody>
                    {DUMMY_LEADERBOARD.map((entry) => (
                      <tr key={entry.rank}>
                        <td>
                          <span className={`rank rank-${entry.rank}`}>
                            {entry.rank === 1 && '🥇'}
                            {entry.rank === 2 && '🥈'}
                            {entry.rank === 3 && '🥉'}
                            {entry.rank > 3 && entry.rank}
                          </span>
                        </td>
                        <td className="golfer-name">{entry.username}</td>
                        <td className="points">{entry.totalPoints.toLocaleString()}</td>
                        <td className="last-points">+{entry.lastTournament}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            {/* Recent Tournaments */}
            <section className="dashboard-card">
              <div className="card-header">
                <h2>⛳ Recent Tournaments</h2>
                <Link to="/tournaments" className="card-link">
                  View All →
                </Link>
              </div>
              <div className="tournaments-list">
                {DUMMY_RECENT_TOURNAMENTS.map((tournament, index) => (
                  <div key={index} className="tournament-item">
                    <div className="tournament-info">
                      <span className="tournament-name">{tournament.name}</span>
                      <span className="tournament-winner">
                        {tournament.status === 'complete'
                          ? `Winner: ${tournament.winner}`
                          : '🔴 In Progress'}
                      </span>
                    </div>
                    <div className="tournament-meta">
                      <span
                        className={`tournament-status status-${tournament.status}`}
                      >
                        {tournament.status === 'complete' ? 'Complete' : 'Live'}
                      </span>
                      {tournament.multiplier > 1 && (
                        <span className="tournament-multiplier">
                          {tournament.multiplier}x
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>

          {/* Quick Tips */}
          <section className="tips-section">
            <h3>💡 Quick Tips</h3>
            <div className="tips-grid">
              <div className="tip-item">
                <strong>Budget wisely</strong> – Don't spend all $50M on top golfers.
                Find value picks!
              </div>
              <div className="tip-item">
                <strong>Watch the majors</strong> – They're worth 2x points. Plan your
                team accordingly.
              </div>
              <div className="tip-item">
                <strong>Check the deadlines</strong> – Transfers lock before each
                tournament starts.
              </div>
            </div>
          </section>
        </div>
      </div>
    </PageLayout>
  );
};

export default DashboardPage;
