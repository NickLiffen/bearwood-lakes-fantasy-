// My Team Page - View your fantasy team and scores

import React, { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import PageLayout from '../../components/layout/PageLayout';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import GameweekNav from '../../components/ui/GameweekNav';
import { generateWeekOptions, formatDateString } from '../../utils/gameweek';
import type { WeekOption } from '../../utils/gameweek';
import TeamStatsBar from '../../components/ui/TeamStatsBar';
import TeamSection from '../../components/ui/TeamSection';
import TeamHistory from '../../components/ui/TeamHistory';
import TeamGolferTable from '../../components/ui/TeamGolferTable';
import Toast from '../../components/ui/Toast';
import { useApiClient } from '../../hooks/useApiClient';
import { useActiveSeason } from '../../hooks/useActiveSeason';
import { useAuth } from '../../hooks/useAuth';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import type { GolferSeasonStats, MembershipType } from '@shared/types';
import type { TournamentScore } from '@shared/types';
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
    stats2024: GolferSeasonStats;
    stats2025: GolferSeasonStats;
    stats2026: GolferSeasonStats;
  };
  weekPoints: number;
  monthPoints: number;
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
    monthPoints: number;
    seasonPoints: number;
    totalSpent: number;
  };
  captainId: string | null;
  period: {
    weekStart: string;
    weekEnd: string;
    label: string;
    gameweek: number | null;
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
  history?: Array<{
    changedAt: string;
    reason: string;
    totalSpent: number;
    golferCount: number;
    addedGolfers: Array<{ id: string; name: string }>;
    removedGolfers: Array<{ id: string; name: string }>;
  }>;
}

