// Admin Overview/Dashboard page

import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import AdminLayout from '../../components/AdminLayout/AdminLayout';

interface Stats {
  users: number;
  players: number;
  activePlayers: number;
  tournaments: number;
  publishedTournaments: number;
  completeTournaments: number;
  totalScoresEntered: number;
}

const AdminOverviewPage: React.FC = () => {
  const [stats, setStats] = useState<Stats>({
    users: 0,
    players: 0,
    activePlayers: 0,
    tournaments: 0,
    publishedTournaments: 0,
    completeTournaments: 0,
    totalScoresEntered: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      const token = localStorage.getItem('token');
      try {
        const [usersRes, playersRes, tournamentsRes, scoresRes] = await Promise.all([
          fetch('/.netlify/functions/users-list', { headers: { Authorization: `Bearer ${token}` } }),
          fetch('/.netlify/functions/players-list', { headers: { Authorization: `Bearer ${token}` } }),
          fetch('/.netlify/functions/tournaments-list', { headers: { Authorization: `Bearer ${token}` } }),
          fetch('/.netlify/functions/scores-list', { headers: { Authorization: `Bearer ${token}` } }),
        ]);

        const [usersData, playersData, tournamentsData, scoresData] = await Promise.all([
          usersRes.json(),
          playersRes.json(),
          tournamentsRes.json(),
          scoresRes.json(),
        ]);

        const players = playersData.success ? playersData.data : [];
        const tournaments = tournamentsData.success ? tournamentsData.data : [];
        const scores = scoresData.success ? scoresData.data : [];

        setStats({
          users: usersData.success ? usersData.data.length : 0,
          players: players.length,
          activePlayers: players.filter((p: { isActive: boolean }) => p.isActive).length,
          tournaments: tournaments.length,
          publishedTournaments: tournaments.filter((t: { status: string }) => t.status === 'published').length,
          completeTournaments: tournaments.filter((t: { status: string }) => t.status === 'complete').length,
          totalScoresEntered: scores.filter((s: { participated: boolean }) => s.participated).length,
        });
      } catch (err) {
        console.error('Failed to fetch stats:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
  }, []);

  return (
    <AdminLayout title="Admin Overview">
      {loading ? (
        <div className="loading">Loading...</div>
      ) : (
        <>
          {/* Stats Row */}
          <div className="stats-row">
            <div className="stat-box">
              <div className="stat-box-icon">👥</div>
              <div className="stat-box-value">{stats.users}</div>
              <div className="stat-box-label">Total Users</div>
            </div>
            <div className="stat-box">
              <div className="stat-box-icon">🏌️</div>
              <div className="stat-box-value">{stats.activePlayers}/{stats.players}</div>
              <div className="stat-box-label">Active Players</div>
            </div>
            <div className="stat-box">
              <div className="stat-box-icon">🏆</div>
              <div className="stat-box-value">{stats.tournaments}</div>
              <div className="stat-box-label">Tournaments</div>
            </div>
            <div className="stat-box">
              <div className="stat-box-icon">✅</div>
              <div className="stat-box-value">{stats.completeTournaments}</div>
              <div className="stat-box-label">Completed</div>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="admin-card" style={{ marginBottom: '1.5rem' }}>
            <div className="admin-card-header">
              <h2>Quick Actions</h2>
            </div>
            <div className="admin-card-body">
              <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                <Link to="/admin/players" className="btn btn-primary">
                  🏌️ Add Player
                </Link>
                <Link to="/admin/tournaments" className="btn btn-primary">
                  🏆 Create Tournament
                </Link>
                <Link to="/admin/scores" className="btn btn-primary">
                  📝 Enter Scores
                </Link>
                <Link to="/admin/users" className="btn btn-secondary">
                  👥 Manage Users
                </Link>
              </div>
            </div>
          </div>

          {/* Getting Started Guide */}
          <div className="admin-card">
            <div className="admin-card-header">
              <h2>Getting Started</h2>
            </div>
            <div className="admin-card-body">
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '1rem',
                    padding: '1rem',
                    background: '#f9fafb',
                    borderRadius: '8px',
                  }}
                >
                  <span
                    style={{
                      background: stats.players > 0 ? '#16a34a' : '#d1d5db',
                      color: 'white',
                      width: '28px',
                      height: '28px',
                      borderRadius: '50%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontWeight: '600',
                      fontSize: '0.85rem',
                      flexShrink: 0,
                    }}
                  >
                    {stats.players > 0 ? '✓' : '1'}
                  </span>
                  <div>
                    <strong>Add Professional Golfers</strong>
                    <p style={{ color: '#6b7280', fontSize: '0.9rem', marginTop: '0.25rem' }}>
                      Add the golfers that users can pick for their fantasy teams. Set their
                      names, photos, and prices.
                    </p>
                  </div>
                </div>

                <div
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '1rem',
                    padding: '1rem',
                    background: '#f9fafb',
                    borderRadius: '8px',
                  }}
                >
                  <span
                    style={{
                      background: stats.tournaments > 0 ? '#16a34a' : '#d1d5db',
                      color: 'white',
                      width: '28px',
                      height: '28px',
                      borderRadius: '50%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontWeight: '600',
                      fontSize: '0.85rem',
                      flexShrink: 0,
                    }}
                  >
                    {stats.tournaments > 0 ? '✓' : '2'}
                  </span>
                  <div>
                    <strong>Create Tournaments</strong>
                    <p style={{ color: '#6b7280', fontSize: '0.9rem', marginTop: '0.25rem' }}>
                      Set up tournaments like The Masters, PGA Championship, etc. Set dates and
                      point multipliers for majors.
                    </p>
                  </div>
                </div>

                <div
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '1rem',
                    padding: '1rem',
                    background: '#f9fafb',
                    borderRadius: '8px',
                  }}
                >
                  <span
                    style={{
                      background: '#d1d5db',
                      color: 'white',
                      width: '28px',
                      height: '28px',
                      borderRadius: '50%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontWeight: '600',
                      fontSize: '0.85rem',
                      flexShrink: 0,
                    }}
                  >
                    3
                  </span>
                  <div>
                    <strong>Enter Scores After Each Tournament</strong>
                    <p style={{ color: '#6b7280', fontSize: '0.9rem', marginTop: '0.25rem' }}>
                      Once a tournament completes, enter each player's score and position.
                      Publish to update the leaderboard.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </AdminLayout>
  );
};

export default AdminOverviewPage;
