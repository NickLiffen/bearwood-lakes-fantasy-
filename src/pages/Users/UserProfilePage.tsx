// User Profile Page - View another user's profile, team, and stats

import React, { useEffect, useState, useRef, useCallback } from 'react';
import { Link, useParams } from 'react-router-dom';
import PageLayout from '../../components/layout/PageLayout';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import GameweekNav from '../../components/ui/GameweekNav';
import type { WeekOption } from '../../components/ui/GameweekNav';
import TeamStatsBar from '../../components/ui/TeamStatsBar';
import TeamGolferTable from '../../components/ui/TeamGolferTable';
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
  golferCount: number;
  addedGolfers: Array<{ id: string; name: string }>;
  removedGolfers: Array<{ id: string; name: string }>;
}

interface PeriodInfo {
  weekStart: string;
  weekEnd: string;
  label: string;
  hasPrevious: boolean;
  hasNext: boolean;
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

// Helper to format date as YYYY-MM-DD
const formatDateString = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
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

  // Generate week options from team effective start to current week (gameweek-aware)
  const generateWeekOptions = useCallback((teamStart: string): WeekOption[] => {
    const options: WeekOption[] = [];
    const start = new Date(teamStart);
    const now = new Date();
    // Find first Saturday on or after team start
    const firstSaturday = new Date(start);
    while (firstSaturday.getDay() !== 6) firstSaturday.setDate(firstSaturday.getDate() + 1);
    firstSaturday.setHours(0, 0, 0, 0);

    let current = new Date(firstSaturday);
    let gameweek = 1;
    while (current <= now || options.length === 0) {
      const weekEnd = new Date(current);
      weekEnd.setDate(current.getDate() + 6);
      const fmt: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
      const dateRange = `${current.toLocaleDateString('en-GB', fmt)} - ${weekEnd.toLocaleDateString('en-GB', fmt)}`;
      const year = current.getFullYear();
      const month = String(current.getMonth() + 1).padStart(2, '0');
      const day = String(current.getDate()).padStart(2, '0');
      options.push({
        value: `${year}-${month}-${day}`,
        label: `Gameweek ${gameweek}: ${dateRange}`,
      });
      current.setDate(current.getDate() + 7);
      gameweek++;
      if (current > now && options.length > 0) break;
    }
    return options.reverse();
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

          {/* Stats */}
          {hasTeam && stats && team && (
            <TeamStatsBar
              weekPoints={stats.weekPoints}
              seasonPoints={stats.seasonPoints}
              teamValue={team.totals.totalSpent}
              weekRank={stats.weekRank}
              seasonRank={stats.seasonRank}
            />
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
                <GameweekNav
                  weekOptions={weekOptions}
                  selectedDate={selectedDate || ''}
                  hasPrevious={profileData?.period?.hasPrevious ?? false}
                  hasNext={profileData?.period?.hasNext ?? false}
                  onNavigate={handleWeekNavigation}
                  onSelect={(date) => fetchUserProfile(date)}
                />

                {/* Team Total */}
                <div className="team-total">
                  <span className="total-label">Week Total:</span>
                  <span className="total-value">{team.totals.weekPoints} pts</span>
                </div>

                {/* Golfers Table */}
                <TeamGolferTable
                  golfers={team.golfers}
                  isOwnTeam={false}
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
                            {entry.addedGolfers.length > 0 && (
                              <div className="golfers-added">
                                {entry.addedGolfers.map((p) => (
                                  <span key={p.id} className="golfer-change added">
                                    + {p.name}
                                  </span>
                                ))}
                              </div>
                            )}
                            {entry.removedGolfers.length > 0 && (
                              <div className="golfers-removed">
                                {entry.removedGolfers.map((p) => (
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
