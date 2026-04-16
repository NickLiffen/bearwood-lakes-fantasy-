// My Team Page - View your fantasy team and scores

import React, { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import PageLayout from '../../components/layout/PageLayout';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import PeriodNav from '../../components/ui/PeriodNav';
import { generateWeekOptions, formatDateString } from '../../utils/gameweek';
import type { PeriodOption } from '../../utils/gameweek';
import TeamStatsBar from '../../components/ui/TeamStatsBar';
import TeamSection from '../../components/ui/TeamSection';
import TeamHistory from '../../components/ui/TeamHistory';
import TeamGolferTable from '../../components/ui/TeamGolferTable';
import Toast from '../../components/ui/Toast';
import { useApiClient } from '../../hooks/useApiClient';
import { useActiveSeason } from '../../hooks/useActiveSeason';
import { useAuth } from '../../hooks/useAuth';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import type { GolferSeasonStats } from '@shared/types';
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
    previousDate?: string | null;
    nextDate?: string | null;
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
  pendingChanges?: {
    pendingGolferIds: string[] | null;
    pendingCaptainId?: string | null;
    pendingChangedAt: string | null;
    addedGolfers: Array<{ id: string; name: string }> | null;
    removedGolfers: Array<{ id: string; name: string }> | null;
  } | null;
}

