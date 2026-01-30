// User Profile Page - View another user's profile, team, and stats

import React, { useEffect, useState, useRef } from 'react';
import { Link, useParams } from 'react-router-dom';
import PageLayout from '../../components/layout/PageLayout';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import TeamCompareModal from '../../components/ui/TeamCompareModal';
import { useAuth } from '../../hooks/useAuth';
import { useApiClient } from '../../hooks/useApiClient';
import { formatPrice, formatDate, formatDateTime, getMembershipLabel, getMembershipClass } from '../../utils/formatters';
import './UserProfilePage.css';

interface GolferStats {
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

interface Golfer {
  id: string;
  firstName: string;
  lastName: string;
  picture: string;
  price: number;
  membershipType: 'men' | 'junior' | 'female' | 'senior';
  isActive: boolean;
  stats2025: GolferStats;
  stats2026: GolferStats;
}

interface GolferWithScores {
  golfer: Golfer;
  weekPoints: number;
  monthPoints: number;
  seasonPoints: number;
  weekScores: TournamentScore[];
  monthScores: TournamentScore[];
  seasonScores: TournamentScore[];
}

interface HistoryEntry {
  changedAt: string;
  reason: string;
  totalSpent: number;
  playerCount: number;
  addedPlayers: Array<{ id: string; name: string }>;
  removedPlayers: Array<{ id: string; name: string }>;
}

interface UserProfileData {
  user: {
    id: string;
    firstName: string;
    lastName: string;
    username: string;
    createdAt: string;
  };
  hasTeam: boolean;
  stats?: {
    weekPoints: number;
    monthPoints: number;
    seasonPoints: number;
    weekRank: number | null;
    monthRank: number | null;
    seasonRank: number | null;
  };
  team?: {
    golfers: GolferWithScores[];
    totals: {
      weekPoints: number;
      monthPoints: number;
      seasonPoints: number;
      totalSpent: number;
    };
    createdAt: string;
    updatedAt: string;
  };
  history: HistoryEntry[];
}

type ViewMode = 'week' | 'month' | 'season';

const UserProfilePage: React.FC = () => {
  const { userId } = useParams<{ userId: string }>();
  const [profileData, setProfileData] = useState<UserProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('week');
  const [expandedPlayer, setExpandedPlayer] = useState<string | null>(null);
  const [showCompareModal, setShowCompareModal] = useState(false);

  // Check if this is the current user's profile
  const { user: currentUser } = useAuth();
  const currentUserId = currentUser?.id ?? null;
  const isOwnProfile = currentUserId === userId;
  const { get, isAuthReady } = useApiClient();
  
  // Track request ID to ignore stale responses
  const requestIdRef = useRef(0);

  useEffect(() => {
    // Increment request ID - any in-flight requests with old IDs will be ignored
    const currentRequestId = ++requestIdRef.current;
    
    const fetchUserProfile = async () => {
      try {
        setLoading(true);
        setError(null);

        const response = await get<UserProfileData>(`user-profile?userId=${userId}`);

        // Ignore if this is a stale request or was cancelled
        if (currentRequestId !== requestIdRef.current || response.cancelled) {
          return;
        }

        if (response.success && response.data) {
          setProfileData(response.data);
        } else {
          setError(response.error || 'Failed to load profile');
        }
      } catch {
        // Only set error if this is still the current request
        if (currentRequestId === requestIdRef.current) {
          setError('Failed to load profile. Please try again.');
        }
      } finally {
        // Only update loading if this is still the current request
        if (currentRequestId === requestIdRef.current) {
          setLoading(false);
        }
      }
    };

    if (isAuthReady && userId) {
      fetchUserProfile();
    }
  }, [userId, get, isAuthReady]);

  // Helper functions
  const getPositionDisplay = (position: number | null) => {
    if (position === null) return '-';
    if (position === 1) return '🥇 1st';
    if (position === 2) return '🥈 2nd';
    if (position === 3) return '🥉 3rd';
    return `${position}th`;
  };

  const getPointsForView = (golferData: GolferWithScores) => {
    switch (viewMode) {
      case 'week': return golferData.weekPoints;
      case 'month': return golferData.monthPoints;
      case 'season': return golferData.seasonPoints;
    }
  };

  const getScoresForView = (golferData: GolferWithScores) => {
    switch (viewMode) {
      case 'week': return golferData.weekScores;
      case 'month': return golferData.monthScores;
      case 'season': return golferData.seasonScores;
    }
  };

  const getTotalPointsForView = () => {
    if (!profileData?.team) return 0;
    switch (viewMode) {
      case 'week': return profileData.team.totals.weekPoints;
      case 'month': return profileData.team.totals.monthPoints;
      case 'season': return profileData.team.totals.seasonPoints;
    }
  };

  const getViewLabel = () => {
    switch (viewMode) {
      case 'week': return 'This Week';
      case 'month': return 'This Month';
      case 'season': return '2026 Season';
    }
  };

  const getRankDisplay = (rank: number | null) => {
    if (rank === null) return '-';
    if (rank === 1) return '🥇 1st';
    if (rank === 2) return '🥈 2nd';
    if (rank === 3) return '🥉 3rd';
    return `#${rank}`;
  };

  const togglePlayerExpand = (playerId: string) => {
    setExpandedPlayer(expandedPlayer === playerId ? null : playerId);
  };

  if (loading) {
    return (
      <PageLayout activeNav="users">
        <div className="user-profile-content">
          <div className="user-profile-container">
            <LoadingSpinner text="Loading profile..." />
          </div>
        </div>
      </PageLayout>
    );
  }

  if (error || !profileData) {
    return (
      <PageLayout activeNav="users">
        <div className="user-profile-content">
          <div className="user-profile-container">
            <div className="error-state">
              <p>{error || 'User not found'}</p>
              <Link to="/users" className="btn-back">← Back to Users</Link>
            </div>
          </div>
        </div>
      </PageLayout>
    );
  }

  const { user, hasTeam, stats, team, history } = profileData;

  return (
    <PageLayout activeNav="users">
      <div className="user-profile-content">
        <div className="user-profile-container">
          {/* Back Link */}
          <Link to="/users" className="user-profile-back-link">← Back to Users</Link>

          {/* Profile Header */}
          <div className="profile-header-card">
            <div className="profile-avatar-large">
              {user.firstName[0]}{user.lastName[0]}
            </div>
            <div className="profile-header-info">
              <h1>{user.firstName} {user.lastName}</h1>
              <p className="profile-username">@{user.username}</p>
              <p className="profile-member-since">Member since {formatDate(user.createdAt)}</p>
              {isOwnProfile && <span className="own-profile-badge">This is you!</span>}
            </div>
            {hasTeam && !isOwnProfile && (
              <button 
                className="btn-compare"
                onClick={() => setShowCompareModal(true)}
              >
                ⚖️ Compare Teams
              </button>
            )}
          </div>

          {/* Stats Cards */}
          {hasTeam && stats && (
            <div className="stats-cards">
              <div className="stat-card">
                <span className="stat-period">📅 This Week</span>
                <span className="stat-points">{stats.weekPoints} pts</span>
                <span className="stat-rank">{getRankDisplay(stats.weekRank)}</span>
              </div>
              <div className="stat-card">
                <span className="stat-period">📆 This Month</span>
                <span className="stat-points">{stats.monthPoints} pts</span>
                <span className="stat-rank">{getRankDisplay(stats.monthRank)}</span>
              </div>
              <div className="stat-card stat-card-featured">
                <span className="stat-period">🏆 2026 Season</span>
                <span className="stat-points">{stats.seasonPoints} pts</span>
                <span className="stat-rank">{getRankDisplay(stats.seasonRank)}</span>
              </div>
            </div>
          )}

          {/* No Team State */}
          {!hasTeam && (
            <div className="no-team-card">
              <div className="no-team-icon">⛳</div>
              <h2>No Team Yet</h2>
              <p>{user.firstName} hasn't selected their fantasy team for this season.</p>
            </div>
          )}

          {/* Team Section */}
          {hasTeam && team && (
            <>
              {/* Team Summary */}
              <div className="team-section">
                <div className="section-header">
                  <h2>🏌️ {user.firstName}'s Team</h2>
                  <span className="team-value">{formatPrice(team.totals.totalSpent)} team value</span>
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

                {/* Team Total */}
                <div className="team-total">
                  <span className="total-label">{getViewLabel()} Total:</span>
                  <span className="total-value">{getTotalPointsForView()} pts</span>
                </div>

                {/* Golfers List */}
                <div className="golfers-list">
                  {team.golfers.map((golferData, index) => {
                    const { golfer } = golferData;
                    const points = getPointsForView(golferData);
                    const scores = getScoresForView(golferData);
                    const isExpanded = expandedPlayer === golfer.id;

                    return (
                      <div key={golfer.id} className="golfer-card">
                        <div 
                          className="golfer-card-main"
                          onClick={() => togglePlayerExpand(golfer.id)}
                        >
                          <div className="golfer-rank">#{index + 1}</div>
                          <div className="golfer-avatar">
                            {golfer.picture ? (
                              <img src={golfer.picture} alt={`${golfer.firstName} ${golfer.lastName}`} />
                            ) : (
                              <div className="avatar-placeholder">
                                {golfer.firstName[0]}{golfer.lastName[0]}
                              </div>
                            )}
                          </div>
                          <div className="golfer-info">
                            <Link 
                              to={`/golfers/${golfer.id}`} 
                              className="golfer-name"
                              onClick={(e) => e.stopPropagation()}
                            >
                              {golfer.firstName} {golfer.lastName}
                            </Link>
                            <div className="golfer-meta">
                              <span className={`membership-badge ${getMembershipClass(golfer.membershipType)}`}>
                                {getMembershipLabel(golfer.membershipType)}
                              </span>
                              <span className="golfer-price">{formatPrice(golfer.price)}</span>
                            </div>
                          </div>
                          <div className="golfer-points">
                            <span className="points-number">{points}</span>
                            <span className="points-text">pts</span>
                          </div>
                          <div className={`expand-icon ${isExpanded ? 'expanded' : ''}`}>
                            ▼
                          </div>
                        </div>

                        {/* Expanded Details */}
                        {isExpanded && (
                          <div className="golfer-details">
                            {/* 2026 Stats Summary */}
                            <div className="stats-summary">
                              <h4>2026 Season Stats</h4>
                              <div className="stats-grid">
                                <div className="stat-item">
                                  <span className="stat-value">{golfer.stats2026?.timesPlayed || 0}</span>
                                  <span className="stat-label">Played</span>
                                </div>
                                <div className="stat-item">
                                  <span className="stat-value gold">{golfer.stats2026?.timesFinished1st || 0}</span>
                                  <span className="stat-label">1st</span>
                                </div>
                                <div className="stat-item">
                                  <span className="stat-value silver">{golfer.stats2026?.timesFinished2nd || 0}</span>
                                  <span className="stat-label">2nd</span>
                                </div>
                                <div className="stat-item">
                                  <span className="stat-value bronze">{golfer.stats2026?.timesFinished3rd || 0}</span>
                                  <span className="stat-label">3rd</span>
                                </div>
                                <div className="stat-item">
                                  <span className="stat-value">{golfer.stats2026?.timesScored36Plus || 0}</span>
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
                                <span className="breakdown-value">{golferData.weekPoints} pts</span>
                              </div>
                              <div className="breakdown-item">
                                <span className="breakdown-label">Month</span>
                                <span className="breakdown-value">{golferData.monthPoints} pts</span>
                              </div>
                              <div className="breakdown-item">
                                <span className="breakdown-label">Season</span>
                                <span className="breakdown-value">{golferData.seasonPoints} pts</span>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Team History */}
              {history.length > 0 && (
                <div className="history-section">
                  <h2>📜 Team History</h2>
                  <div className="history-timeline">
                    {history.map((entry, index) => (
                      <div key={index} className="history-entry">
                        <div className="history-date">{formatDateTime(entry.changedAt)}</div>
                        <div className="history-content">
                          <span className="history-reason">{entry.reason}</span>
                          <div className="history-changes">
                            {entry.addedPlayers.length > 0 && (
                              <div className="golfers-added">
                                {entry.addedPlayers.map(p => (
                                  <span key={p.id} className="golfer-change added">+ {p.name}</span>
                                ))}
                              </div>
                            )}
                            {entry.removedPlayers.length > 0 && (
                              <div className="golfers-removed">
                                {entry.removedPlayers.map(p => (
                                  <span key={p.id} className="golfer-change removed">- {p.name}</span>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Compare Modal */}
      {showCompareModal && userId && (
        <TeamCompareModal
          targetUserId={userId}
          onClose={() => setShowCompareModal(false)}
        />
      )}
    </PageLayout>
  );
};

export default UserProfilePage;
