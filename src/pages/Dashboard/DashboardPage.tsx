// Dashboard page (logged-in home)

import React, { useState, useEffect, useCallback, memo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import PageLayout from '../../components/layout/PageLayout';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import { useAuth } from '../../hooks/useAuth';
import { useApiClient } from '../../hooks/useApiClient';
import { useActiveSeason } from '../../hooks/useActiveSeason';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import './DashboardPage.css';

// Get the next Saturday at 8am (weekly deadline)
const getNextSaturdayDeadline = (): Date => {
  const now = new Date();
  const dayOfWeek = now.getDay(); // 0 = Sunday, 6 = Saturday

  // Calculate days until next Saturday
  let daysUntilSaturday: number;
  if (dayOfWeek === 6) {
    // It's Saturday - check if we're past 8am
    const saturdayDeadline = new Date(now);
    saturdayDeadline.setHours(8, 0, 0, 0);
    if (now >= saturdayDeadline) {
      // Past 8am Saturday, next deadline is next Saturday
      daysUntilSaturday = 7;
    } else {
      // Before 8am Saturday, deadline is today
      daysUntilSaturday = 0;
    }
  } else {
    // Days until Saturday: Saturday(6) - currentDay, but if Sunday(0), it's 6 days
    daysUntilSaturday = (6 - dayOfWeek + 7) % 7;
    if (daysUntilSaturday === 0) daysUntilSaturday = 7;
  }

  const nextSaturday = new Date(now);
  nextSaturday.setDate(now.getDate() + daysUntilSaturday);
  nextSaturday.setHours(8, 0, 0, 0);
  return nextSaturday;
};

interface TimeRemaining {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
}

// Memoized countdown timer component to prevent parent re-renders
const CountdownTimer = memo(() => {
  const [timeRemaining, setTimeRemaining] = useState<TimeRemaining>(() => {
    const deadline = getNextSaturdayDeadline();
    const total = deadline.getTime() - Date.now();
    return {
      days: Math.floor(total / (1000 * 60 * 60 * 24)),
      hours: Math.floor((total / (1000 * 60 * 60)) % 24),
      minutes: Math.floor((total / (1000 * 60)) % 60),
      seconds: Math.floor((total / 1000) % 60),
    };
  });

  useEffect(() => {
    const timer = setInterval(() => {
      const deadline = getNextSaturdayDeadline();
      const total = deadline.getTime() - Date.now();

      if (total <= 0) {
        // Deadline passed, recalculate for next week
        const newDeadline = getNextSaturdayDeadline();
        const newTotal = newDeadline.getTime() - Date.now();
        setTimeRemaining({
          days: Math.floor(newTotal / (1000 * 60 * 60 * 24)),
          hours: Math.floor((newTotal / (1000 * 60 * 60)) % 24),
          minutes: Math.floor((newTotal / (1000 * 60)) % 60),
          seconds: Math.floor((newTotal / 1000) % 60),
        });
      } else {
        setTimeRemaining({
          days: Math.floor(total / (1000 * 60 * 60 * 24)),
          hours: Math.floor((total / (1000 * 60 * 60)) % 24),
          minutes: Math.floor((total / (1000 * 60)) % 60),
          seconds: Math.floor((total / 1000) % 60),
        });
      }
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  return (
    <section className="countdown-section">
      <div className="countdown-header">
        <span className="countdown-icon">&#9200;</span>
        <h2>Weekly Deadline</h2>
      </div>
      <p className="countdown-subtitle">Get your team in before Saturday 8am</p>
      <div className="countdown-timer">
        <div className="countdown-unit">
          <span className="countdown-value">{timeRemaining.days}</span>
          <span className="countdown-label">Days</span>
        </div>
        <div className="countdown-separator">:</div>
        <div className="countdown-unit">
          <span className="countdown-value">{String(timeRemaining.hours).padStart(2, '0')}</span>
          <span className="countdown-label">Hours</span>
        </div>
        <div className="countdown-separator">:</div>
        <div className="countdown-unit">
          <span className="countdown-value">{String(timeRemaining.minutes).padStart(2, '0')}</span>
          <span className="countdown-label">Mins</span>
        </div>
        <div className="countdown-separator">:</div>
        <div className="countdown-unit">
          <span className="countdown-value">{String(timeRemaining.seconds).padStart(2, '0')}</span>
          <span className="countdown-label">Secs</span>
        </div>
      </div>
    </section>
  );
});

CountdownTimer.displayName = 'CountdownTimer';

interface MyTeamResponse {
  hasTeam: boolean;
  transfersOpen: boolean;
  allowNewTeamCreation: boolean;
  team: {
    golfers: Array<{
      golfer: { id: string; firstName: string; lastName: string; price: number };
      weekPoints: number;
      monthPoints: number;
      seasonPoints: number;
    }>;
    totals: {
      weekPoints: number;
      monthPoints: number;
      seasonPoints: number;
      totalSpent: number;
    };
  } | null;
}

interface FantasyUser {
  id: string;
  firstName: string;
  lastName: string;
  username: string;
  hasTeam: boolean;
  weekPoints: number;
  monthPoints: number;
  seasonPoints: number;
  seasonRank: number | null;
}

interface Tournament {
  id: string;
  name: string;
  status: 'draft' | 'published' | 'complete';
  startDate: string;
  tournamentType: string;
  multiplier: number;
}

const DashboardPage: React.FC = () => {
  const { user } = useAuth();
  const { get, isAuthReady } = useApiClient();
  const { season } = useActiveSeason();
  const navigate = useNavigate();
  const seasonName = season?.name || '2026';
  useDocumentTitle('Dashboard');

  // Individual loading states for each section
  const [statsLoading, setStatsLoading] = useState(true);
  const [leaderboardLoading, setLeaderboardLoading] = useState(true);
  const [tournamentsLoading, setTournamentsLoading] = useState(true);

  const [teamData, setTeamData] = useState<MyTeamResponse | null>(null);
  const [leaderboardData, setLeaderboardData] = useState<FantasyUser[]>([]);
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Fetch team/stats data
  const fetchStatsData = useCallback(async () => {
    if (!isAuthReady) return;

    setStatsLoading(true);
    try {
      const teamRes = await get<MyTeamResponse>('my-team');
      if (teamRes.cancelled) return;
      if (teamRes.success && teamRes.data) {
        setTeamData(teamRes.data);
      }
    } catch {
      setError('Failed to load stats data.');
    } finally {
      setStatsLoading(false);
    }
  }, [get, isAuthReady]);

  // Fetch leaderboard data
  const fetchLeaderboardData = useCallback(async () => {
    if (!isAuthReady) return;

    setLeaderboardLoading(true);
    try {
      const usersRes = await get<FantasyUser[]>('users-fantasy');
      if (usersRes.cancelled) return;
      if (usersRes.success && usersRes.data) {
        setLeaderboardData(usersRes.data.slice(0, 5));
      }
    } catch {
      setError('Failed to load leaderboard data.');
    } finally {
      setLeaderboardLoading(false);
    }
  }, [get, isAuthReady]);

  // Fetch tournaments data
  const fetchTournamentsData = useCallback(async () => {
    if (!isAuthReady) return;

    setTournamentsLoading(true);
    try {
      const tournamentsRes = await get<Tournament[]>('tournaments-list');
      if (tournamentsRes.cancelled) return;
      if (tournamentsRes.success && tournamentsRes.data) {
        // Only show complete tournaments (those with scores), most recent first
        const recent = tournamentsRes.data
          .filter((t) => t.status === 'complete')
          .sort((a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime())
          .slice(0, 3);
        setTournaments(recent);
      }
    } catch {
      setError('Failed to load tournaments data.');
    } finally {
      setTournamentsLoading(false);
    }
  }, [get, isAuthReady]);

  // Fetch all data on mount
  useEffect(() => {
    if (!isAuthReady) return;
    setError(null);
    fetchStatsData();
    fetchLeaderboardData();
    fetchTournamentsData();
  }, [isAuthReady, fetchStatsData, fetchLeaderboardData, fetchTournamentsData]);

  // Computed values
  const hasTeam = teamData?.hasTeam ?? false;
  const golferCount = teamData?.team?.golfers.length ?? 0;

  return (
    <PageLayout activeNav="dashboard">
      <div className="dashboard-content">
        <div className="dashboard-container">
          {/* Welcome Section */}
          <section className="welcome-section">
            <h1>Welcome back, {user?.firstName || 'Guest'}!</h1>
            <p>{`Here's what's happening in the ${seasonName} Fantasy Golf season.`}</p>
          </section>

          {/* Error State */}
          {error && (
            <div className="error-message">
              {error}
              <button
                onClick={() => {
                  setError(null);
                  fetchStatsData();
                  fetchLeaderboardData();
                  fetchTournamentsData();
                }}
                className="btn btn-secondary btn-sm"
              >
                Retry
              </button>
            </div>
          )}

          {/* Weekly Deadline Countdown */}
          <CountdownTimer />

          {/* Incomplete Team Banner - only show if has team but less than 6 golfers */}
          {!statsLoading && hasTeam && golferCount < 6 && (
            <section className="action-banner action-banner-warning">
              <div className="banner-content">
                <h2>Complete your team!</h2>
                <p>
                  You have {golferCount} of 6 golfers selected. Add {6 - golferCount} more to
                  complete your team.
                </p>
              </div>
              <Link to="/my-team" className="btn btn-primary">
                Complete Team
              </Link>
            </section>
          )}

          {/* My Team Snapshot - Full width card */}
          <section className="dashboard-card team-snapshot-card">
            <div className="card-header">
              <h2>My Team</h2>
              <Link to="/my-team" className="card-link">
                View Team →
              </Link>
            </div>
            <div className="team-snapshot">
              {statsLoading ? (
                <div className="section-loading">
                  <LoadingSpinner size="medium" fullPage={false} text="Loading team..." />
                </div>
              ) : !hasTeam ? (
                <div className="empty-state-small">
                  <p>You haven't created a team yet.</p>
                  <Link to="/my-team" className="btn btn-primary btn-sm">
                    Create Team
                  </Link>
                </div>
              ) : (
                <>
                  <div className="team-week-total">
                    <span className="week-total-label">Week Points</span>
                    <span className="week-total-value">
                      {teamData?.team?.totals.weekPoints || 0} pts
                    </span>
                  </div>
                  <div className="team-golfer-list">
                    {teamData?.team?.golfers
                      .slice()
                      .sort((a, b) => b.weekPoints - a.weekPoints)
                      .map((entry, index) => (
                        <Link
                          key={entry.golfer.id}
                          to={`/golfers/${entry.golfer.id}`}
                          className="team-golfer-row"
                        >
                          <span className="golfer-rank">{index + 1}.</span>
                          <span className="golfer-name-cell">
                            {entry.golfer.firstName} {entry.golfer.lastName}
                          </span>
                          <span
                            className={`golfer-week-points ${entry.weekPoints > 0 ? 'has-points' : ''}`}
                          >
                            {entry.weekPoints > 0 ? '+' : ''}
                            {entry.weekPoints} pts
                          </span>
                        </Link>
                      ))}
                  </div>
                </>
              )}
            </div>
          </section>

          {/* Two Column Layout */}
          <div className="dashboard-grid">
            {/* Leaderboard Table */}
            <section className="dashboard-card">
              <div className="card-header">
                <h2>🏆 Leaderboard</h2>
                <Link to="/leaderboard" className="card-link">
                  View Full →
                </Link>
              </div>
              <div className="table-container">
                {leaderboardLoading ? (
                  <div className="section-loading">
                    <LoadingSpinner size="medium" fullPage={false} text="Loading leaderboard..." />
                  </div>
                ) : leaderboardData.length === 0 ? (
                  <div className="empty-state-small">
                    <p>No rankings yet. Be the first to pick your team!</p>
                  </div>
                ) : (
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Rank</th>
                        <th>Player</th>
                        <th>Points</th>
                        <th>Week</th>
                      </tr>
                    </thead>
                    <tbody>
                      {leaderboardData.map((entry, index) => (
                        <tr
                          key={entry.id}
                          className={entry.id === user?.id ? 'current-user-row' : ''}
                          onClick={() => navigate(`/users/${entry.id}`)}
                          style={{ cursor: 'pointer' }}
                        >
                          <td>
                            <span className={`rank rank-${index + 1}`}>
                              {index === 0 && '🥇'}
                              {index === 1 && '🥈'}
                              {index === 2 && '🥉'}
                              {index > 2 && index + 1}
                            </span>
                          </td>
                          <td className="golfer-name">
                            {entry.firstName} {entry.lastName}
                            {entry.id === user?.id && <span className="dt-you-badge">You</span>}
                          </td>
                          <td className="points">{entry.seasonPoints.toLocaleString()}</td>
                          <td className="last-points">+{entry.weekPoints}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </section>

            {/* Recent Tournaments */}
            <section className="dashboard-card">
              <div className="card-header">
                <h2>⛳ Recent Tournaments</h2>
                <Link to="/tournaments" className="card-link">
                  View Tournaments →
                </Link>
              </div>
              <div className="tournaments-list">
                {tournamentsLoading ? (
                  <div className="section-loading">
                    <LoadingSpinner size="medium" fullPage={false} text="Loading tournaments..." />
                  </div>
                ) : tournaments.length === 0 ? (
                  <div className="empty-state-small">
                    <p>No tournaments scheduled yet.</p>
                  </div>
                ) : (
                  tournaments.map((tournament) => (
                    <Link
                      key={tournament.id}
                      to={`/tournaments/${tournament.id}`}
                      className="tournament-item tournament-item-link"
                    >
                      <div className="tournament-info">
                        <span className="tournament-name">{tournament.name}</span>
                        <span className="tournament-date">
                          {new Date(tournament.startDate).toLocaleDateString('en-GB', {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric',
                          })}
                        </span>
                      </div>
                      <div className="tournament-meta">
                        <span className="tournament-status status-complete">Complete</span>
                        {tournament.multiplier > 1 && (
                          <span className="tournament-multiplier">{tournament.multiplier}x</span>
                        )}
                      </div>
                    </Link>
                  ))
                )}
              </div>
            </section>
          </div>
        </div>
      </div>
    </PageLayout>
  );
};

export default DashboardPage;
