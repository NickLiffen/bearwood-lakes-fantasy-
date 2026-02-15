// Golfer Profile Page - Detailed view of a single golfer

import React, { useEffect, useState, useRef } from 'react';
import { Link, useParams } from 'react-router-dom';
import PageLayout from '../../components/layout/PageLayout';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import { useApiClient } from '../../hooks/useApiClient';
import { useActiveSeason } from '../../hooks/useActiveSeason';
import { formatPrice, getMembershipLabel } from '../../utils/formatters';
import './GolferProfilePage.css';

interface GolferStats {
  timesScored36Plus: number;
  timesFinished1st: number;
  timesFinished2nd: number;
  timesFinished3rd: number;
  timesPlayed: number;
}

interface GolferPoints {
  week: number;
  month: number;
  season: number;
}

interface SeasonStat {
  seasonName: string;
  isActive: boolean;
  startDate: string;
  endDate: string;
  timesPlayed: number;
  timesFinished1st: number;
  timesFinished2nd: number;
  timesFinished3rd: number;
  timesScored36Plus: number;
  totalPoints: number;
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
  points: GolferPoints;
  seasonStats?: SeasonStat[];
  createdAt: string;
  updatedAt: string;
}

const GolferProfilePage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [golfer, setGolfer] = useState<Golfer | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { get, isAuthReady } = useApiClient();
  const { season } = useActiveSeason();
  const seasonName = season?.name || '2026';
  const [expandedSeasons, setExpandedSeasons] = useState<Set<string>>(new Set());
  
  // Track request ID to ignore stale responses
  const requestIdRef = useRef(0);

  useEffect(() => {
    // Increment request ID - any in-flight requests with old IDs will be ignored
    const currentRequestId = ++requestIdRef.current;
    
    const fetchGolfer = async () => {
      try {
        setLoading(true);
        setError(null);

        const response = await get<Golfer>(`golfers-get?id=${id}`);

        // Ignore if this is a stale request or was cancelled
        if (currentRequestId !== requestIdRef.current || response.cancelled) {
          return;
        }

        if (response.success && response.data) {
          setGolfer(response.data);
        } else {
          setError(response.error || 'Golfer not found');
        }
      } catch {
        if (currentRequestId === requestIdRef.current) {
          setError('Failed to load golfer. Please try again.');
        }
      } finally {
        if (currentRequestId === requestIdRef.current) {
          setLoading(false);
        }
      }
    };

    if (isAuthReady && id) {
      fetchGolfer();
    }
  }, [id, get, isAuthReady]);

  useEffect(() => {
    if (golfer?.seasonStats?.length) {
      setExpandedSeasons(new Set([golfer.seasonStats[0].seasonName]));
    }
  }, [golfer]);

  const toggleSeason = (name: string) => {
    setExpandedSeasons((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  // Helper functions
  const getPodiums = (stats: GolferStats) => {
    if (!stats) return 0;
    return stats.timesFinished1st + stats.timesFinished2nd + stats.timesFinished3rd;
  };

  const getWinRate = (stats: GolferStats) => {
    if (!stats || stats.timesPlayed === 0) return 0;
    return ((stats.timesFinished1st / stats.timesPlayed) * 100).toFixed(1);
  };

  const getConsistencyRate = (stats: GolferStats) => {
    if (!stats || stats.timesPlayed === 0) return 0;
    return ((stats.timesScored36Plus / stats.timesPlayed) * 100).toFixed(1);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  };

  if (loading) {
    return (
      <PageLayout activeNav="golfers">
        <div className="golfer-profile-content">
          <div className="profile-container">
            <LoadingSpinner text="Loading golfer profile..." />
          </div>
        </div>
      </PageLayout>
    );
  }

  if (error || !golfer) {
    return (
      <PageLayout activeNav="golfers">
        <div className="golfer-profile-content">
          <div className="profile-container">
            <div className="error-state">
              <h2>Golfer Not Found</h2>
              <p>{error || 'The golfer you\'re looking for doesn\'t exist.'}</p>
              <Link to="/golfers" className="btn-back">← Back to Golfers</Link>
            </div>
          </div>
        </div>
      </PageLayout>
    );
  }

  const totalStats = golfer.seasonStats?.reduce(
    (acc, ss) => ({
      timesPlayed: acc.timesPlayed + ss.timesPlayed,
      timesFinished1st: acc.timesFinished1st + ss.timesFinished1st,
      timesFinished2nd: acc.timesFinished2nd + ss.timesFinished2nd,
      timesFinished3rd: acc.timesFinished3rd + ss.timesFinished3rd,
      timesScored36Plus: acc.timesScored36Plus + ss.timesScored36Plus,
    }),
    { timesPlayed: 0, timesFinished1st: 0, timesFinished2nd: 0, timesFinished3rd: 0, timesScored36Plus: 0 }
  ) ?? null;

  return (
    <PageLayout activeNav="golfers">
      <div className="golfer-profile-content">
        <div className="profile-container">
          {/* Back Link */}
          <Link to="/golfers" className="back-link">← Back to All Golfers</Link>

          {/* Hero Section */}
          <div className="golfer-hero">
            <div className="hero-content">
              <div className="golfer-avatar">
                {golfer.picture ? (
                  <img src={golfer.picture} alt={`${golfer.firstName} ${golfer.lastName}`} />
                ) : (
                  <div className="avatar-placeholder">
                    {golfer.firstName[0]}{golfer.lastName[0]}
                  </div>
                )}
              </div>
              <h1 className="golfer-name">{golfer.firstName} {golfer.lastName}</h1>
              <div className="golfer-value">{formatPrice(golfer.price)}</div>
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
              <div className="quick-stat-value">{getPodiums(totalStats as GolferStats)}</div>
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
                <div className="points-amount">{golfer.points?.week || 0}</div>
                <div className="points-label">pts</div>
              </div>
              <div className="points-card">
                <div className="points-period">This Month</div>
                <div className="points-amount">{golfer.points?.month || 0}</div>
                <div className="points-label">pts</div>
              </div>
              <div className="points-card highlight">
                <div className="points-period">{seasonName} Season</div>
                <div className="points-amount">{golfer.points?.season || 0}</div>
                <div className="points-label">pts</div>
              </div>
            </div>
          </div>

          {/* Season Performance */}
          <div className="season-performance-section">
            <h2>📊 Season Performance</h2>
            {golfer.seasonStats && golfer.seasonStats.length > 0 ? (
              <div className="season-accordion">
                {golfer.seasonStats.map((ss) => {
                  const isExpanded = expandedSeasons.has(ss.seasonName);
                  const podiums = ss.timesFinished1st + ss.timesFinished2nd + ss.timesFinished3rd;
                  const winRate = ss.timesPlayed > 0 ? ((ss.timesFinished1st / ss.timesPlayed) * 100).toFixed(0) : '0';
                  const podiumRate = ss.timesPlayed > 0 ? ((podiums / ss.timesPlayed) * 100).toFixed(0) : '0';
                  
                  return (
                    <div key={ss.seasonName} className={`season-card ${isExpanded ? 'expanded' : ''} ${ss.isActive ? 'active-season' : ''}`}>
                      <button className="season-card-header" onClick={() => toggleSeason(ss.seasonName)}>
                        <div className="season-card-title">
                          <span className="season-name">{ss.seasonName} Season</span>
                          {ss.isActive && <span className="active-badge">Active</span>}
                        </div>
                        <div className="season-card-summary">
                          <span>{ss.timesPlayed} played</span>
                          <span>•</span>
                          <span>{ss.totalPoints} pts</span>
                          <span>•</span>
                          <span>{ss.timesFinished1st} wins</span>
                        </div>
                        <span className="accordion-arrow">{isExpanded ? '▲' : '▼'}</span>
                      </button>
                      {isExpanded && (
                        <div className="season-card-body">
                          <div className="season-stats-grid">
                            <div className="season-stat">
                              <div className="season-stat-value">{ss.timesPlayed}</div>
                              <div className="season-stat-label">Played</div>
                            </div>
                            <div className="season-stat">
                              <div className="season-stat-value">{ss.totalPoints}</div>
                              <div className="season-stat-label">Points</div>
                            </div>
                            <div className="season-stat">
                              <div className="season-stat-value gold">{ss.timesFinished1st}</div>
                              <div className="season-stat-label">🥇 1st</div>
                            </div>
                            <div className="season-stat">
                              <div className="season-stat-value silver">{ss.timesFinished2nd}</div>
                              <div className="season-stat-label">🥈 2nd</div>
                            </div>
                            <div className="season-stat">
                              <div className="season-stat-value bronze">{ss.timesFinished3rd}</div>
                              <div className="season-stat-label">🥉 3rd</div>
                            </div>
                            <div className="season-stat">
                              <div className="season-stat-value">{ss.timesScored36Plus}</div>
                              <div className="season-stat-label">⭐ 36+</div>
                            </div>
                          </div>
                          <div className="season-rates">
                            <div className="rate-bar">
                              <span className="rate-label">Win Rate</span>
                              <div className="rate-track">
                                <div className="rate-fill" style={{ width: `${winRate}%` }}></div>
                              </div>
                              <span className="rate-value">{winRate}%</span>
                            </div>
                            <div className="rate-bar">
                              <span className="rate-label">Podium Rate</span>
                              <div className="rate-track">
                                <div className="rate-fill podium" style={{ width: `${podiumRate}%` }}></div>
                              </div>
                              <span className="rate-value">{podiumRate}%</span>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <p style={{ color: '#6b7280' }}>No season data available.</p>
            )}
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
                  <span className="summary-value">{getPodiums(totalStats as GolferStats)}</span>
                  <span className="summary-label">Podium Finishes</span>
                </div>
              </div>
              <div className="summary-item">
                <div className="summary-icon">📈</div>
                <div className="summary-content">
                  <span className="summary-value">{totalStats && totalStats.timesPlayed > 0 ? getWinRate(totalStats as GolferStats) : 0}%</span>
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
                  <span className="summary-value">{totalStats && totalStats.timesPlayed > 0 ? getConsistencyRate(totalStats as GolferStats) : 0}%</span>
                  <span className="summary-label">Consistency Rate</span>
                </div>
              </div>
            </div>
          </div>

          {/* Golfer Info */}
          <div className="golfer-info-card">
            <h2>Golfer Information</h2>
            <div className="info-grid">
              <div className="info-item">
                <span className="info-label">Golfer ID</span>
                <span className="info-value">{golfer.id}</span>
              </div>
              <div className="info-item">
                <span className="info-label">Membership Type</span>
                <span className="info-value">{getMembershipLabel(golfer.membershipType)}</span>
              </div>
              <div className="info-item">
                <span className="info-label">Fantasy Value</span>
                <span className="info-value">{formatPrice(golfer.price)}</span>
              </div>
              <div className="info-item">
                <span className="info-label">Status</span>
                <span className="info-value">{golfer.isActive ? 'Active' : 'Inactive'}</span>
              </div>
              <div className="info-item">
                <span className="info-label">Added to System</span>
                <span className="info-value">{formatDate(golfer.createdAt)}</span>
              </div>
              <div className="info-item">
                <span className="info-label">Last Updated</span>
                <span className="info-value">{formatDate(golfer.updatedAt)}</span>
              </div>
            </div>
          </div>

        </div>
      </div>
    </PageLayout>
  );
};

export default GolferProfilePage;
