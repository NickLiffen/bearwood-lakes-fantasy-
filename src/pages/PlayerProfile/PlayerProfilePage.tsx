// Player Profile Page - Detailed view of a single player

import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import './PlayerProfilePage.css';

interface User {
  id: string;
  firstName: string;
  lastName: string;
  username: string;
  role: string;
}

interface PlayerStats {
  timesScored36Plus: number;
  timesFinished1st: number;
  timesFinished2nd: number;
  timesFinished3rd: number;
  timesPlayed: number;
}

interface PlayerPoints {
  week: number;
  month: number;
  season: number;
}

interface Player {
  id: string;
  firstName: string;
  lastName: string;
  picture: string;
  price: number;
  membershipType: 'men' | 'junior' | 'female' | 'senior';
  isActive: boolean;
  stats2025: PlayerStats;
  stats2026: PlayerStats;
  points: PlayerPoints;
  createdAt: string;
  updatedAt: string;
}

const PlayerProfilePage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);
  const [player, setPlayer] = useState<Player | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const storedUser = localStorage.getItem('user');
    if (!storedUser) {
      navigate('/login');
      return;
    }
    setUser(JSON.parse(storedUser));
  }, [navigate]);

  useEffect(() => {
    if (user && id) {
      fetchPlayer();
    }
  }, [user, id]);

  const fetchPlayer = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');

      const response = await fetch(`/.netlify/functions/players-get?id=${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          setPlayer(data.data);
        } else {
          setError(data.error || 'Player not found');
        }
      } else if (response.status === 404) {
        setError('Player not found');
      } else {
        throw new Error('Failed to fetch player');
      }
    } catch {
      setError('Failed to load player. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    navigate('/login');
  };

  // Helper functions
  const formatPrice = (price: number) => `$${(price / 1000000).toFixed(1)}M`;

  const getMembershipLabel = (type: string) => {
    switch (type) {
      case 'men': return 'Men\'s Member';
      case 'junior': return 'Junior Member';
      case 'female': return 'Female Member';
      case 'senior': return 'Senior Member';
      default: return type;
    }
  };

  const getMembershipClass = (type: string) => {
    switch (type) {
      case 'men': return 'membership-men';
      case 'junior': return 'membership-junior';
      case 'female': return 'membership-female';
      case 'senior': return 'membership-senior';
      default: return '';
    }
  };

  const getPodiums = (stats: PlayerStats) => {
    if (!stats) return 0;
    return stats.timesFinished1st + stats.timesFinished2nd + stats.timesFinished3rd;
  };

  const getWinRate = (stats: PlayerStats) => {
    if (!stats || stats.timesPlayed === 0) return 0;
    return ((stats.timesFinished1st / stats.timesPlayed) * 100).toFixed(1);
  };

  const getPodiumRate = (stats: PlayerStats) => {
    if (!stats || stats.timesPlayed === 0) return 0;
    return ((getPodiums(stats) / stats.timesPlayed) * 100).toFixed(1);
  };

  const getConsistencyRate = (stats: PlayerStats) => {
    if (!stats || stats.timesPlayed === 0) return 0;
    return ((stats.timesScored36Plus / stats.timesPlayed) * 100).toFixed(1);
  };

  const getTotalStats = () => {
    if (!player) return null;
    const s25 = player.stats2025 || { timesPlayed: 0, timesFinished1st: 0, timesFinished2nd: 0, timesFinished3rd: 0, timesScored36Plus: 0 };
    const s26 = player.stats2026 || { timesPlayed: 0, timesFinished1st: 0, timesFinished2nd: 0, timesFinished3rd: 0, timesScored36Plus: 0 };
    return {
      timesPlayed: s25.timesPlayed + s26.timesPlayed,
      timesFinished1st: s25.timesFinished1st + s26.timesFinished1st,
      timesFinished2nd: s25.timesFinished2nd + s26.timesFinished2nd,
      timesFinished3rd: s25.timesFinished3rd + s26.timesFinished3rd,
      timesScored36Plus: s25.timesScored36Plus + s26.timesScored36Plus,
    };
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  };

  if (!user) {
    return null;
  }

  if (loading) {
    return (
      <div className="player-profile-page">
        <header className="dashboard-header">
          <div className="header-container">
            <Link to="/dashboard" className="header-brand">
              <img src="/bearwood_lakes_logo.png" alt="Bearwood Lakes" className="brand-logo" />
              <span className="brand-text">Bearwood Lakes Fantasy</span>
            </Link>
          </div>
        </header>
        <main className="profile-main">
          <div className="profile-container">
            <div className="loading-state">
              <div className="loading-spinner"></div>
              <p>Loading player profile...</p>
            </div>
          </div>
        </main>
      </div>
    );
  }

  if (error || !player) {
    return (
      <div className="player-profile-page">
        <header className="dashboard-header">
          <div className="header-container">
            <Link to="/dashboard" className="header-brand">
              <img src="/bearwood_lakes_logo.png" alt="Bearwood Lakes" className="brand-logo" />
              <span className="brand-text">Bearwood Lakes Fantasy</span>
            </Link>
          </div>
        </header>
        <main className="profile-main">
          <div className="profile-container">
            <div className="error-state">
              <h2>Player Not Found</h2>
              <p>{error || 'The player you\'re looking for doesn\'t exist.'}</p>
              <Link to="/players" className="btn-back">← Back to Players</Link>
            </div>
          </div>
        </main>
      </div>
    );
  }

  const totalStats = getTotalStats();

  return (
    <div className="player-profile-page">
      {/* Header */}
      <header className="dashboard-header">
        <div className="header-container">
          <Link to="/dashboard" className="header-brand">
            <img src="/bearwood_lakes_logo.png" alt="Bearwood Lakes" className="brand-logo" />
            <span className="brand-text">Bearwood Lakes Fantasy</span>
          </Link>

          <nav className="header-nav">
            <Link to="/dashboard" className="nav-link">Dashboard</Link>
            <Link to="/my-team" className="nav-link">My Team</Link>
            <Link to="/players" className="nav-link active">Players</Link>
            <Link to="/leaderboard" className="nav-link">Leaderboard</Link>
            <Link to="/profile" className="nav-link">Profile</Link>
            {user.role === 'admin' && (
              <Link to="/admin" className="nav-link nav-admin">Admin</Link>
            )}
          </nav>

          <div className="header-user">
            <span className="user-greeting">
              Hi, <strong>{user.firstName}</strong>
            </span>
            <button onClick={handleLogout} className="btn-logout">Logout</button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="profile-main">
        <div className="profile-container">
          {/* Back Link */}
          <Link to="/players" className="back-link">← Back to All Players</Link>

          {/* Hero Section */}
          <div className="player-hero">
            <div className="hero-content">
              <div className="player-avatar">
                {player.picture ? (
                  <img src={player.picture} alt={`${player.firstName} ${player.lastName}`} />
                ) : (
                  <div className="avatar-placeholder">
                    {player.firstName[0]}{player.lastName[0]}
                  </div>
                )}
                <span className={`status-indicator ${player.isActive ? 'active' : 'inactive'}`}></span>
              </div>
              <div className="hero-info">
                <h1 className="player-name">{player.firstName} {player.lastName}</h1>
                <div className="player-meta">
                  <span className={`membership-badge ${getMembershipClass(player.membershipType)}`}>
                    {getMembershipLabel(player.membershipType)}
                  </span>
                  <span className={`status-badge ${player.isActive ? 'status-active' : 'status-inactive'}`}>
                    {player.isActive ? 'Active Player' : 'Inactive'}
                  </span>
                </div>
                <div className="player-value">
                  <span className="value-label">Fantasy Value</span>
                  <span className="value-amount">{formatPrice(player.price)}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Quick Stats */}
          <div className="quick-stats">
            <div className="quick-stat">
              <div className="quick-stat-value">{totalStats?.timesPlayed || 0}</div>
              <div className="quick-stat-label">Career Rounds</div>
            </div>
            <div className="quick-stat highlight">
              <div className="quick-stat-value gold">{totalStats?.timesFinished1st || 0}</div>
              <div className="quick-stat-label">🏆 Wins</div>
            </div>
            <div className="quick-stat">
              <div className="quick-stat-value">{getPodiums(totalStats as PlayerStats)}</div>
              <div className="quick-stat-label">🥇 Podiums</div>
            </div>
            <div className="quick-stat">
              <div className="quick-stat-value">{totalStats?.timesScored36Plus || 0}</div>
              <div className="quick-stat-label">⭐ 36+ Scores</div>
            </div>
          </div>

          {/* Fantasy Points */}
          <div className="fantasy-points-section">
            <h2>📊 Fantasy Points</h2>
            <div className="points-cards">
              <div className="points-card">
                <div className="points-period">This Week</div>
                <div className="points-amount">{player.points?.week || 0}</div>
                <div className="points-label">pts</div>
              </div>
              <div className="points-card">
                <div className="points-period">This Month</div>
                <div className="points-amount">{player.points?.month || 0}</div>
                <div className="points-label">pts</div>
              </div>
              <div className="points-card highlight">
                <div className="points-period">2026 Season</div>
                <div className="points-amount">{player.points?.season || 0}</div>
                <div className="points-label">pts</div>
              </div>
            </div>
          </div>

          {/* Stats Grid */}
          <div className="stats-grid">
            {/* 2025 Season */}
            <div className="season-card">
              <div className="season-header">
                <h2>2025 Season</h2>
                <span className="season-rounds">{player.stats2025?.timesPlayed || 0} rounds</span>
              </div>
              
              <div className="stat-breakdown">
                <div className="stat-row">
                  <span className="stat-label">🏆 1st Place Finishes</span>
                  <span className="stat-value gold">{player.stats2025?.timesFinished1st || 0}</span>
                </div>
                <div className="stat-row">
                  <span className="stat-label">🥈 2nd Place Finishes</span>
                  <span className="stat-value silver">{player.stats2025?.timesFinished2nd || 0}</span>
                </div>
                <div className="stat-row">
                  <span className="stat-label">🥉 3rd Place Finishes</span>
                  <span className="stat-value bronze">{player.stats2025?.timesFinished3rd || 0}</span>
                </div>
                <div className="stat-row">
                  <span className="stat-label">⭐ Times Scored 36+</span>
                  <span className="stat-value">{player.stats2025?.timesScored36Plus || 0}</span>
                </div>
              </div>

              {player.stats2025?.timesPlayed > 0 && (
                <div className="performance-metrics">
                  <div className="metric">
                    <div className="metric-bar">
                      <div 
                        className="metric-fill win-rate" 
                        style={{ width: `${getWinRate(player.stats2025)}%` }}
                      ></div>
                    </div>
                    <span className="metric-label">Win Rate: {getWinRate(player.stats2025)}%</span>
                  </div>
                  <div className="metric">
                    <div className="metric-bar">
                      <div 
                        className="metric-fill podium-rate" 
                        style={{ width: `${getPodiumRate(player.stats2025)}%` }}
                      ></div>
                    </div>
                    <span className="metric-label">Podium Rate: {getPodiumRate(player.stats2025)}%</span>
                  </div>
                  <div className="metric">
                    <div className="metric-bar">
                      <div 
                        className="metric-fill consistency-rate" 
                        style={{ width: `${getConsistencyRate(player.stats2025)}%` }}
                      ></div>
                    </div>
                    <span className="metric-label">Consistency (36+): {getConsistencyRate(player.stats2025)}%</span>
                  </div>
                </div>
              )}

              {!player.stats2025?.timesPlayed && (
                <div className="no-data">No rounds played in 2025</div>
              )}
            </div>

            {/* 2026 Season */}
            <div className="season-card">
              <div className="season-header">
                <h2>2026 Season</h2>
                <span className="season-rounds">{player.stats2026?.timesPlayed || 0} rounds</span>
              </div>
              
              <div className="stat-breakdown">
                <div className="stat-row">
                  <span className="stat-label">🏆 1st Place Finishes</span>
                  <span className="stat-value gold">{player.stats2026?.timesFinished1st || 0}</span>
                </div>
                <div className="stat-row">
                  <span className="stat-label">🥈 2nd Place Finishes</span>
                  <span className="stat-value silver">{player.stats2026?.timesFinished2nd || 0}</span>
                </div>
                <div className="stat-row">
                  <span className="stat-label">🥉 3rd Place Finishes</span>
                  <span className="stat-value bronze">{player.stats2026?.timesFinished3rd || 0}</span>
                </div>
                <div className="stat-row">
                  <span className="stat-label">⭐ Times Scored 36+</span>
                  <span className="stat-value">{player.stats2026?.timesScored36Plus || 0}</span>
                </div>
              </div>

              {player.stats2026?.timesPlayed > 0 && (
                <div className="performance-metrics">
                  <div className="metric">
                    <div className="metric-bar">
                      <div 
                        className="metric-fill win-rate" 
                        style={{ width: `${getWinRate(player.stats2026)}%` }}
                      ></div>
                    </div>
                    <span className="metric-label">Win Rate: {getWinRate(player.stats2026)}%</span>
                  </div>
                  <div className="metric">
                    <div className="metric-bar">
                      <div 
                        className="metric-fill podium-rate" 
                        style={{ width: `${getPodiumRate(player.stats2026)}%` }}
                      ></div>
                    </div>
                    <span className="metric-label">Podium Rate: {getPodiumRate(player.stats2026)}%</span>
                  </div>
                  <div className="metric">
                    <div className="metric-bar">
                      <div 
                        className="metric-fill consistency-rate" 
                        style={{ width: `${getConsistencyRate(player.stats2026)}%` }}
                      ></div>
                    </div>
                    <span className="metric-label">Consistency (36+): {getConsistencyRate(player.stats2026)}%</span>
                  </div>
                </div>
              )}

              {!player.stats2026?.timesPlayed && (
                <div className="no-data">No rounds played in 2026 yet</div>
              )}
            </div>
          </div>

          {/* Career Summary */}
          <div className="career-summary">
            <h2>Career Summary</h2>
            <div className="summary-grid">
              <div className="summary-item">
                <div className="summary-icon">📊</div>
                <div className="summary-content">
                  <span className="summary-value">{totalStats?.timesPlayed || 0}</span>
                  <span className="summary-label">Total Rounds Played</span>
                </div>
              </div>
              <div className="summary-item">
                <div className="summary-icon">🏆</div>
                <div className="summary-content">
                  <span className="summary-value gold">{totalStats?.timesFinished1st || 0}</span>
                  <span className="summary-label">Tournament Wins</span>
                </div>
              </div>
              <div className="summary-item">
                <div className="summary-icon">🥇</div>
                <div className="summary-content">
                  <span className="summary-value">{getPodiums(totalStats as PlayerStats)}</span>
                  <span className="summary-label">Podium Finishes</span>
                </div>
              </div>
              <div className="summary-item">
                <div className="summary-icon">📈</div>
                <div className="summary-content">
                  <span className="summary-value">{totalStats && totalStats.timesPlayed > 0 ? getWinRate(totalStats as PlayerStats) : 0}%</span>
                  <span className="summary-label">Career Win Rate</span>
                </div>
              </div>
              <div className="summary-item">
                <div className="summary-icon">⭐</div>
                <div className="summary-content">
                  <span className="summary-value">{totalStats?.timesScored36Plus || 0}</span>
                  <span className="summary-label">36+ Point Rounds</span>
                </div>
              </div>
              <div className="summary-item">
                <div className="summary-icon">💪</div>
                <div className="summary-content">
                  <span className="summary-value">{totalStats && totalStats.timesPlayed > 0 ? getConsistencyRate(totalStats as PlayerStats) : 0}%</span>
                  <span className="summary-label">Consistency Rate</span>
                </div>
              </div>
            </div>
          </div>

          {/* Player Info */}
          <div className="player-info-card">
            <h2>Player Information</h2>
            <div className="info-grid">
              <div className="info-item">
                <span className="info-label">Player ID</span>
                <span className="info-value">{player.id}</span>
              </div>
              <div className="info-item">
                <span className="info-label">Membership Type</span>
                <span className="info-value">{getMembershipLabel(player.membershipType)}</span>
              </div>
              <div className="info-item">
                <span className="info-label">Fantasy Value</span>
                <span className="info-value">{formatPrice(player.price)}</span>
              </div>
              <div className="info-item">
                <span className="info-label">Status</span>
                <span className="info-value">{player.isActive ? 'Active' : 'Inactive'}</span>
              </div>
              <div className="info-item">
                <span className="info-label">Added to System</span>
                <span className="info-value">{formatDate(player.createdAt)}</span>
              </div>
              <div className="info-item">
                <span className="info-label">Last Updated</span>
                <span className="info-value">{formatDate(player.updatedAt)}</span>
              </div>
            </div>
          </div>

        </div>
      </main>

      {/* Footer */}
      <footer className="profile-footer">
        <div className="footer-container">
          <p>&copy; 2026 Bearwood Lakes Fantasy Golf League</p>
        </div>
      </footer>
    </div>
  );
};

export default PlayerProfilePage;
