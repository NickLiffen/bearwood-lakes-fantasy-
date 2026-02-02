// Golfer Profile Page - Detailed view of a single golfer

import React, { useEffect, useState, useRef } from 'react';
import { Link, useParams } from 'react-router-dom';
import PageLayout from '../../components/layout/PageLayout';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import { useApiClient } from '../../hooks/useApiClient';
import { formatPrice, getMembershipLabel, getMembershipClass } from '../../utils/formatters';
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
  createdAt: string;
  updatedAt: string;
}

const GolferProfilePage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [golfer, setGolfer] = useState<Golfer | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { get, isAuthReady } = useApiClient();
  
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

  // Helper functions
  const getPodiums = (stats: GolferStats) => {
    if (!stats) return 0;
    return stats.timesFinished1st + stats.timesFinished2nd + stats.timesFinished3rd;
  };

  const getWinRate = (stats: GolferStats) => {
    if (!stats || stats.timesPlayed === 0) return 0;
    return ((stats.timesFinished1st / stats.timesPlayed) * 100).toFixed(1);
  };

  const getPodiumRate = (stats: GolferStats) => {
    if (!stats || stats.timesPlayed === 0) return 0;
    return ((getPodiums(stats) / stats.timesPlayed) * 100).toFixed(1);
  };

  const getConsistencyRate = (stats: GolferStats) => {
    if (!stats || stats.timesPlayed === 0) return 0;
    return ((stats.timesScored36Plus / stats.timesPlayed) * 100).toFixed(1);
  };

  const getTotalStats = () => {
    if (!golfer) return null;
    const s25 = golfer.stats2025 || { timesPlayed: 0, timesFinished1st: 0, timesFinished2nd: 0, timesFinished3rd: 0, timesScored36Plus: 0 };
    const s26 = golfer.stats2026 || { timesPlayed: 0, timesFinished1st: 0, timesFinished2nd: 0, timesFinished3rd: 0, timesScored36Plus: 0 };
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

  const totalStats = getTotalStats();

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
                <span className={`status-indicator ${golfer.isActive ? 'active' : 'inactive'}`}></span>
              </div>
              <div className="hero-info">
                <h1 className="golfer-name">{golfer.firstName} {golfer.lastName}</h1>
                <div className="golfer-meta">
                  <span className={`membership-badge ${getMembershipClass(golfer.membershipType)}`}>
                    {getMembershipLabel(golfer.membershipType)}
                  </span>
                  <span className={`status-badge ${golfer.isActive ? 'status-active' : 'status-inactive'}`}>
                    {golfer.isActive ? 'Active Golfer' : 'Inactive'}
                  </span>
                </div>
                <div className="golfer-value">
                  <span className="value-label">Fantasy Value</span>
                  <span className="value-amount">{formatPrice(golfer.price)}</span>
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
                <div className="points-period">2026 Season</div>
                <div className="points-amount">{golfer.points?.season || 0}</div>
                <div className="points-label">pts</div>
              </div>
            </div>
          </div>

          {/* Stats Grid */}
          <div className="season-stats-grid">
            {/* 2025 Season */}
            <div className="season-card">
              <div className="season-header">
                <h2>2025 Season</h2>
                <span className="season-rounds">{golfer.stats2025?.timesPlayed || 0} rounds</span>
              </div>
              
              <div className="stat-breakdown">
                <div className="stat-row">
                  <span className="stat-label">🏆 1st Place Finishes</span>
                  <span className="stat-value gold">{golfer.stats2025?.timesFinished1st || 0}</span>
                </div>
                <div className="stat-row">
                  <span className="stat-label">🥈 2nd Place Finishes</span>
                  <span className="stat-value silver">{golfer.stats2025?.timesFinished2nd || 0}</span>
                </div>
                <div className="stat-row">
                  <span className="stat-label">🥉 3rd Place Finishes</span>
                  <span className="stat-value bronze">{golfer.stats2025?.timesFinished3rd || 0}</span>
                </div>
                <div className="stat-row">
                  <span className="stat-label">⭐ Times Scored 36+</span>
                  <span className="stat-value">{golfer.stats2025?.timesScored36Plus || 0}</span>
                </div>
              </div>

              {golfer.stats2025?.timesPlayed > 0 && (
                <div className="performance-metrics">
                  <div className="metric">
                    <div className="metric-bar">
                      <div 
                        className="metric-fill win-rate" 
                        style={{ width: `${getWinRate(golfer.stats2025)}%` }}
                      ></div>
                    </div>
                    <span className="metric-label">Win Rate: {getWinRate(golfer.stats2025)}%</span>
                  </div>
                  <div className="metric">
                    <div className="metric-bar">
                      <div 
                        className="metric-fill podium-rate" 
                        style={{ width: `${getPodiumRate(golfer.stats2025)}%` }}
                      ></div>
                    </div>
                    <span className="metric-label">Podium Rate: {getPodiumRate(golfer.stats2025)}%</span>
                  </div>
                  <div className="metric">
                    <div className="metric-bar">
                      <div 
                        className="metric-fill consistency-rate" 
                        style={{ width: `${getConsistencyRate(golfer.stats2025)}%` }}
                      ></div>
                    </div>
                    <span className="metric-label">Consistency (36+): {getConsistencyRate(golfer.stats2025)}%</span>
                  </div>
                </div>
              )}

              {!golfer.stats2025?.timesPlayed && (
                <div className="no-data">No rounds played in 2025</div>
              )}
            </div>

            {/* 2026 Season */}
            <div className="season-card">
              <div className="season-header">
                <h2>2026 Season</h2>
                <span className="season-rounds">{golfer.stats2026?.timesPlayed || 0} rounds</span>
              </div>
              
              <div className="stat-breakdown">
                <div className="stat-row">
                  <span className="stat-label">🏆 1st Place Finishes</span>
                  <span className="stat-value gold">{golfer.stats2026?.timesFinished1st || 0}</span>
                </div>
                <div className="stat-row">
                  <span className="stat-label">🥈 2nd Place Finishes</span>
                  <span className="stat-value silver">{golfer.stats2026?.timesFinished2nd || 0}</span>
                </div>
                <div className="stat-row">
                  <span className="stat-label">🥉 3rd Place Finishes</span>
                  <span className="stat-value bronze">{golfer.stats2026?.timesFinished3rd || 0}</span>
                </div>
                <div className="stat-row">
                  <span className="stat-label">⭐ Times Scored 36+</span>
                  <span className="stat-value">{golfer.stats2026?.timesScored36Plus || 0}</span>
                </div>
              </div>

              {golfer.stats2026?.timesPlayed > 0 && (
                <div className="performance-metrics">
                  <div className="metric">
                    <div className="metric-bar">
                      <div 
                        className="metric-fill win-rate" 
                        style={{ width: `${getWinRate(golfer.stats2026)}%` }}
                      ></div>
                    </div>
                    <span className="metric-label">Win Rate: {getWinRate(golfer.stats2026)}%</span>
                  </div>
                  <div className="metric">
                    <div className="metric-bar">
                      <div 
                        className="metric-fill podium-rate" 
                        style={{ width: `${getPodiumRate(golfer.stats2026)}%` }}
                      ></div>
                    </div>
                    <span className="metric-label">Podium Rate: {getPodiumRate(golfer.stats2026)}%</span>
                  </div>
                  <div className="metric">
                    <div className="metric-bar">
                      <div 
                        className="metric-fill consistency-rate" 
                        style={{ width: `${getConsistencyRate(golfer.stats2026)}%` }}
                      ></div>
                    </div>
                    <span className="metric-label">Consistency (36+): {getConsistencyRate(golfer.stats2026)}%</span>
                  </div>
                </div>
              )}

              {!golfer.stats2026?.timesPlayed && (
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
