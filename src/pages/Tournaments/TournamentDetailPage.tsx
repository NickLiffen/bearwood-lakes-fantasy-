// Tournament Detail Page - View individual tournament and results

import React, { useEffect, useState, useMemo, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import PageLayout from '../../components/layout/PageLayout';
import DataTable, { Column } from '../../components/ui/DataTable';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import { useApiClient } from '../../hooks/useApiClient';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import './TournamentDetailPage.css';

interface Golfer {
  id: string;
  firstName: string;
  lastName: string;
  picture: string;
  membershipType: string;
}

interface GolferScore {
  golfer: Golfer;
  position: number | null;
  participated: boolean;
  scored36Plus: boolean;
  basePoints: number;
  bonusPoints: number;
  multipliedPoints: number;
}

interface PodiumEntry {
  golfer: Golfer;
  points: number;
}

interface Tournament {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  tournamentType: 'regular' | 'elevated' | 'signature';
  multiplier: number;
  golferCountTier: '0-10' | '10-20' | '20+';
  status: 'draft' | 'published' | 'complete';
  season: number;
  participantCount: number;
}

interface TournamentDetailData {
  tournament: Tournament;
  podium: {
    first: PodiumEntry | null;
    second: PodiumEntry | null;
    third: PodiumEntry | null;
  };
  scores: GolferScore[];
  stats: {
    totalParticipants: number;
    scored36Plus: number;
    averagePoints: number;
  };
}

const TournamentDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { get, isAuthReady } = useApiClient();
  const [data, setData] = useState<TournamentDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  useDocumentTitle(data ? data.tournament.name : 'Tournament');

  // Track request ID to ignore stale responses
  const requestIdRef = useRef(0);

  useEffect(() => {
    // Increment request ID - any in-flight requests with old IDs will be ignored
    const currentRequestId = ++requestIdRef.current;

    const fetchTournament = async () => {
      try {
        setLoading(true);
        setError(null);

        const response = await get<TournamentDetailData>(`tournament-detail?id=${id}`);

        // Ignore if this is a stale request or was cancelled
        if (currentRequestId !== requestIdRef.current || response.cancelled) {
          return;
        }

        if (response.success && response.data) {
          setData(response.data);
        } else {
          setError(response.error || 'Failed to load tournament');
        }
      } catch {
        if (currentRequestId === requestIdRef.current) {
          setError('Failed to load tournament details');
        }
      } finally {
        if (currentRequestId === requestIdRef.current) {
          setLoading(false);
        }
      }
    };

    if (isAuthReady && id) {
      fetchTournament();
    }
  }, [id, isAuthReady, get]);

  // Format date for display
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-GB', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  };

  // Get tournament type badge class
  const getTypeBadgeClass = (type: string) => {
    switch (type) {
      case 'signature': return 'detail-type-badge detail-type-signature';
      case 'elevated': return 'detail-type-badge detail-type-elevated';
      default: return 'detail-type-badge detail-type-regular';
    }
  };

  // Get membership badge class
  const getMembershipClass = (type: string) => {
    switch (type) {
      case 'men': return 'dt-membership dt-membership-men';
      case 'female': return 'dt-membership dt-membership-female';
      case 'junior': return 'dt-membership dt-membership-junior';
      case 'senior': return 'dt-membership dt-membership-senior';
      default: return 'dt-membership';
    }
  };

  // Get membership label
  const getMembershipLabel = (type: string) => {
    switch (type) {
      case 'men': return 'Men';
      case 'female': return 'Ladies';
      case 'junior': return 'Junior';
      case 'senior': return 'Senior';
      default: return type;
    }
  };

  // Define table columns
  const columns: Column<GolferScore>[] = useMemo(() => [
    {
      key: 'position',
      header: 'Pos',
      width: '60px',
      align: 'center',
      render: (score) => {
        if (score.position === 1) return <span className="position-badge position-gold">1</span>;
        if (score.position === 2) return <span className="position-badge position-silver">2</span>;
        if (score.position === 3) return <span className="position-badge position-bronze">3</span>;
        return <span className="dt-cell-muted">-</span>;
      },
    },
    {
      key: 'golfer',
      header: 'Golfer',
      render: (score) => (
        <Link to={`/golfers/${score.golfer.id}`} className="dt-cell-link">
          <div className="dt-info-cell">
            <div className="dt-avatar">
              {score.golfer.picture ? (
                <img src={score.golfer.picture} alt={`${score.golfer.firstName} ${score.golfer.lastName}`} loading="lazy" />
              ) : (
                <span className="dt-avatar-placeholder">
                  {score.golfer.firstName[0]}{score.golfer.lastName[0]}
                </span>
              )}
            </div>
            <div className="dt-info-details">
              <span className="dt-info-name">
                {score.golfer.firstName} {score.golfer.lastName}
              </span>
              <span className={getMembershipClass(score.golfer.membershipType)}>
                {getMembershipLabel(score.golfer.membershipType)}
              </span>
            </div>
          </div>
        </Link>
      ),
    },
    {
      key: 'multipliedPoints',
      header: 'Points',
      width: '100px',
      align: 'center',
      render: (score) => (
        <span className={score.multipliedPoints > 0 ? 'dt-cell-stat dt-cell-stat-highlight' : 'dt-cell-muted'}>
          {score.multipliedPoints}
        </span>
      ),
    },
    {
      key: 'basePoints',
      header: 'Base',
      width: '80px',
      align: 'center',
      render: (score) => (
        <span className="dt-cell-stat">{score.basePoints}</span>
      ),
    },
    {
      key: 'bonusPoints',
      header: 'Bonus',
      width: '80px',
      align: 'center',
      render: (score) => (
        <span className={score.bonusPoints > 0 ? 'dt-cell-stat' : 'dt-cell-muted'}>
          {score.bonusPoints > 0 ? `+${score.bonusPoints}` : '0'}
        </span>
      ),
    },
    {
      key: 'scored36Plus',
      header: '36+',
      width: '70px',
      align: 'center',
      render: (score) => (
        score.scored36Plus ? (
          <span className="badge-36plus">Yes</span>
        ) : (
          <span className="dt-cell-muted">-</span>
        )
      ),
    },
  ], []);

  if (loading) {
    return (
      <PageLayout activeNav="tournaments">
        <div className="tournament-detail-content">
          <div className="tournament-detail-container">
            <LoadingSpinner text="Loading tournament..." />
          </div>
        </div>
      </PageLayout>
    );
  }

  if (error || !data) {
    return (
      <PageLayout activeNav="tournaments">
        <div className="tournament-detail-content">
          <div className="tournament-detail-container">
            <div className="error-state">
              <p>{error || 'Tournament not found'}</p>
              <Link to="/tournaments" className="btn-back">
                Back to Tournaments
              </Link>
            </div>
          </div>
        </div>
      </PageLayout>
    );
  }

  const { tournament, podium, scores, stats } = data;

  return (
    <PageLayout activeNav="tournaments">
      <div className="tournament-detail-content">
        <div className="tournament-detail-container">
          {/* Back Link */}
          <Link to="/tournaments" className="back-link">
            &larr; Back to Tournaments
          </Link>

          {/* Tournament Header */}
          <div className="tournament-header">
            <h1>{tournament.name}</h1>
            <div className="tournament-meta">
              <span className="tournament-date">{formatDate(tournament.startDate)}</span>
              <span className={getTypeBadgeClass(tournament.tournamentType)}>
                {tournament.tournamentType.charAt(0).toUpperCase() + tournament.tournamentType.slice(1)}
                <span className="multiplier">{tournament.multiplier}x</span>
              </span>
              <span className={`status-badge status-${tournament.status}`}>
                {tournament.status.charAt(0).toUpperCase() + tournament.status.slice(1)}
              </span>
            </div>
          </div>

          {/* Stats Cards */}
          <div className="tournament-stats-grid">
            <div className="stat-card">
              <div className="stat-icon">Players</div>
              <div className="stat-value">{stats.totalParticipants}</div>
              <div className="stat-label">Participants</div>
            </div>
            <div className="stat-card">
              <div className="stat-icon">36+ Pts</div>
              <div className="stat-value">{stats.scored36Plus}</div>
              <div className="stat-label">Scored 36+</div>
            </div>
            <div className="stat-card">
              <div className="stat-icon">{tournament.multiplier}x</div>
              <div className="stat-value">{tournament.golferCountTier}</div>
              <div className="stat-label">Point Tier</div>
            </div>
          </div>

          {/* Podium Section - Only show if tournament is complete */}
          {tournament.status === 'complete' && (podium.first || podium.second || podium.third) && (
            <div className="podium-section">
              <h2>Podium</h2>
              <div className="podium-display">
                {/* Second Place */}
                <div className="podium-position podium-second">
                  {podium.second ? (
                    <>
                      <div className="podium-avatar">
                        {podium.second.golfer.picture ? (
                          <img src={podium.second.golfer.picture} alt={`${podium.second.golfer.firstName} ${podium.second.golfer.lastName}`} loading="lazy" />
                        ) : (
                          <span>{podium.second.golfer.firstName[0]}{podium.second.golfer.lastName[0]}</span>
                        )}
                      </div>
                      <div className="podium-rank">2nd</div>
                      <Link to={`/golfers/${podium.second.golfer.id}`} className="podium-name">
                        {podium.second.golfer.firstName} {podium.second.golfer.lastName}
                      </Link>
                      <div className="podium-points">{podium.second.points} pts</div>
                    </>
                  ) : (
                    <div className="podium-empty">-</div>
                  )}
                </div>

                {/* First Place - Winner */}
                <div className="podium-position podium-first">
                  {podium.first ? (
                    <>
                      <div className="podium-trophy">Winner</div>
                      <div className="podium-avatar">
                        {podium.first.golfer.picture ? (
                          <img src={podium.first.golfer.picture} alt={`${podium.first.golfer.firstName} ${podium.first.golfer.lastName}`} loading="lazy" />
                        ) : (
                          <span>{podium.first.golfer.firstName[0]}{podium.first.golfer.lastName[0]}</span>
                        )}
                      </div>
                      <div className="podium-rank">1st</div>
                      <Link to={`/golfers/${podium.first.golfer.id}`} className="podium-name">
                        {podium.first.golfer.firstName} {podium.first.golfer.lastName}
                      </Link>
                      <div className="podium-points">{podium.first.points} pts</div>
                    </>
                  ) : (
                    <div className="podium-empty">-</div>
                  )}
                </div>

                {/* Third Place */}
                <div className="podium-position podium-third">
                  {podium.third ? (
                    <>
                      <div className="podium-avatar">
                        {podium.third.golfer.picture ? (
                          <img src={podium.third.golfer.picture} alt={`${podium.third.golfer.firstName} ${podium.third.golfer.lastName}`} loading="lazy" />
                        ) : (
                          <span>{podium.third.golfer.firstName[0]}{podium.third.golfer.lastName[0]}</span>
                        )}
                      </div>
                      <div className="podium-rank">3rd</div>
                      <Link to={`/golfers/${podium.third.golfer.id}`} className="podium-name">
                        {podium.third.golfer.firstName} {podium.third.golfer.lastName}
                      </Link>
                      <div className="podium-points">{podium.third.points} pts</div>
                    </>
                  ) : (
                    <div className="podium-empty">-</div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Full Results Table */}
          <div className="results-section">
            <h2>Full Results</h2>
            {scores.length > 0 ? (
              <DataTable
                data={scores}
                columns={columns}
                rowKey={(score) => score.golfer.id}
                emptyMessage="No results available."
              />
            ) : (
              <div className="no-results">
                <p>No results available for this tournament yet.</p>
                {tournament.status === 'published' && (
                  <p className="no-results-hint">Results will be available after the tournament is complete.</p>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </PageLayout>
  );
};

export default TournamentDetailPage;
