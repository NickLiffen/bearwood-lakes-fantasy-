// My Team Page - View your fantasy team and scores

import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import './MyTeamPage.css';

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

interface TournamentScore {
  tournamentId: string;
  tournamentName: string;
  position: number | null;
  basePoints: number;
  bonusPoints: number;
  multipliedPoints: number;
  scored36Plus: boolean;
  participated: boolean;
  tournamentDate: string;
}

interface PlayerWithScores {
  player: {
    id: string;
    firstName: string;
    lastName: string;
    picture: string;
    price: number;
    membershipType: 'men' | 'junior' | 'female' | 'senior';
    isActive: boolean;
    stats2025: PlayerStats;
    stats2026: PlayerStats;
  };
  weekPoints: number;
  monthPoints: number;
  seasonPoints: number;
  weekScores: TournamentScore[];
  monthScores: TournamentScore[];
  seasonScores: TournamentScore[];
}

interface TeamData {
  players: PlayerWithScores[];
  totals: {
    weekPoints: number;
    monthPoints: number;
    seasonPoints: number;
    totalSpent: number;
  };
  weekStart: string;
  monthStart: string;
  seasonStart: string;
  createdAt: string;
  updatedAt: string;
}

interface MyTeamResponse {
  hasTeam: boolean;
  transfersOpen: boolean;
  team: TeamData | null;
}

type ViewMode = 'week' | 'month' | 'season';

