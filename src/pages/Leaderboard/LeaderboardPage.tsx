// Leaderboard Page - Three separate tables: Weekly, Monthly, Season with navigation

import React, { useEffect, useState, useCallback } from 'react';
import PageLayout from '../../components/layout/PageLayout';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import SeasonSelector from '../../components/ui/SeasonSelector';
import TeamCompareModal from '../../components/ui/TeamCompareModal';
import TeamOfTheWeekModal from '../../components/ui/TeamOfTheWeekModal';
import {
  LeaderCard,
  LeaderboardSection,
  useLeaderboardColumns,
} from '../../components/leaderboard';
import type { LeaderboardEntry, PeriodInfo } from '../../components/leaderboard';
import { useAuth } from '../../hooks/useAuth';
import { useApiClient } from '../../hooks/useApiClient';
import { useActiveSeason } from '../../hooks/useActiveSeason';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import {
  getSaturdayOfWeek,
  formatDateString,
  generateWeekOptions,
  generateMonthOptions,
} from '../../utils/gameweek';
import type { PeriodOption } from '../../utils/gameweek';
import './LeaderboardPage.css';

interface LeaderboardResponse {
  entries: LeaderboardEntry[];
  period: PeriodInfo | null;
  tournamentCount: number;
}

interface LeadersResponse {
  weeklyLeader: LeaderboardEntry | null;
  monthlyLeader: LeaderboardEntry | null;
  seasonLeader: LeaderboardEntry | null;
  currentWeek: PeriodInfo;
  currentMonth: PeriodInfo;
  seasonInfo: PeriodInfo;
}

