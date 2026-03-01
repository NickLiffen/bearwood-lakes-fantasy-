// Admin Overview/Dashboard page

import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import AdminLayout from '../../../components/AdminLayout/AdminLayout';
import { useApiClient } from '../../../hooks/useApiClient';

interface Stats {
  users: number;
  golfers: number;
  activeGolfers: number;
  tournaments: number;
  publishedTournaments: number;
  completeTournaments: number;
  totalScoresEntered: number;
}

const AdminOverviewPage: React.FC = () => {
  const { get, isAuthReady } = useApiClient();
  const [stats, setStats] = useState<Stats>({
    users: 0,
    golfers: 0,
    activeGolfers: 0,
    tournaments: 0,
    publishedTournaments: 0,
    completeTournaments: 0,
    totalScoresEntered: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const [usersData, golfersData, tournamentsData, scoresData] = await Promise.all([
          get<{ id: string }[]>('users-list'),
          get<{ id: string; isActive: boolean }[]>('golfers-list'),
          get<{ id: string; status: string }[]>('tournaments-list'),
          get<{ id: string; participated: boolean }[]>('scores-list'),
        ]);

        // Ignore cancelled requests
        if (
          usersData.cancelled ||
          golfersData.cancelled ||
          tournamentsData.cancelled ||
          scoresData.cancelled
        ) {
          return;
        }

        const golfers = golfersData.success && golfersData.data ? golfersData.data : [];
        const tournaments =
          tournamentsData.success && tournamentsData.data ? tournamentsData.data : [];
        const scores = scoresData.success && scoresData.data ? scoresData.data : [];

        setStats({
          users: usersData.success && usersData.data ? usersData.data.length : 0,
          golfers: golfers.length,
          activeGolfers: golfers.filter((g) => g.isActive).length,
          tournaments: tournaments.length,
          publishedTournaments: tournaments.filter((t) => t.status === 'published').length,
          completeTournaments: tournaments.filter((t) => t.status === 'complete').length,
          totalScoresEntered: scores.filter((s) => s.participated).length,
        });
      } catch (err) {
        console.error('Failed to fetch stats:', err);
      } finally {
        setLoading(false);
      }
    };

    if (isAuthReady) {
      fetchStats();
    }
  }, [get, isAuthReady]);

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
              <div className="stat-box-value">
                {stats.activeGolfers}/{stats.golfers}
              </div>
              <div className="stat-box-label">Active Golfers</div>
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
                <Link to="/admin/golfers" className="btn btn-primary">
                  🏌️ Add Golfer
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
                <Link to="/admin/season-upload" className="btn btn-secondary">
                  📤 Upload Season
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
                      background: stats.golfers > 0 ? '#16a34a' : '#d1d5db',
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
                    {stats.golfers > 0 ? '✓' : '1'}
                  </span>
                  <div>
                    <strong>Add Professional Golfers</strong>
                    <p style={{ color: '#6b7280', fontSize: '0.9rem', marginTop: '0.25rem' }}>
                      Add the golfers that users can pick for their fantasy teams. Set their names,
                      photos, and prices.
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
                      Once a tournament completes, enter each golfer's score and position. Publish
                      to update the leaderboard.
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