const MyTeamPage: React.FC = () => {
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);
  const [teamData, setTeamData] = useState<MyTeamResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('week');
  const [expandedPlayer, setExpandedPlayer] = useState<string | null>(null);

  useEffect(() => {
    const storedUser = localStorage.getItem('user');
    if (!storedUser) {
      navigate('/login');
      return;
    }
    setUser(JSON.parse(storedUser));
  }, [navigate]);

  useEffect(() => {
    if (user) {
      fetchTeam();
    }
  }, [user]);

  const fetchTeam = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');

      const response = await fetch('/.netlify/functions/my-team', {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          setTeamData(data.data);
        } else {
          setError(data.error || 'Failed to load team');
        }
      } else {
        throw new Error('Failed to fetch team');
      }
    } catch {
      setError('Failed to load your team. Please try again.');
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
      case 'men': return 'Men';
      case 'junior': return 'Junior';
      case 'female': return 'Female';
      case 'senior': return 'Senior';
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

  const getPositionDisplay = (position: number | null) => {
    if (position === null) return '-';
    if (position === 1) return '🥇 1st';
    if (position === 2) return '🥈 2nd';
    if (position === 3) return '🥉 3rd';
    return `${position}th`;
  };

  const getPointsForView = (player: PlayerWithScores) => {
    switch (viewMode) {
      case 'week': return player.weekPoints;
      case 'month': return player.monthPoints;
      case 'season': return player.seasonPoints;
    }
  };

  const getScoresForView = (player: PlayerWithScores) => {
    switch (viewMode) {
      case 'week': return player.weekScores;
      case 'month': return player.monthScores;
      case 'season': return player.seasonScores;
    }
  };

  const getTotalPointsForView = () => {
    if (!teamData?.team) return 0;
    switch (viewMode) {
      case 'week': return teamData.team.totals.weekPoints;
      case 'month': return teamData.team.totals.monthPoints;
      case 'season': return teamData.team.totals.seasonPoints;
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
    });
  };

  const getViewLabel = () => {
    switch (viewMode) {
      case 'week': return 'This Week';
      case 'month': return 'This Month';
      case 'season': return '2026 Season';
    }
  };

  const togglePlayerExpand = (playerId: string) => {
    setExpandedPlayer(expandedPlayer === playerId ? null : playerId);
  };

  if (!user) {
    return null;
  }

  if (loading) {
    return (
      <div className="my-team-page">
        <header className="dashboard-header">
          <div className="header-container">
            <Link to="/dashboard" className="header-brand">
              <img src="/bearwood_lakes_logo.png" alt="Bearwood Lakes" className="brand-logo" />
              <span className="brand-text">Bearwood Lakes Fantasy</span>
            </Link>
          </div>
        </header>
        <main className="team-main">
          <div className="team-container">
            <div className="loading-state">
              <div className="loading-spinner"></div>
              <p>Loading your team...</p>
            </div>
          </div>
        </main>
      </div>
    );
  }

  // No team yet
  if (!teamData?.hasTeam) {
    return (
      <div className="my-team-page">
        <header className="dashboard-header">
          <div className="header-container">
            <Link to="/dashboard" className="header-brand">
              <img src="/bearwood_lakes_logo.png" alt="Bearwood Lakes" className="brand-logo" />
              <span className="brand-text">Bearwood Lakes Fantasy</span>
            </Link>
            <nav className="header-nav">
              <Link to="/dashboard" className="nav-link">Dashboard</Link>
              <Link to="/my-team" className="nav-link active">My Team</Link>
              <Link to="/players" className="nav-link">Players</Link>
              <Link to="/leaderboard" className="nav-link">Leaderboard</Link>
              <Link to="/profile" className="nav-link">Profile</Link>
              {user.role === 'admin' && (
                <Link to="/admin" className="nav-link nav-admin">Admin</Link>
              )}
            </nav>
            <div className="header-user">
              <span className="user-greeting">Hi, <strong>{user.firstName}</strong></span>
              <button onClick={handleLogout} className="btn-logout">Logout</button>
            </div>
          </div>
        </header>
        <main className="team-main">
          <div className="team-container">
            <div className="no-team-state">
              <div className="no-team-icon">⛳</div>
              <h2>No Team Selected Yet</h2>
              <p>You haven't picked your fantasy golf team for this season yet.</p>
              {teamData?.transfersOpen ? (
                <Link to="/team-builder" className="btn-primary">
                  Build Your Team →
                </Link>
              ) : (
                <div className="transfers-closed-notice">
                  <span className="notice-icon">🔒</span>
                  <p>Transfers are currently closed. Check back when the transfer window opens.</p>
                </div>
              )}
            </div>
          </div>
        </main>
      </div>
    );
  }

  const team = teamData.team!;

  return (
    <div className="my-team-page">
      {/* Header */}
      <header className="dashboard-header">
        <div className="header-container">
          <Link to="/dashboard" className="header-brand">
            <img src="/bearwood_lakes_logo.png" alt="Bearwood Lakes" className="brand-logo" />
            <span className="brand-text">Bearwood Lakes Fantasy</span>
          </Link>

          <nav className="header-nav">
            <Link to="/dashboard" className="nav-link">Dashboard</Link>
            <Link to="/my-team" className="nav-link active">My Team</Link>
            <Link to="/players" className="nav-link">Players</Link>
            <Link to="/leaderboard" className="nav-link">Leaderboard</Link>
            <Link to="/profile" className="nav-link">Profile</Link>
            {user.role === 'admin' && (
              <Link to="/admin" className="nav-link nav-admin">Admin</Link>
            )}
          </nav>

          <div className="header-user">
            <span className="user-greeting">Hi, <strong>{user.firstName}</strong></span>
            <button onClick={handleLogout} className="btn-logout">Logout</button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="team-main">
        <div className="team-container">
          {/* Page Header */}
          <div className="page-header">
            <div className="header-top">
              <h1>My Team</h1>
              {teamData.transfersOpen ? (
                <Link to="/team-builder" className="btn-edit-team">
                  ✏️ Edit Team
                </Link>
              ) : (
                <span className="transfers-locked">
                  🔒 Transfers Locked
                </span>
              )}
            </div>
            <p className="page-subtitle">Your 2026 Fantasy Golf Squad</p>
          </div>

          {/* Team Summary Card */}
          <div className="team-summary">
            <div className="summary-main">
              <div className="total-points">
                <span className="points-value">{getTotalPointsForView()}</span>
                <span className="points-label">Points ({getViewLabel()})</span>
              </div>
            </div>
            <div className="summary-stats">
              <div className="summary-stat">
                <span className="stat-value">{team.players.length}</span>
                <span className="stat-label">Players</span>
              </div>
              <div className="summary-stat">
                <span className="stat-value">{formatPrice(team.totals.totalSpent)}</span>
                <span className="stat-label">Team Value</span>
              </div>
              <div className="summary-stat">
                <span className="stat-value">{team.totals.seasonPoints}</span>
                <span className="stat-label">Season Total</span>
              </div>
            </div>
          </div>

          {/* View Toggle */}
          <div className="view-toggle">
            <button 
              className={`toggle-btn ${viewMode === 'week' ? 'active' : ''}`}
              onClick={() => setViewMode('week')}
            >
              This Week
            </button>
            <button 
              className={`toggle-btn ${viewMode === 'month' ? 'active' : ''}`}
              onClick={() => setViewMode('month')}
            >
              This Month
            </button>
            <button 
              className={`toggle-btn ${viewMode === 'season' ? 'active' : ''}`}
              onClick={() => setViewMode('season')}
            >
              2026 Season
            </button>
          </div>

          {/* Error State */}
          {error && (
            <div className="error-message">{error}</div>
          )}

          {/* Players List */}
          <div className="players-list">
            {team.players.map((playerData, index) => {
              const { player } = playerData;
              const points = getPointsForView(playerData);
              const scores = getScoresForView(playerData);
              const isExpanded = expandedPlayer === player.id;

              return (
                <div key={player.id} className="player-card">
                  <div 
                    className="player-card-main"
                    onClick={() => togglePlayerExpand(player.id)}
                  >
                    <div className="player-rank">#{index + 1}</div>
                    <div className="player-avatar">
                      {player.picture ? (
                        <img src={player.picture} alt={`${player.firstName} ${player.lastName}`} />
                      ) : (
                        <div className="avatar-placeholder">
                          {player.firstName[0]}{player.lastName[0]}
                        </div>
                      )}
                    </div>
                    <div className="player-info">
                      <Link 
                        to={`/players/${player.id}`} 
                        className="player-name"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {player.firstName} {player.lastName}
                      </Link>
                      <div className="player-meta">
                        <span className={`membership-badge ${getMembershipClass(player.membershipType)}`}>
                          {getMembershipLabel(player.membershipType)}
                        </span>
                        <span className="player-price">{formatPrice(player.price)}</span>
                      </div>
                    </div>
                    <div className="player-points">
                      <span className="points-number">{points}</span>
                      <span className="points-text">pts</span>
                    </div>
                    <div className={`expand-icon ${isExpanded ? 'expanded' : ''}`}>
                      ▼
                    </div>
                  </div>

                  {/* Expanded Details */}
                  {isExpanded && (
                    <div className="player-details">
                      {/* 2026 Stats Summary */}
                      <div className="stats-summary">
                        <h4>2026 Season Stats</h4>
                        <div className="stats-grid">
                          <div className="stat-item">
                            <span className="stat-value">{player.stats2026?.timesPlayed || 0}</span>
                            <span className="stat-label">Played</span>
                          </div>
                          <div className="stat-item">
                            <span className="stat-value gold">{player.stats2026?.timesFinished1st || 0}</span>
                            <span className="stat-label">1st</span>
                          </div>
                          <div className="stat-item">
                            <span className="stat-value silver">{player.stats2026?.timesFinished2nd || 0}</span>
                            <span className="stat-label">2nd</span>
                          </div>
                          <div className="stat-item">
                            <span className="stat-value bronze">{player.stats2026?.timesFinished3rd || 0}</span>
                            <span className="stat-label">3rd</span>
                          </div>
                          <div className="stat-item">
                            <span className="stat-value">{player.stats2026?.timesScored36Plus || 0}</span>
                            <span className="stat-label">36+</span>
                          </div>
                        </div>
                      </div>

                      {/* Tournament Scores */}
                      <div className="tournament-scores">
                        <h4>{getViewLabel()} Tournaments</h4>
                        {scores.length === 0 ? (
                          <p className="no-scores">No tournament results for this period</p>
                        ) : (
                          <div className="scores-list">
                            {scores.map((score) => (
                              <div key={score.tournamentId} className="score-row">
                                <div className="score-tournament">
                                  <span className="tournament-name">{score.tournamentName}</span>
                                  <span className="tournament-date">{formatDate(score.tournamentDate)}</span>
                                </div>
                                <div className="score-result">
                                  {score.participated ? (
                                    <>
                                      <span className="result-position">{getPositionDisplay(score.position)}</span>
                                      {score.scored36Plus && <span className="bonus-badge">+36</span>}
                                    </>
                                  ) : (
                                    <span className="did-not-play">DNP</span>
                                  )}
                                </div>
                                <div className="score-points">
                                  <span className={`points ${score.multipliedPoints > 0 ? 'positive' : ''}`}>
                                    {score.multipliedPoints > 0 ? `+${score.multipliedPoints}` : score.multipliedPoints}
                                  </span>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Points Breakdown */}
                      <div className="points-breakdown">
                        <div className="breakdown-item">
                          <span className="breakdown-label">Week</span>
                          <span className="breakdown-value">{playerData.weekPoints} pts</span>
                        </div>
                        <div className="breakdown-item">
                          <span className="breakdown-label">Month</span>
                          <span className="breakdown-value">{playerData.monthPoints} pts</span>
                        </div>
                        <div className="breakdown-item">
                          <span className="breakdown-label">Season</span>
                          <span className="breakdown-value">{playerData.seasonPoints} pts</span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Team Info Footer */}
          <div className="team-info-footer">
            <p>Team last updated: {new Date(team.updatedAt).toLocaleDateString('en-GB', {
              day: 'numeric',
              month: 'long',
              year: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            })}</p>
            {!teamData.transfersOpen && (
              <p className="locked-notice">
                🔒 Transfer window is currently closed. You cannot make changes to your team.
              </p>
            )}
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="team-footer">
        <div className="footer-container">
          <p>&copy; 2026 Bearwood Lakes Fantasy Golf League</p>
        </div>
      </footer>
    </div>
  );
};

export default MyTeamPage;
