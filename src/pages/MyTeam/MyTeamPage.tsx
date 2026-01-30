// My Team Page - View your fantasy team and scores

import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import PageLayout from '../../components/layout/PageLayout';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import { useApiClient } from '../../hooks/useApiClient';
import { formatPrice, getMembershipLabel, getMembershipClass } from '../../utils/formatters';
import './MyTeamPage.css';

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

interface GolferWithScores {
  golfer: {
    id: string;
    firstName: string;
    lastName: string;
    picture: string;
    price: number;
    membershipType: 'men' | 'junior' | 'female' | 'senior';
    isActive: boolean;
    stats2025: GolferStats;
    stats2026: GolferStats;
  };
  weekPoints: number;
  monthPoints: number;
  seasonPoints: number;
  weekScores: TournamentScore[];
  monthScores: TournamentScore[];
  seasonScores: TournamentScore[];
}

interface TeamData {
  golfers: GolferWithScores[];
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
  allowNewTeamCreation: boolean;
  team: TeamData | null;
}

type ViewMode = 'week' | 'month' | 'season';

const MyTeamPage: React.FC = () => {
  const [teamData, setTeamData] = useState<MyTeamResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('week');
  const [expandedPlayer, setExpandedPlayer] = useState<string | null>(null);
  const { get, isAuthReady } = useApiClient();

  useEffect(() => {
    if (isAuthReady) {
      fetchTeam();
    }
  }, [isAuthReady]);

  const fetchTeam = async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await get<MyTeamResponse>('my-team');

      if (response.cancelled) return;

      if (response.success && response.data) {
        setTeamData(response.data);
      } else {
        setError(response.error || 'Failed to load team');
      }
    } catch {
      setError('Failed to load your team. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Helper functions
  const getPositionDisplay = (position: number | null) => {
    if (position === null) return '-';
    if (position === 1) return '🥇 1st';
    if (position === 2) return '🥈 2nd';
    if (position === 3) return '🥉 3rd';
    return `${position}th`;
  };

  const getPointsForView = (golfer: GolferWithScores) => {
    switch (viewMode) {
      case 'week': return golfer.weekPoints;
      case 'month': return golfer.monthPoints;
      case 'season': return golfer.seasonPoints;
    }
  };

  const getScoresForView = (golfer: GolferWithScores) => {
    switch (viewMode) {
      case 'week': return golfer.weekScores;
      case 'month': return golfer.monthScores;
      case 'season': return golfer.seasonScores;
    }
  };

  const getViewLabel = () => {
    switch (viewMode) {
      case 'week': return 'This Week';
      case 'month': return 'This Month';
      case 'season': return '2026 Season';
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
    });
  };

  const togglePlayerExpand = (playerId: string) => {
    setExpandedPlayer(expandedPlayer === playerId ? null : playerId);
  };

  // Loading state - uses standard LoadingSpinner
  if (loading) {
    return (
      <PageLayout activeNav="my-team">
        <div className="my-team-content">
          <div className="my-team-container">
            <LoadingSpinner text="Loading your team..." fullPage />
          </div>
        </div>
      </PageLayout>
    );
  }

  // Error state - data failed to load
  if (teamData === null) {
    return (
      <PageLayout activeNav="my-team">
        <div className="my-team-content">
          <div className="my-team-container">
            <div className="error-state">
              <p>{error || 'Failed to load team data. Please refresh the page.'}</p>
            </div>
          </div>
        </div>
      </PageLayout>
    );
  }

  // No team yet
  if (!teamData.hasTeam) {
    return (
      <PageLayout activeNav="my-team">
        <div className="my-team-content">
          <div className="my-team-container">
            <div className="no-team-state">
              <div className="no-team-icon">⛳</div>
              <h2>No Team Selected Yet</h2>
              <p>You haven't picked your fantasy golf team for this season yet.</p>
              {teamData.allowNewTeamCreation ? (
                <Link to="/team-builder" className="btn-primary">
                  Build Your Team →
                </Link>
              ) : (
                <div className="transfers-closed-notice">
                  <span className="notice-icon">🔒</span>
                  <p>New team creation is currently disabled. Check back when it's enabled.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </PageLayout>
    );
  }

  const team = teamData.team!;

  // Sort golfers by points for current view
  const sortedGolfers = [...team.golfers].sort((a, b) => {
    const aPoints = getPointsForView(a);
    const bPoints = getPointsForView(b);
    return bPoints - aPoints;
  });

  return (
    <PageLayout activeNav="my-team">
      <div className="my-team-content">
        <div className="my-team-container">
          {/* Page Header - Standard pattern */}
          <div className="users-page-header">
            <div className="page-header-row">
              <div>
                <h1>⛳ My Team</h1>
                <p className="users-page-subtitle">Your 2026 Fantasy Golf Squad</p>
              </div>
              {teamData.transfersOpen ? (
                <Link to="/team-builder" className="btn-edit-team">
                  Edit Team →
                </Link>
              ) : (
                <span className="transfers-locked">
                  🔒 Transfers Locked
                </span>
              )}
            </div>
          </div>

          {/* Stats Grid - 4 cards */}
          <section className="stats-grid">
            <div className={`stat-card ${viewMode === 'week' ? 'stat-card-active' : ''}`}>
              <div className="stat-icon">📅</div>
              <div className="stat-content">
                <span className="stat-value">{team.totals.weekPoints}</span>
                <span className="stat-label">This Week</span>
              </div>
            </div>
            <div className={`stat-card ${viewMode === 'month' ? 'stat-card-active' : ''}`}>
              <div className="stat-icon">📆</div>
              <div className="stat-content">
                <span className="stat-value">{team.totals.monthPoints}</span>
                <span className="stat-label">This Month</span>
              </div>
            </div>
            <div className={`stat-card ${viewMode === 'season' ? 'stat-card-active' : ''}`}>
              <div className="stat-icon">🏆</div>
              <div className="stat-content">
                <span className="stat-value">{team.totals.seasonPoints}</span>
                <span className="stat-label">2026 Season</span>
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-icon">💰</div>
              <div className="stat-content">
                <span className="stat-value">{formatPrice(team.totals.totalSpent)}</span>
                <span className="stat-label">Team Value</span>
              </div>
            </div>
          </section>

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

          {/* Golfers Section - Card with header */}
          <section className="dashboard-card">
            <div className="card-header">
              <h2>Your 6 Golfers</h2>
              <span className="card-header-subtitle">Sorted by {getViewLabel()} points</span>
            </div>
            <div className="golfers-list">
              {sortedGolfers.map((golferData: GolferWithScores, index: number) => {
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
                        <div className="golfer-stats-summary">
                          <h4>2026 Season Stats</h4>
                          <div className="golfer-stats-grid">
                            <div className="golfer-stat-item">
                              <span className="golfer-stat-value">{golfer.stats2026?.timesPlayed || 0}</span>
                              <span className="golfer-stat-label">Played</span>
                            </div>
                            <div className="golfer-stat-item">
                              <span className="golfer-stat-value gold">{golfer.stats2026?.timesFinished1st || 0}</span>
                              <span className="golfer-stat-label">1st</span>
                            </div>
                            <div className="golfer-stat-item">
                              <span className="golfer-stat-value silver">{golfer.stats2026?.timesFinished2nd || 0}</span>
                              <span className="golfer-stat-label">2nd</span>
                            </div>
                            <div className="golfer-stat-item">
                              <span className="golfer-stat-value bronze">{golfer.stats2026?.timesFinished3rd || 0}</span>
                              <span className="golfer-stat-label">3rd</span>
                            </div>
                            <div className="golfer-stat-item">
                              <span className="golfer-stat-value">{golfer.stats2026?.timesScored36Plus || 0}</span>
                              <span className="golfer-stat-label">36+</span>
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
          </section>

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
      </div>
    </PageLayout>
  );
};

export default MyTeamPage;
