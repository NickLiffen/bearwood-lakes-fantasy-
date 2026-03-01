// Team Compare Modal - Side-by-side team comparison

import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useApiClient } from '../../../hooks/useApiClient';
import './TeamCompareModal.css';

interface Golfer {
  id: string;
  firstName: string;
  lastName: string;
  picture: string;
  price: number;
}

interface GolferWithPoints {
  golfer: Golfer;
  weekPoints: number;
  monthPoints: number;
  seasonPoints: number;
}

interface TeamSummary {
  userId: string;
  firstName: string;
  lastName: string;
  username: string;
  hasTeam: boolean;
  golfers: GolferWithPoints[];
  totals: {
    weekPoints: number;
    monthPoints: number;
    seasonPoints: number;
    totalSpent: number;
  };
}

interface ComparisonData {
  currentUser: TeamSummary;
  targetUser: TeamSummary;
  comparison: {
    sharedGolfers: GolferWithPoints[];
    uniqueToCurrent: GolferWithPoints[];
    uniqueToTarget: GolferWithPoints[];
    sharedGolferCount: number;
    pointsDiff: {
      week: number;
      month: number;
      season: number;
    };
  };
}

interface TeamCompareModalProps {
  targetUserId: string;
  onClose: () => void;
}

const TeamCompareModal: React.FC<TeamCompareModalProps> = ({ targetUserId, onClose }) => {
  const [data, setData] = useState<ComparisonData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { get } = useApiClient();

  useEffect(() => {
    const fetchComparison = async () => {
      try {
        setLoading(true);
        setError(null);

        const response = await get<ComparisonData>(`user-team-compare?userId=${targetUserId}`);

        if (response.success && response.data) {
          setData(response.data);
        } else {
          setError(response.error || 'Failed to load comparison');
        }
      } catch {
        setError('Failed to load comparison. Please try again.');
      } finally {
        setLoading(false);
      }
    };

    fetchComparison();
  }, [targetUserId, get]);

  const getDiffDisplay = (diff: number) => {
    if (diff > 0) return <span className="diff-positive">+{diff}</span>;
    if (diff < 0) return <span className="diff-negative">{diff}</span>;
    return <span className="diff-neutral">0</span>;
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="compare-modal" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="modal-header">
          <h2>⚖️ Team Comparison</h2>
          <button className="modal-close" onClick={onClose}>
            ×
          </button>
        </div>

        {/* Content */}
        <div className="modal-body">
          {loading && (
            <div className="loading-state">
              <div className="loading-spinner"></div>
              <p>Loading comparison...</p>
            </div>
          )}

          {error && (
            <div className="error-state">
              <p>{error}</p>
            </div>
          )}

          {!loading && !error && data && (
            <>
              {/* Points Summary */}
              <div className="points-summary">
                <div className="summary-header">
                  <div className="summary-col user-you">
                    <div className="user-avatar-small">
                      {data.currentUser.firstName[0]}
                      {data.currentUser.lastName[0]}
                    </div>
                    <span className="user-label">You</span>
                  </div>
                  <div className="summary-col">
                    <span className="vs-badge">VS</span>
                  </div>
                  <div className="summary-col user-them">
                    <div className="user-avatar-small them">
                      {data.targetUser.firstName[0]}
                      {data.targetUser.lastName[0]}
                    </div>
                    <span className="user-label">{data.targetUser.firstName}</span>
                  </div>
                </div>

                {/* Period Comparisons */}
                <div className="period-rows">
                  <div className="period-row">
                    <span className="your-points">{data.currentUser.totals.weekPoints}</span>
                    <span className="period-label">
                      Week {getDiffDisplay(data.comparison.pointsDiff.week)}
                    </span>
                    <span className="their-points">{data.targetUser.totals.weekPoints}</span>
                  </div>
                  <div className="period-row">
                    <span className="your-points">{data.currentUser.totals.monthPoints}</span>
                    <span className="period-label">
                      Month {getDiffDisplay(data.comparison.pointsDiff.month)}
                    </span>
                    <span className="their-points">{data.targetUser.totals.monthPoints}</span>
                  </div>
                  <div className="period-row featured">
                    <span className="your-points">{data.currentUser.totals.seasonPoints}</span>
                    <span className="period-label">
                      Season {getDiffDisplay(data.comparison.pointsDiff.season)}
                    </span>
                    <span className="their-points">{data.targetUser.totals.seasonPoints}</span>
                  </div>
                </div>
              </div>

              {/* Shared Golfers */}
              {data.comparison.sharedGolfers.length > 0 && (
                <div className="comparison-section">
                  <h3>🤝 Shared Golfers ({data.comparison.sharedGolferCount})</h3>
                  <div className="golfers-grid">
                    {data.comparison.sharedGolfers.map((p) => (
                      <Link
                        key={p.golfer.id}
                        to={`/golfers/${p.golfer.id}`}
                        className="golfer-chip shared"
                        onClick={onClose}
                      >
                        <div className="chip-avatar">
                          {p.golfer.firstName[0]}
                          {p.golfer.lastName[0]}
                        </div>
                        <div className="chip-info">
                          <span className="chip-name">
                            {p.golfer.firstName} {p.golfer.lastName}
                          </span>
                          <span className="chip-points">{p.seasonPoints} pts</span>
                        </div>
                      </Link>
                    ))}
                  </div>
                </div>
              )}

              {/* Your Unique golfers */}
              {data.comparison.uniqueToCurrent.length > 0 && (
                <div className="comparison-section">
                  <h3>👤 Only in Your Team</h3>
                  <div className="golfers-grid">
                    {data.comparison.uniqueToCurrent.map((p) => (
                      <Link
                        key={p.golfer.id}
                        to={`/golfers/${p.golfer.id}`}
                        className="golfer-chip yours"
                        onClick={onClose}
                      >
                        <div className="chip-avatar">
                          {p.golfer.firstName[0]}
                          {p.golfer.lastName[0]}
                        </div>
                        <div className="chip-info">
                          <span className="chip-name">
                            {p.golfer.firstName} {p.golfer.lastName}
                          </span>
                          <span className="chip-points">{p.seasonPoints} pts</span>
                        </div>
                      </Link>
                    ))}
                  </div>
                </div>
              )}

              {/* Their Unique golfers */}
              {data.comparison.uniqueToTarget.length > 0 && (
                <div className="comparison-section">
                  <h3>👤 Only in {data.targetUser.firstName}'s Team</h3>
                  <div className="golfers-grid">
                    {data.comparison.uniqueToTarget.map((p) => (
                      <Link
                        key={p.golfer.id}
                        to={`/golfers/${p.golfer.id}`}
                        className="golfer-chip theirs"
                        onClick={onClose}
                      >
                        <div className="chip-avatar">
                          {p.golfer.firstName[0]}
                          {p.golfer.lastName[0]}
                        </div>
                        <div className="chip-info">
                          <span className="chip-name">
                            {p.golfer.firstName} {p.golfer.lastName}
                          </span>
                          <span className="chip-points">{p.seasonPoints} pts</span>
                        </div>
                      </Link>
                    ))}
                  </div>
                </div>
              )}

              {/* No Team States */}
              {!data.currentUser.hasTeam && (
                <div className="no-team-notice">
                  <p>
                    You don't have a team yet.{' '}
                    <Link to="/team-builder" onClick={onClose}>
                      Build your team
                    </Link>{' '}
                    to compare!
                  </p>
                </div>
              )}

              {!data.targetUser.hasTeam && (
                <div className="no-team-notice">
                  <p>{data.targetUser.firstName} doesn't have a team yet.</p>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="modal-footer">
          <button className="btn-secondary" onClick={onClose}>
            Close
          </button>
          <Link to={`/users/${targetUserId}`} className="btn-primary" onClick={onClose}>
            View Full Profile
          </Link>
        </div>
      </div>
    </div>
  );
};

export default TeamCompareModal;