const MyTeamPage: React.FC = () => {
  const [teamData, setTeamData] = useState<MyTeamApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [weekOptions, setWeekOptions] = useState<PeriodOption[]>([]);
  const [savingCaptain, setSavingCaptain] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'warning' } | null>(null);
  const [captainBannerDismissed, setCaptainBannerDismissed] = useState(
    () => localStorage.getItem('captainBannerDismissed') === 'true'
  );
  const [cancellingPending, setCancellingPending] = useState(false);
  const { get, post, isAuthReady } = useApiClient();
  const { season } = useActiveSeason();
  const { user: authUser } = useAuth();
  const seasonName = season?.name || '2026';
  useDocumentTitle('My Team');

  const fetchTeam = useCallback(
    async (date?: string, { silent = false } = {}) => {
      if (!silent) {
        setLoading(true);
        setError(null);
      }

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
        } else if (!silent) {
          setError(response.error || 'Failed to load team');
        }
        if (!silent) setLoading(false);
      } catch {
        if (!silent) {
          setError('Failed to load your team. Please try again.');
          setLoading(false);
        }
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
      const options = generateWeekOptions(
        teamData.team.teamEffectiveStart,
        season.startDate,
        season?.firstGameweekStart
      );
      setWeekOptions(options);
    }
  }, [teamData?.team?.teamEffectiveStart, season?.startDate, season?.firstGameweekStart]);

  // Navigation handlers
  const handleWeekNavigation = (direction: 'prev' | 'next') => {
    const period = teamData?.team?.period;
    if (!period) return;

    // Use backend-provided dates that correctly handle variable-length GW1
    const targetDate = direction === 'next' ? period.nextDate : period.previousDate;

    if (targetDate) {
      setSelectedDate(targetDate);
      fetchTeam(targetDate);
    }
  };

  // Handle cancelling pending changes
  const handleCancelPending = async () => {
    if (cancellingPending) return;
    setCancellingPending(true);
    try {
      const response = await post('picks-cancel-pending', {});
      if (response.success) {
        setToast({ message: 'Pending changes cancelled', type: 'success' });
        fetchTeam(selectedDate);
      } else {
        setToast({ message: 'Failed to cancel pending changes', type: 'warning' });
      }
    } catch {
      setToast({ message: 'Failed to cancel pending changes', type: 'warning' });
    } finally {
      setCancellingPending(false);
    }
  };

  // Handle setting a golfer as captain
  const handleSetCaptain = async (golferId: string) => {
    if (!teamData?.team || savingCaptain) return;

    // Determine new captain: toggle off if clicking the effective captain
    // Use pending captain when a pending change exists, otherwise active captain
    const effectiveCaptainId =
      teamData.pendingChanges?.pendingCaptainId !== undefined
        ? teamData.pendingChanges.pendingCaptainId
        : teamData.team.captainId;
    const newCaptainId = golferId === effectiveCaptainId ? null : golferId;

    // Find golfer name for toast (check current team and pending additions)
    const golfer = teamData.team.golfers.find((g) => g.golfer.id === golferId);
    const pendingAdded = teamData.pendingChanges?.addedGolfers?.find((g) => g.id === golferId);
    const golferName = golfer
      ? `${golfer.golfer.firstName} ${golfer.golfer.lastName}`
      : (pendingAdded?.name ?? '');

    const willBeDeferred = !teamData.unlimitedTransfers;

    // Snapshot state before optimistic update so we can revert on failure
    const previousTeamData = teamData;

    if (willBeDeferred) {
      // Deferred: update pendingChanges, keep current captain unchanged
      setTeamData((prev) => {
        if (!prev?.team) return prev;
        return {
          ...prev,
          pendingChanges: {
            pendingGolferIds: prev.pendingChanges?.pendingGolferIds || null,
            pendingCaptainId: newCaptainId,
            pendingChangedAt: new Date().toISOString(),
            addedGolfers: prev.pendingChanges?.addedGolfers || null,
            removedGolfers: prev.pendingChanges?.removedGolfers || null,
          },
        };
      });
    } else {
      // Immediate: optimistic update to captain
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
    }

    // Dismiss captain hint banner on first captain set
    if (newCaptainId && !captainBannerDismissed) {
      setCaptainBannerDismissed(true);
      localStorage.setItem('captainBannerDismissed', 'true');
    }

    setSavingCaptain(true);
    try {
      const response = await post('picks-save', {
        golferIds:
          teamData.pendingChanges?.pendingGolferIds ??
          teamData.team.golfers.map((g) => g.golfer.id),
        captainId: newCaptainId,
      });

      if (response.success) {
        // Show toast based on whether the change was deferred
        if (willBeDeferred) {
          if (newCaptainId) {
            setToast({
              message: `👑 Captain scheduled for next gameweek: ${golferName}`,
              type: 'success',
            });
          } else {
            setToast({
              message: `👑 Captain removal scheduled for next gameweek`,
              type: 'success',
            });
          }
        } else {
          if (newCaptainId) {
            setToast({ message: `👑 Captain Set: ${golferName}`, type: 'success' });
          } else {
            setToast({ message: `👑 Captain Removed`, type: 'warning' });
          }
        }
        // Re-fetch to sync with authoritative server state (silent to avoid spinner flash)
        fetchTeam(selectedDate, { silent: true });
      } else {
        // Revert optimistic update so UI reflects the actual server state
        setTeamData(previousTeamData);
        setToast({ message: 'Failed to set captain', type: 'warning' });
      }
    } catch {
      setTeamData(previousTeamData);
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
                    Tap the <span className="captain-badge-hint">C</span> next to a golfer&apos;s
                    name to make them captain. Your captain earns <strong>2× points</strong> every
                    week!
                  </p>
                </div>
              </div>
            )}

            {/* Pending Changes Banner */}
            {teamData.pendingChanges && (
              <div className="pending-changes-banner">
                <span className="banner-icon">🔄</span>
                <div className="banner-text">
                  <h3>Scheduled for Next Gameweek</h3>
                  {teamData.pendingChanges.pendingGolferIds &&
                    team &&
                    (() => {
                      const removed = teamData.pendingChanges!.removedGolfers ?? [];
                      const added = teamData.pendingChanges!.addedGolfers ?? [];
                      if (added.length === 0 && removed.length === 0) return null;
                      const removedNames = removed.map((g) => g.name).join(', ');
                      const pendingCaptainId = teamData.pendingChanges!.pendingCaptainId;
                      return (
                        <p>
                          {removed.length > 0 && <>Swapping out {removedNames}</>}
                          {removed.length > 0 && added.length > 0 && ' → '}
                          {added.length > 0 && (
                            <>
                              {removed.length === 0 ? 'A' : 'a'}dding{' '}
                              {added.map((g, i) => (
                                <React.Fragment key={g.id}>
                                  {i > 0 && ', '}
                                  {g.name}
                                  {pendingCaptainId === g.id ? (
                                    <button
                                      className="pending-captain-badge"
                                      onClick={() => handleSetCaptain(g.id)}
                                      disabled={savingCaptain}
                                      title="Remove captain"
                                    >
                                      👑 Captain
                                    </button>
                                  ) : (
                                    <button
                                      className="btn-make-pending-captain"
                                      onClick={() => handleSetCaptain(g.id)}
                                      disabled={savingCaptain}
                                    >
                                      Make Captain
                                    </button>
                                  )}
                                </React.Fragment>
                              ))}
                            </>
                          )}
                        </p>
                      );
                    })()}
                  {teamData.pendingChanges.pendingCaptainId !== undefined &&
                    teamData.pendingChanges.pendingCaptainId !== team?.captainId &&
                    (() => {
                      const pendingCaptainId = teamData.pendingChanges!.pendingCaptainId;
                      const oldCaptain = team?.golfers.find((g) => g.golfer.id === team?.captainId);
                      const newCaptain = team?.golfers.find(
                        (g) => g.golfer.id === pendingCaptainId
                      );
                      const pendingAddedCaptain = !newCaptain
                        ? teamData.pendingChanges!.addedGolfers?.find(
                            (g) => g.id === pendingCaptainId
                          )
                        : undefined;
                      const oldName = oldCaptain
                        ? `${oldCaptain.golfer.firstName} ${oldCaptain.golfer.lastName}`
                        : 'None';
                      const newName = newCaptain
                        ? `${newCaptain.golfer.firstName} ${newCaptain.golfer.lastName}`
                        : (pendingAddedCaptain?.name ?? 'None');
                      return (
                        <p>
                          Captain change scheduled: {oldName} → {newName}
                        </p>
                      );
                    })()}
                  {teamData.pendingChanges.pendingChangedAt && (
                    <p className="pending-date">
                      Changed on{' '}
                      {new Date(teamData.pendingChanges.pendingChangedAt).toLocaleString('en-GB', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </p>
                  )}
                </div>
                <button
                  className="btn-cancel-pending"
                  onClick={handleCancelPending}
                  disabled={cancellingPending}
                >
                  {cancellingPending ? 'Cancelling...' : 'Cancel Changes'}
                </button>
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
              <PeriodNav
                id="my-team-period-select"
                options={weekOptions}
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
                weekLabel={team.period.label}
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
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </>
  );
};

export default MyTeamPage;
