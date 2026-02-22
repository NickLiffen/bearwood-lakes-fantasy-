// User Profile Page - View another user's profile, team, and stats

import React, { useEffect, useState, useRef, useCallback } from 'react';
import { Link, useParams } from 'react-router-dom';
import PageLayout from '../../components/layout/PageLayout';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import DataTable, { Column } from '../../components/ui/DataTable';
import TeamCompareModal from '../../components/ui/TeamCompareModal';
import { useAuth } from '../../hooks/useAuth';
import { useApiClient } from '../../hooks/useApiClient';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { formatDate, formatDateTime, formatPrice } from '../../utils/formatters';
import './UserProfilePage.css';

interface GolferStats {
  timesBonusScored: number;
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
  rawScore: number;
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
  isCaptain: boolean;
}

interface HistoryEntry {
  changedAt: string;
  reason: string;
  totalSpent: number;
  playerCount: number;
  addedPlayers: Array<{ id: string; name: string }>;
  removedPlayers: Array<{ id: string; name: string }>;
}

interface PeriodInfo {
  weekStart: string;
  weekEnd: string;
  label: string;
  hasPrevious: boolean;
  hasNext: boolean;
}

interface WeekOption {
  value: string;
  label: string;
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
  period?: PeriodInfo;
  teamCreatedAt?: string;
  teamEffectiveStart?: string;
  captainId?: string | null;
  history: HistoryEntry[];
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
    year: 'numeric',
  });
};

