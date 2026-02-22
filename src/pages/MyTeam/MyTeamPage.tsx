// My Team Page - View your fantasy team and scores

import React, { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import PageLayout from '../../components/layout/PageLayout';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import DataTable, { Column } from '../../components/ui/DataTable';
import { useApiClient } from '../../hooks/useApiClient';
import { useActiveSeason } from '../../hooks/useActiveSeason';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { formatPrice } from '../../utils/formatters';
import type {
  GolferSeasonStats,
  MembershipType,
} from '@shared/types';
import type {
  TournamentScore,
  WeekOption,
} from '@shared/types';
import './MyTeamPage.css';

// Local interface for golfer with scores - matches API response structure
interface GolferWithScores {
  golfer: {
    id: string;
    firstName: string;
    lastName: string;
    picture: string;
    price: number;
    membershipType: MembershipType;
    isActive: boolean;
    stats2025: GolferSeasonStats;
    stats2026: GolferSeasonStats;
  };
  weekPoints: number;
  seasonPoints: number;
  weekScores: TournamentScore[];
  seasonScores: TournamentScore[];
  isCaptain: boolean;
}

// Local interface for team data - matches API response structure
interface TeamData {
  golfers: GolferWithScores[];
  totals: {
    weekPoints: number;
    seasonPoints: number;
    totalSpent: number;
  };
  captainId: string | null;
  period: {
    weekStart: string;
    weekEnd: string;
    label: string;
    hasPrevious: boolean;
    hasNext: boolean;
  };
  seasonStart: string;
  teamEffectiveStart: string;
  createdAt: string;
  updatedAt: string;
}

// Local interface for API response - matches backend structure
interface MyTeamApiResponse {
  hasTeam: boolean;
  transfersOpen: boolean;
  allowNewTeamCreation: boolean;
  maxTransfersPerWeek: number;
  transfersUsedThisWeek: number;
  unlimitedTransfers: boolean;
  team: TeamData | null;
}

// Helper to get Saturday of the week containing a date
const getSaturdayOfWeek = (date: Date): Date => {
  const d = new Date(date);
  const dayOfWeek = d.getDay(); // 0 = Sunday, 6 = Saturday
  let daysSinceSaturday: number;
  if (dayOfWeek === 6) {
    daysSinceSaturday = 0;
  } else {
    daysSinceSaturday = dayOfWeek + 1;
  }
  d.setDate(d.getDate() - daysSinceSaturday);
  d.setHours(0, 0, 0, 0);
  return d;
};

// Helper to format date as YYYY-MM-DD
const formatDateString = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

// Helper to format week label like "Sat, Feb 1, 2026"
const formatWeekLabel = (weekStart: Date): string => {
  return weekStart.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });
};

