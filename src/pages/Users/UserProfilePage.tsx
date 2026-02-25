// User Profile Page - View another user's profile, team, and stats

import React, { useEffect, useState, useRef, useCallback } from 'react';
import { Link, useParams } from 'react-router-dom';
import PageLayout from '../../components/layout/PageLayout';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import PeriodNav from '../../components/ui/PeriodNav';
import { generateWeekOptions, formatDateString } from '../../utils/gameweek';
import type { PeriodOption } from '../../utils/gameweek';
import TeamStatsBar from '../../components/ui/TeamStatsBar';
import TeamSection from '../../components/ui/TeamSection';
import TeamGolferTable from '../../components/ui/TeamGolferTable';
import TeamHistory from '../../components/ui/TeamHistory';
import TeamCompareModal from '../../components/ui/TeamCompareModal';
import { useAuth } from '../../hooks/useAuth';
import { useApiClient } from '../../hooks/useApiClient';
import { useActiveSeason } from '../../hooks/useActiveSeason';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { formatDate } from '../../utils/formatters';
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

const UserProfilePage: React.FC = () => {
  const { userId } = useParams<{ userId: string }>();
  const [profileData, setProfileData] = useState<UserProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [weekOptions, setWeekOptions] = useState<PeriodOption[]>([]);
  const [showCompareModal, setShowCompareModal] = useState(false);

  // Check if this is the current user's profile
  const { user: currentUser } = useAuth();
  const currentUserId = currentUser?.id ?? null;
  const isOwnProfile = currentUserId === userId;
  const { get, isAuthReady } = useApiClient();
  const { season } = useActiveSeason();
  useDocumentTitle(
    profileData ? `${profileData.user.firstName} ${profileData.user.lastName}` : 'User Profile'
  );

  // Track request ID to ignore stale responses
  const requestIdRef = useRef(0);

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

          // Set selected date
          if (response.data.period) {
            const weekStart = new Date(response.data.period.weekStart);
            setSelectedDate(formatDateString(weekStart));
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
    [userId, get]
  );

  useEffect(() => {
    if (isAuthReady && userId) {
      fetchUserProfile();
    }
  }, [isAuthReady, userId, fetchUserProfile]);

  // Generate week options when both profile data and season data are available
  useEffect(() => {
    if (profileData?.teamEffectiveStart && season?.startDate) {
      const options = generateWeekOptions(profileData.teamEffectiveStart, season.startDate);
      setWeekOptions(options);
    }
  }, [profileData?.teamEffectiveStart, season?.startDate]);

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
              monthPoints={stats.monthPoints}
              seasonPoints={stats.seasonPoints}
              weekRank={stats.weekRank}
              monthRank={stats.monthRank}
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
              <TeamSection
                firstName={user.firstName}
                teamValue={team.totals.totalSpent}
              >
                {/* Week Navigation */}
                <PeriodNav
                  options={weekOptions}
                  selectedDate={selectedDate || ''}
                  hasPrevious={profileData?.period?.hasPrevious ?? false}
                  hasNext={profileData?.period?.hasNext ?? false}
                  onNavigate={handleWeekNavigation}
                  onSelect={(date) => fetchUserProfile(date)}
                />

                {/* Golfers Table */}
                <TeamGolferTable
                  golfers={team.golfers}
                  weekTotal={team.totals.weekPoints}
                  isOwnTeam={false}
                />
              </TeamSection>

              {/* Team History */}
              <TeamHistory history={history} />
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