const UserProfilePage: React.FC = () => {
  const { userId } = useParams<{ userId: string }>();
  const [profileData, setProfileData] = useState<UserProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [weekOptions, setWeekOptions] = useState<WeekOption[]>([]);
  const [showCompareModal, setShowCompareModal] = useState(false);

  // Check if this is the current user's profile
  const { user: currentUser } = useAuth();
  const currentUserId = currentUser?.id ?? null;
  const isOwnProfile = currentUserId === userId;
  const { get, isAuthReady } = useApiClient();
  useDocumentTitle(
    profileData ? `${profileData.user.firstName} ${profileData.user.lastName}` : 'User Profile'
  );

  // Track request ID to ignore stale responses
  const requestIdRef = useRef(0);

  // Generate week options from team effective start to current week
  // teamEffectiveStart is already a Saturday (from backend)
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

    // Always include at least current week
    if (options.length === 0) {
      const currentWeek = getSaturdayOfWeek(now);
      options.push({
        value: formatDateString(currentWeek),
        label: formatWeekLabel(currentWeek),
      });
    }

    return options;
  }, []);

  const fetchUserProfile = useCallback(
    async (date?: string) => {
      // Increment request ID - any in-flight requests with old IDs will be ignored
      const currentRequestId = ++requestIdRef.current;

      try {
        setLoading(true);
        setError(null);

        const endpoint = date
          ? `user-profile?userId=${userId}&date=${date}`
          : `user-profile?userId=${userId}`;
        const response = await get<UserProfileData>(endpoint);

        // Ignore if this is a stale request or was cancelled
        if (currentRequestId !== requestIdRef.current || response.cancelled) {
          return;
        }

        if (response.success && response.data) {
          setProfileData(response.data);

          // Set selected date and generate week options
          if (response.data.period) {
            const weekStart = new Date(response.data.period.weekStart);
            setSelectedDate(formatDateString(weekStart));

            // Generate week options if not already set
            if (weekOptions.length === 0 && response.data.teamEffectiveStart) {
              const options = generateWeekOptions(response.data.teamEffectiveStart);
              setWeekOptions(options);
            }
          }
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
    },
    [userId, get, weekOptions.length, generateWeekOptions]
  );

  useEffect(() => {
    if (isAuthReady && userId) {
      fetchUserProfile();
    }
  }, [isAuthReady, userId, fetchUserProfile]);

  // Navigation handlers
  const handleWeekNavigation = (direction: 'prev' | 'next') => {
    if (!selectedDate) return;
    const current = new Date(selectedDate);
    current.setDate(current.getDate() + (direction === 'next' ? 7 : -7));
    const newDate = formatDateString(current);
    setSelectedDate(newDate);
    fetchUserProfile(newDate);
  };

  const handleWeekSelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newDate = e.target.value;
    setSelectedDate(newDate);
    fetchUserProfile(newDate);
  };

  // Helper functions
  const getRankDisplay = (rank: number | null) => {
    if (rank === null) return '-';
    if (rank === 1) return '🥇 1st';
    if (rank === 2) return '🥈 2nd';
    if (rank === 3) return '🥉 3rd';
    return `#${rank}`;
  };

  // Column definitions for DataTable
  const getColumns = (): Column<GolferWithScores>[] => [
    {
      key: 'captain',
      header: 'C',
      align: 'center',
      render: (golferData) =>
        golferData.isCaptain ? (
          <span className="captain-indicator" title="Captain (2x points)">
            C
          </span>
        ) : null,
    },
    {
      key: 'golfer',
      header: 'Golfer',
      render: (golferData) => (
        <div className="dt-info-cell">
          <div className="dt-avatar">
            {golferData.golfer.picture ? (
              <img
                src={golferData.golfer.picture}
                alt={`${golferData.golfer.firstName} ${golferData.golfer.lastName}`}
                loading="lazy"
              />
            ) : (
              <span className="dt-avatar-placeholder">
                {golferData.golfer.firstName[0]}
                {golferData.golfer.lastName[0]}
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
              <Link to="/users" className="btn-back">
                ← Back to Users
              </Link>
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
          <Link to="/users" className="user-profile-back-link">
            ← Back to Users
          </Link>

          {/* Profile Header */}
          <div className="profile-header-card">
            <div className="profile-avatar-large">
              {user.firstName[0]}
              {user.lastName[0]}
            </div>
            <div className="profile-header-info">
              <h1>
                {user.firstName} {user.lastName}
              </h1>
              <p className="profile-username">@{user.username}</p>
              <p className="profile-member-since">Member since {formatDate(user.createdAt)}</p>
              {hasTeam && team && (
                <p className="profile-team-created">Team created {formatDate(team.createdAt)}</p>
              )}
              {isOwnProfile && <span className="own-profile-badge">This is you!</span>}
            </div>
            {hasTeam && !isOwnProfile && (
              <button className="btn-compare" onClick={() => setShowCompareModal(true)}>
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
              <div className="stat-card">
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
                  <span className="team-value">
                    {formatPrice(team.totals.totalSpent)} team value
                  </span>
                </div>

                {/* Week Navigation */}
                <div className="period-navigation">
                  <button
                    className="nav-btn"
                    onClick={() => handleWeekNavigation('prev')}
                    disabled={!profileData?.period?.hasPrevious}
                    title="Previous week"
                  >
                    ←
                  </button>
                  <select
                    id="profile-period"
                    name="profile-period"
                    className="period-select"
                    value={selectedDate}
                    onChange={handleWeekSelect}
                  >
                    {weekOptions.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                  <button
                    className="nav-btn"
                    onClick={() => handleWeekNavigation('next')}
                    disabled={!profileData?.period?.hasNext}
                    title="Next week"
                  >
                    →
                  </button>
                </div>

                {/* Team Total */}
                <div className="team-total">
                  <span className="total-label">Week Total:</span>
                  <span className="total-value">{team.totals.weekPoints} pts</span>
                </div>

                {/* Golfers Table - Using DataTable */}
                <DataTable
                  data={team.golfers}
                  columns={getColumns()}
                  rowKey={(golferData) => golferData.golfer.id}
                  emptyMessage="No golfers in this team."
                />
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
                                {entry.addedPlayers.map((p) => (
                                  <span key={p.id} className="golfer-change added">
                                    + {p.name}
                                  </span>
                                ))}
                              </div>
                            )}
                            {entry.removedPlayers.length > 0 && (
                              <div className="golfers-removed">
                                {entry.removedPlayers.map((p) => (
                                  <span key={p.id} className="golfer-change removed">
                                    - {p.name}
                                  </span>
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
        <TeamCompareModal targetUserId={userId} onClose={() => setShowCompareModal(false)} />
      )}
    </PageLayout>
  );
};

export default UserProfilePage;