const MyTeamPage: React.FC = () => {
  const [teamData, setTeamData] = useState<MyTeamApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [weekOptions, setWeekOptions] = useState<WeekOption[]>([]);
  const [savingCaptain, setSavingCaptain] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'warning' } | null>(null);
  const [captainBannerDismissed, setCaptainBannerDismissed] = useState(
    () => localStorage.getItem('captainBannerDismissed') === 'true',
  );
  const { get, post, isAuthReady } = useApiClient();
  const { season } = useActiveSeason();
  const { user: authUser } = useAuth();
  const seasonName = season?.name || '2026';
  useDocumentTitle('My Team');

  const fetchTeam = useCallback(
    async (date?: string) => {
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
          }
        } else {
          setError(response.error || 'Failed to load team');
        }
        setLoading(false);
      } catch {
        setError('Failed to load your team. Please try again.');
        setLoading(false);
      }
    },
    [get]
  );

  useEffect(() => {
    if (isAuthReady) {
      fetchTeam();
    }
  }, [isAuthReady, fetchTeam]);

  // Generate week options when both team data and season data are available
  useEffect(() => {
    if (teamData?.team?.teamEffectiveStart && season?.startDate) {
      const options = generateWeekOptions(teamData.team.teamEffectiveStart, season.startDate);
      setWeekOptions(options);
    }
  }, [teamData?.team?.teamEffectiveStart, season?.startDate]);

  // Navigation handlers
  const handleWeekNavigation = (direction: 'prev' | 'next') => {
    if (!selectedDate) return;
    const current = new Date(selectedDate);
    current.setDate(current.getDate() + (direction === 'next' ? 7 : -7));
    const newDate = formatDateString(current);
    setSelectedDate(newDate);
    fetchTeam(newDate);
  };

  // Handle setting a golfer as captain
  const handleSetCaptain = async (golferId: string) => {
    if (!teamData?.team || savingCaptain) return;

    // Determine new captain: toggle off if clicking current captain
    const currentCaptainId = teamData.team.captainId;
    const newCaptainId = golferId === currentCaptainId ? null : golferId;

    // Find golfer name for toast
    const golfer = teamData.team.golfers.find((g) => g.golfer.id === golferId);
    const golferName = golfer ? `${golfer.golfer.firstName} ${golfer.golfer.lastName}` : '';

    // Optimistic update — instant UI feedback
    setTeamData((prev) => {
      if (!prev?.team) return prev;
      return {
        ...prev,
        team: {
          ...prev.team,
          captainId: newCaptainId,
          golfers: prev.team.golfers.map((g) => ({
            ...g,
            isCaptain: g.golfer.id === newCaptainId,
          })),
        },
      };
    });

    // Show toast + dismiss banner permanently on first captain set
    if (newCaptainId) {
      setToast({ message: `👑 Captain Set: ${golferName}`, type: 'success' });
      if (!captainBannerDismissed) {
        setCaptainBannerDismissed(true);
        localStorage.setItem('captainBannerDismissed', 'true');
      }
    } else {
      setToast({ message: `👑 Captain Removed`, type: 'warning' });
    }

    setSavingCaptain(true);
    try {
      const response = await post('picks-save', {
        golferIds: teamData.team.golfers.map((g) => g.golfer.id),
        captainId: newCaptainId,
      });

      if (!response.success) {
        fetchTeam(selectedDate);
        setToast({ message: 'Failed to set captain', type: 'warning' });
      }
    } catch {
      fetchTeam(selectedDate);
      setToast({ message: 'Failed to set captain', type: 'warning' });
    } finally {
      setSavingCaptain(false);
    }
  };

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
              <button
                onClick={() => fetchTeam()}
                className="btn-primary"
                style={{ marginTop: '1rem' }}
              >
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
    <>
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
                    {teamData.unlimitedTransfers ||
                    teamData.transfersUsedThisWeek < teamData.maxTransfersPerWeek ? (
                      <Link to="/team-builder" className="btn-edit-team">
                        Edit Team →
                      </Link>
                    ) : (
                      <span className="transfers-exhausted">No transfers remaining</span>
                    )}
                  </>
                ) : (
                  <span className="transfers-locked">Transfers Locked</span>
                )}
              </div>
            </div>
          </div>

          {/* Captain Prompt — one-time only, dismissed permanently after first captain set */}
          {!captainBannerDismissed && !team.captainId && (
            <div className="captain-prompt-banner">
              <span className="banner-icon">⭐</span>
              <div className="banner-text">
                <h3>Pick Your Captain</h3>
                <p>
                  Tap the <span className="captain-badge-hint">C</span> next to a golfer&apos;s name
                  to make them captain. Your captain earns <strong>2× points</strong> every week!
                </p>
              </div>
            </div>
          )}

          {/* Stats Grid */}
          <TeamStatsBar
            weekPoints={team.totals.weekPoints}
            monthPoints={team.totals.monthPoints || 0}
            seasonPoints={team.totals.seasonPoints}
          />

          {/* Team Section */}
          <TeamSection
            firstName={authUser?.firstName || 'Your'}
            teamValue={team.totals.totalSpent}
          >
            <GameweekNav
              weekOptions={weekOptions}
              selectedDate={selectedDate || ''}
              hasPrevious={teamData?.team?.period?.hasPrevious ?? false}
              hasNext={teamData?.team?.period?.hasNext ?? false}
              onNavigate={handleWeekNavigation}
              onSelect={(date) => fetchTeam(date)}
            />

            {/* Error State */}
            {error && <div className="error-message">{error}</div>}

            {/* Golfers Table */}
            <TeamGolferTable
              golfers={sortedGolfers}
              weekTotal={team.totals.weekPoints}
              isOwnTeam={true}
              onSetCaptain={handleSetCaptain}
            />
          </TeamSection>

          {teamData?.history && teamData.history.length > 0 && (
            <TeamHistory history={teamData.history} />
          )}

          {/* Team Info Footer */}
          <div className="team-info-footer">
            <p>
              Team created:{' '}
              {new Date(team.createdAt).toLocaleDateString('en-GB', {
                day: 'numeric',
                month: 'long',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </p>
            <p>
              Team last updated:{' '}
              {new Date(team.updatedAt).toLocaleDateString('en-GB', {
                day: 'numeric',
                month: 'long',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </p>
            {!teamData.transfersOpen && (
              <p className="locked-notice">
                🔒 Transfer window is currently closed. You cannot make changes to your team.
              </p>
            )}
          </div>
        </div>
      </div>
    </PageLayout>
    {toast && (
      <Toast
        message={toast.message}
        type={toast.type}
        onClose={() => setToast(null)}
      />
    )}
    </>
  );
};

export default MyTeamPage;