const MyTeamPage: React.FC = () => {
  const [teamData, setTeamData] = useState<MyTeamApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [weekOptions, setWeekOptions] = useState<WeekOption[]>([]);
  const [savingCaptain, setSavingCaptain] = useState(false);
  const { get, post, isAuthReady } = useApiClient();
  const { season } = useActiveSeason();
  const seasonName = season?.name || '2026';
  useDocumentTitle('My Team');

  // Generate week options from team effective start to current week
  // Only shows weeks where the team could have earned points
  const generateWeekOptions = useCallback((teamEffectiveStart: string) => {
    const options: WeekOption[] = [];
    const effectiveStart = new Date(teamEffectiveStart);
    // Normalize to midnight for consistent comparison with getSaturdayOfWeek
    effectiveStart.setHours(0, 0, 0, 0);
    const now = new Date();
    let current = getSaturdayOfWeek(now);

    // Go back through weeks, stopping at team effective start
    while (current >= effectiveStart) {
      options.push({
        value: formatDateString(current),
        label: formatWeekLabel(current),
      });
      current = new Date(current);
      current.setDate(current.getDate() - 7);
    }

    // Always include at least current week even if team just created
    if (options.length === 0) {
      const currentWeek = getSaturdayOfWeek(now);
      options.push({
        value: formatDateString(currentWeek),
        label: formatWeekLabel(currentWeek),
      });
    }

    return options;
  }, []);

  const fetchTeam = useCallback(async (date?: string) => {
    setLoading(true);
    setError(null);

    try {
      const endpoint = date ? `my-team?date=${date}` : 'my-team';
      const response = await get<MyTeamApiResponse>(endpoint);

      if (response.cancelled) return;

      if (response.success && response.data) {
        setTeamData(response.data);

        // Set selected date from response
        if (response.data.team?.period) {
          const weekStart = new Date(response.data.team.period.weekStart);
          setSelectedDate(formatDateString(weekStart));

          // Generate week options if not already set
          if (weekOptions.length === 0) {
            const options = generateWeekOptions(response.data.team.teamEffectiveStart);
            setWeekOptions(options);
          }
        }
      } else {
        setError(response.error || 'Failed to load team');
      }
      setLoading(false);
    } catch {
      setError('Failed to load your team. Please try again.');
      setLoading(false);
    }
  }, [get, weekOptions.length, generateWeekOptions]);

  useEffect(() => {
    if (isAuthReady) {
      fetchTeam();
    }
  }, [isAuthReady, fetchTeam]);

  // Navigation handlers
  const handleWeekNavigation = (direction: 'prev' | 'next') => {
    if (!selectedDate) return;
    const current = new Date(selectedDate);
    current.setDate(current.getDate() + (direction === 'next' ? 7 : -7));
    const newDate = formatDateString(current);
    setSelectedDate(newDate);
    fetchTeam(newDate);
  };

  const handleWeekSelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newDate = e.target.value;
    setSelectedDate(newDate);
    fetchTeam(newDate);
  };

  // Handle setting a golfer as captain
  const handleSetCaptain = async (golferId: string) => {
    if (!teamData?.team || savingCaptain) return;

    setSavingCaptain(true);
    try {
      const response = await post('picks-save', {
        golferIds: teamData.team.golfers.map(g => g.golfer.id),
        captainId: golferId,
      });

      if (response.success) {
        // Refresh team data to get updated points
        fetchTeam(selectedDate);
      } else {
        alert(response.error || 'Failed to set captain');
      }
    } catch {
      alert('Failed to set captain. Please try again.');
    } finally {
      setSavingCaptain(false);
    }
  };

  // Column definitions for DataTable
  const getColumns = (): Column<GolferWithScores>[] => [
    {
      key: 'captain',
      header: 'C',
      align: 'center',
      render: (golferData) => (
        <button
          onClick={() => handleSetCaptain(golferData.golfer.id)}
          className={`captain-badge ${golferData.isCaptain ? 'active' : ''}`}
          disabled={savingCaptain}
          title={golferData.isCaptain ? 'Captain (2x points)' : 'Set as captain'}
        >
          C
        </button>
      ),
    },
    {
      key: 'golfer',
      header: 'Golfer',
      render: (golferData) => (
        <div className="dt-info-cell">
          <div className="dt-avatar">
            {golferData.golfer.picture ? (
              <img src={golferData.golfer.picture} alt={`${golferData.golfer.firstName} ${golferData.golfer.lastName}`} />
            ) : (
              <span className="dt-avatar-placeholder">
                {golferData.golfer.firstName[0]}{golferData.golfer.lastName[0]}
              </span>
            )}
          </div>
          <Link to={`/golfers/${golferData.golfer.id}`} className="dt-text-link">
            {golferData.golfer.firstName} {golferData.golfer.lastName}
          </Link>
        </div>
      ),
    },
    {
      key: 'week-pts',
      header: 'Week Pts',
      align: 'right',
      render: (golferData) => (
        <span className="dt-text-primary">
          {golferData.weekPoints}
          {golferData.isCaptain && <span className="captain-multiplier">(2x)</span>}
        </span>
      ),
    },
  ];

  // Loading state
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

  // Error state
  if (error) {
    return (
      <PageLayout activeNav="my-team">
        <div className="my-team-content">
          <div className="my-team-container">
            <div className="error-state">
              <p>{error}</p>
              <button onClick={() => fetchTeam()} className="btn-primary" style={{ marginTop: '1rem' }}>
                Try Again
              </button>
            </div>
          </div>
        </div>
      </PageLayout>
    );
  }

  // Safety fallback
  if (teamData === null) {
    return (
      <PageLayout activeNav="my-team">
        <div className="my-team-content">
          <div className="my-team-container">
            <div className="error-state">
              <p>Unable to load team data. Please refresh the page.</p>
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

  // Sort golfers by week points
  const sortedGolfers = [...team.golfers].sort((a, b) => b.weekPoints - a.weekPoints);

  return (
    <PageLayout activeNav="my-team">
      <div className="my-team-content">
        <div className="my-team-container">
          {/* Page Header */}
          <div className="users-page-header">
            <div className="page-header-row">
              <div>
                <h1>My Team</h1>
                <p className="users-page-subtitle">Your {seasonName} Fantasy Golf Squad</p>
              </div>
              <div className="header-actions">
                {teamData.transfersOpen ? (
                  <>
                    <span className="transfers-info">
                      {teamData.unlimitedTransfers
                        ? 'Unlimited transfers (pre-season)'
                        : `Transfers: ${teamData.transfersUsedThisWeek} / ${teamData.maxTransfersPerWeek} used this week`}
                    </span>
                    {teamData.unlimitedTransfers || teamData.transfersUsedThisWeek < teamData.maxTransfersPerWeek ? (
                      <Link to="/team-builder" className="btn-edit-team">
                        Edit Team →
                      </Link>
                    ) : (
                      <span className="transfers-exhausted">
                        No transfers remaining
                      </span>
                    )}
                  </>
                ) : (
                  <span className="transfers-locked">
                    Transfers Locked
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Captain Prompt Banner */}
          {!team.captainId && (
            <div className="captain-prompt-banner">
              <span className="banner-icon">⭐</span>
              <div className="banner-text">
                <h3>Pick Your Captain</h3>
                <p>
                  Tap the <span className="captain-badge-hint">C</span> next to a golfer's name to
                  make them captain. Your captain earns <strong>2× points</strong> every week!
                </p>
              </div>
            </div>
          )}

          {/* Stats Grid - 3 cards */}
          <section className="team-stats-grid">
            <div className="stat-card stat-card-active">
              <div className="stat-icon">📅</div>
              <div className="stat-content">
                <span className="stat-value">{team.totals.weekPoints}</span>
                <span className="stat-label">Week Points</span>
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-icon">🏆</div>
              <div className="stat-content">
                <span className="stat-value">{team.totals.seasonPoints}</span>
                <span className="stat-label">{seasonName} Season</span>
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

          {/* Week Navigation */}
          <div className="period-navigation">
            <button
              className="nav-btn"
              onClick={() => handleWeekNavigation('prev')}
              disabled={!team.period.hasPrevious}
              title="Previous week"
            >
              ←
            </button>
            <select
              id="week-select"
              name="week-select"
              className="period-select"
              value={selectedDate}
              onChange={handleWeekSelect}
            >
              {weekOptions.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
            <button
              className="nav-btn"
              onClick={() => handleWeekNavigation('next')}
              disabled={!team.period.hasNext}
              title="Next week"
            >
              →
            </button>
          </div>

          {/* Error State */}
          {error && (
            <div className="error-message">{error}</div>
          )}

          {/* Golfers Section - Using DataTable */}
          <section className="dashboard-card">
            <div className="card-header">
              <h2>Your 6 Golfers</h2>
              <span className="card-header-subtitle">Sorted by week points</span>
            </div>
            <DataTable
              data={sortedGolfers}
              columns={getColumns()}
              rowKey={(golferData) => golferData.golfer.id}
              emptyMessage="No golfers in your team yet."
            />
          </section>

          {/* Team Info Footer */}
          <div className="team-info-footer">
            <p>Team created: {new Date(team.createdAt).toLocaleDateString('en-GB', {
              day: 'numeric',
              month: 'long',
              year: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            })}</p>
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