const LeaderboardPage: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [compareUserId, setCompareUserId] = useState<string | null>(null);
  const [showTeamOfWeek, setShowTeamOfWeek] = useState(false);
  const [selectedSeason, setSelectedSeason] = useState<string>('2026');

  // Get user from useAuth hook for current user check
  const { user } = useAuth();
  const userId = user?.id; // Use primitive value for dependency
  const { get, isAuthReady } = useApiClient();
  const { season } = useActiveSeason();
  useDocumentTitle('Leaderboard');

  // Initialize selectedSeason from active season
  useEffect(() => {
    if (season?.name && !selectedSeason) {
      setSelectedSeason(season.name);
    }
  }, [season?.name, selectedSeason]);

  // Leaders state
  const [leaders, setLeaders] = useState<LeadersResponse | null>(null);

  // Table data state
  const [weeklyData, setWeeklyData] = useState<LeaderboardResponse | null>(null);
  const [monthlyData, setMonthlyData] = useState<LeaderboardResponse | null>(null);
  const [seasonData, setSeasonData] = useState<LeaderboardResponse | null>(null);

  // Current selections
  const [weeklyDate, setWeeklyDate] = useState<string>('');
  const [monthlyDate, setMonthlyDate] = useState<string>('');

  // Dropdown options
  const [weekOptions, setWeekOptions] = useState<PeriodOption[]>([]);
  const [monthOptions, setMonthOptions] = useState<PeriodOption[]>([]);

  // Pagination state
  const [weeklyPage, setWeeklyPage] = useState(1);
  const [monthlyPage, setMonthlyPage] = useState(1);
  const [seasonPage, setSeasonPage] = useState(1);

  const fetchPeriodData = useCallback(
    async (period: 'week' | 'month' | 'season', date?: string) => {
      if (!selectedSeason) return null;
      try {
        let url = `leaderboard-periods?period=${period}`;
        if (date) {
          url += `&date=${date}`;
        }
        url += `&season=${selectedSeason}`;

        const response = await get<LeaderboardResponse>(url);

        // Ignore cancelled requests
        if (response.cancelled) return null;

        if (response.success && response.data) {
          return response.data;
        }
        return null;
      } catch (err) {
        console.error(`Failed to fetch ${period} data:`, err);
        return null;
      }
    },
    [get, selectedSeason]
  );

  // Reset and re-fetch when selectedSeason changes
  useEffect(() => {
    if (!isAuthReady || !userId || !selectedSeason) return;
    let cancelled = false;

    // Reset selections when season changes
    setWeeklyDate('');
    setMonthlyDate('');
    setWeekOptions([]);
    setMonthOptions([]);
    setWeeklyPage(1);
    setMonthlyPage(1);
    setSeasonPage(1);
    setShowTeamOfWeek(false);

    const loadInitialData = async () => {
      setLoading(true);
      setError(null);
      try {
        const leadersResponse = await get<LeadersResponse>(
          `leaderboard-periods?action=leaders&season=${selectedSeason}`
        );
        if (leadersResponse.cancelled || cancelled) return;

        if (leadersResponse.success && leadersResponse.data) {
          setLeaders(leadersResponse.data);

          if (leadersResponse.data.currentWeek) {
            setWeeklyDate(
              formatDateString(
                getSaturdayOfWeek(
                  new Date(leadersResponse.data.currentWeek.startDate),
                  season?.firstGameweekStart
                )
              )
            );
          }
          if (leadersResponse.data.currentMonth) {
            const d = new Date(leadersResponse.data.currentMonth.startDate);
            const year = d.getFullYear();
            const month = String(d.getMonth() + 1).padStart(2, '0');
            setMonthlyDate(`${year}-${month}-01`);
          }
          if (leadersResponse.data.seasonInfo) {
            setWeekOptions(
              generateWeekOptions(
                leadersResponse.data.seasonInfo.startDate,
                leadersResponse.data.seasonInfo.startDate,
                season?.firstGameweekStart
              )
            );
            setMonthOptions(generateMonthOptions(leadersResponse.data.seasonInfo.startDate));
          }
        }

        // Fetch all three tables in parallel
        const [weekly, monthly, seasonData] = await Promise.all([
          fetchPeriodData('week'),
          fetchPeriodData('month'),
          fetchPeriodData('season'),
        ]);
        if (cancelled) return;

        setWeeklyData(weekly);
        setMonthlyData(monthly);
        setSeasonData(seasonData);
      } catch {
        if (!cancelled) setError('Failed to load leaderboard. Please refresh the page.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    loadInitialData();
    return () => {
      cancelled = true;
    };
  }, [isAuthReady, userId, selectedSeason, get, fetchPeriodData, season?.firstGameweekStart]);

  // Navigation handlers
  const handleWeekNavigation = async (direction: 'prev' | 'next') => {
    if (!weeklyData?.period) return;

    // Use backend-provided dates that correctly handle variable-length GW1
    const targetDate =
      direction === 'next'
        ? weeklyData.period.nextDate
        : weeklyData.period.previousDate;

    if (!targetDate) return;

    setWeeklyDate(targetDate);
    setWeeklyPage(1);
    const data = await fetchPeriodData('week', targetDate);
    if (data) setWeeklyData(data);
  };

  const handleMonthNavigation = async (direction: 'prev' | 'next') => {
    if (!monthlyData?.period) return;

    // Use backend-provided dates for month navigation
    const targetDate =
      direction === 'next'
        ? monthlyData.period.nextDate
        : monthlyData.period.previousDate;

    if (!targetDate) return;

    setMonthlyDate(targetDate);
    setMonthlyPage(1);
    const data = await fetchPeriodData('month', targetDate);
    if (data) setMonthlyData(data);
  };

  const handleWeekSelect = async (date: string) => {
    setWeeklyDate(date);
    setWeeklyPage(1); // Reset pagination when changing period
    const data = await fetchPeriodData('week', date);
    if (data) setWeeklyData(data);
  };

  const handleMonthSelect = async (date: string) => {
    setMonthlyDate(date);
    setMonthlyPage(1); // Reset pagination when changing period
    const data = await fetchPeriodData('month', date);
    if (data) setMonthlyData(data);
  };

  const isCurrentUser = useCallback(
    (entryUserId: string): boolean => {
      return user?.id === entryUserId;
    },
    [user?.id]
  );

  const renderCompareAction = useCallback(
    (entry: LeaderboardEntry) =>
      !isCurrentUser(entry.userId) ? (
        <button
          className="dt-btn dt-btn-secondary"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setCompareUserId(entry.userId);
          }}
          title="Compare teams"
        >
          Compare
        </button>
      ) : null,
    [isCurrentUser]
  );

  const columns = useLeaderboardColumns({
    isCurrentUser,
    showEvents: true,
    renderAction: renderCompareAction,
  });

  if (loading) {
    return (
      <PageLayout activeNav="leaderboard">
        <div className="leaderboard-content">
          <div className="leaderboard-container">
            <LoadingSpinner text="Loading leaderboard..." />
          </div>
        </div>
      </PageLayout>
    );
  }

  const weeklyPeriod = weeklyData?.period;
  const monthlyPeriod = monthlyData?.period;

  return (
    <PageLayout activeNav="leaderboard">
      <div className="leaderboard-content">
        <div className="leaderboard-container">
          {/* Page Header */}
          <div className="users-page-header">
            <div className="page-header-row">
              <h1>👥 Fantasy Leaderboard</h1>
              <SeasonSelector value={selectedSeason} onChange={setSelectedSeason} />
            </div>
            <p className="users-page-subtitle">View the weekly/monthly and season standings</p>
          </div>

          {/* Error State */}
          {error && <div className="error-message">{error}</div>}

          {/* Empty season message */}
          {!loading &&
            !error &&
            !seasonData?.entries?.length &&
            !weeklyData?.entries?.length &&
            !monthlyData?.entries?.length && (
              <div className="empty-state">
                <div className="empty-icon">📊</div>
                <h3>No leaderboard data available</h3>
                <p>No leaderboard data available for the {selectedSeason} season.</p>
              </div>
            )}

          {/* Leader Cards */}
          <div className="leaders-section">
            <LeaderCard
              leader={leaders?.weeklyLeader || null}
              title="Weekly Leader"
              emoji="📅"
              isCurrentUser={isCurrentUser}
            />
            <LeaderCard
              leader={leaders?.monthlyLeader || null}
              title="Monthly Leader"
              emoji="📆"
              isCurrentUser={isCurrentUser}
            />
            <LeaderCard
              leader={leaders?.seasonLeader || null}
              title="Season Leader"
              emoji="🏆"
              isCurrentUser={isCurrentUser}
            />
          </div>

          {/* Weekly Table */}
          <LeaderboardSection
            title="Weekly Standings"
            entries={weeklyData?.entries || []}
            columns={columns}
            currentPage={weeklyPage}
            onPageChange={setWeeklyPage}
            isCurrentUser={isCurrentUser}
            metaText={`${weeklyData?.tournamentCount || 0} tournament${(weeklyData?.tournamentCount || 0) !== 1 ? 's' : ''} · ${weeklyData?.entries?.length || 0} participants`}
            emptyMessage="No tournaments this week yet."
            titleExtra={
              weeklyPeriod && new Date(weeklyPeriod.endDate) < new Date() ? (
                <button
                  className="totw-btn"
                  onClick={() => setShowTeamOfWeek(true)}
                  title="View the dream team for this gameweek"
                >
                  ⭐ Team of the Week
                </button>
              ) : undefined
            }
            periodNav={
              weeklyPeriod
                ? {
                    id: 'week-period-select',
                    options: weekOptions,
                    selectedDate: weeklyDate,
                    hasPrevious: weeklyPeriod.hasPrevious,
                    hasNext: weeklyPeriod.hasNext,
                    onNavigate: handleWeekNavigation,
                    onSelect: handleWeekSelect,
                  }
                : undefined
            }
          />

          {/* Monthly Table */}
          <LeaderboardSection
            title="Monthly Standings"
            entries={monthlyData?.entries || []}
            columns={columns}
            currentPage={monthlyPage}
            onPageChange={setMonthlyPage}
            isCurrentUser={isCurrentUser}
            metaText={`${monthlyData?.tournamentCount || 0} tournament${(monthlyData?.tournamentCount || 0) !== 1 ? 's' : ''} · ${monthlyData?.entries?.length || 0} participants`}
            emptyMessage="No tournaments this month yet."
            periodNav={
              monthlyPeriod
                ? {
                    id: 'month-period-select',
                    options: monthOptions,
                    selectedDate: monthlyDate,
                    hasPrevious: monthlyPeriod.hasPrevious,
                    hasNext: monthlyPeriod.hasNext,
                    onNavigate: handleMonthNavigation,
                    onSelect: handleMonthSelect,
                  }
                : undefined
            }
          />

          {/* Season Table */}
          <LeaderboardSection
            title="Season Standings"
            entries={seasonData?.entries || []}
            columns={columns}
            currentPage={seasonPage}
            onPageChange={setSeasonPage}
            isCurrentUser={isCurrentUser}
            metaText={`${seasonData?.tournamentCount || 0} tournament${(seasonData?.tournamentCount || 0) !== 1 ? 's' : ''} · ${seasonData?.entries?.length || 0} participants`}
            emptyMessage="No tournaments this season yet."
          />
        </div>
      </div>

      {/* Team Compare Modal */}
      {compareUserId && (
        <TeamCompareModal targetUserId={compareUserId} onClose={() => setCompareUserId(null)} />
      )}

      {/* Team of the Week Modal */}
      {showTeamOfWeek && weeklyDate && (
        <TeamOfTheWeekModal
          date={weeklyDate}
          season={selectedSeason}
          onClose={() => setShowTeamOfWeek(false)}
        />
      )}
    </PageLayout>
  );
};

export default LeaderboardPage;
