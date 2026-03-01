// Leaderboard Page - Three separate tables: Weekly, Monthly, Season with navigation

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import PageLayout from '../../components/layout/PageLayout';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import SeasonSelector from '../../components/ui/SeasonSelector';
import TeamCompareModal from '../../components/ui/TeamCompareModal';
import DataTable, { Column } from '../../components/ui/DataTable';
import PeriodNav from '../../components/ui/PeriodNav';
import { useAuth } from '../../hooks/useAuth';
import { useApiClient } from '../../hooks/useApiClient';
import { useActiveSeason } from '../../hooks/useActiveSeason';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { formatPrice } from '../../utils/formatters';
import {
  getSaturdayOfWeek,
  formatDateString,
  generateWeekOptions,
  generateMonthOptions,
} from '../../utils/gameweek';
import type { PeriodOption } from '../../utils/gameweek';
import './LeaderboardPage.css';

const ITEMS_PER_PAGE = 10;

interface LeaderboardEntry {
  rank: number;
  oldRank: number | null;
  movement: 'up' | 'down' | 'same' | 'new';
  movementAmount: number;
  userId: string;
  firstName: string;
  lastName: string;
  username: string;
  points: number;
  teamValue: number;
  eventsPlayed: number;
}

interface PeriodInfo {
  type: 'week' | 'month' | 'season';
  startDate: string;
  endDate: string;
  label: string;
  hasPrevious: boolean;
  hasNext: boolean;
}

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
  const [selectedSeason, setSelectedSeason] = useState<string>('');

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

  const fetchLeaders = useCallback(async () => {
    if (!selectedSeason) return;
    try {
      const response = await get<LeadersResponse>(
        `leaderboard-periods?action=leaders&season=${selectedSeason}`
      );

      // Ignore cancelled requests
      if (response.cancelled) return;

      if (response.success && response.data) {
        setLeaders(response.data);

        // Set initial dates - use getSaturdayOfWeek to ensure we match option values
        if (response.data.currentWeek) {
          setWeeklyDate(
            formatDateString(getSaturdayOfWeek(new Date(response.data.currentWeek.startDate)))
          );
        }
        if (response.data.currentMonth) {
          const d = new Date(response.data.currentMonth.startDate);
          const year = d.getFullYear();
          const month = String(d.getMonth() + 1).padStart(2, '0');
          setMonthlyDate(`${year}-${month}-01`);
        }

        // Generate dropdown options from shared utilities
        if (response.data.seasonInfo) {
          setWeekOptions(
            generateWeekOptions(
              response.data.seasonInfo.startDate,
              response.data.seasonInfo.startDate
            )
          );
          setMonthOptions(generateMonthOptions(response.data.seasonInfo.startDate));
        }
      }
    } catch (err) {
      console.error('Failed to fetch leaders:', err);
    }
  }, [get, selectedSeason]);

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

    // Reset selections when season changes
    setWeeklyDate('');
    setMonthlyDate('');
    setWeekOptions([]);
    setMonthOptions([]);
    setWeeklyPage(1);
    setMonthlyPage(1);
    setSeasonPage(1);

    const loadInitialData = async () => {
      setLoading(true);
      try {
        await fetchLeaders();

        // Fetch all three tables in parallel
        const [weekly, monthly, season] = await Promise.all([
          fetchPeriodData('week'),
          fetchPeriodData('month'),
          fetchPeriodData('season'),
        ]);

        setWeeklyData(weekly);
        setMonthlyData(monthly);
        setSeasonData(season);
      } catch {
        setError('Failed to load leaderboard. Please refresh the page.');
      } finally {
        setLoading(false);
      }
    };

    loadInitialData();
  }, [isAuthReady, userId, selectedSeason, fetchLeaders, fetchPeriodData]);

  // Navigation handlers
  const handleWeekNavigation = async (direction: 'prev' | 'next') => {
    if (!weeklyData?.period) return;

    const currentDate = new Date(weeklyData.period.startDate);
    const offset = direction === 'prev' ? -7 : 7;
    currentDate.setDate(currentDate.getDate() + offset);

    const newDate = formatDateString(getSaturdayOfWeek(currentDate));

    setWeeklyDate(newDate);
    setWeeklyPage(1);
    const data = await fetchPeriodData('week', newDate);
    if (data) setWeeklyData(data);
  };

  const handleMonthNavigation = async (direction: 'prev' | 'next') => {
    if (!monthlyData?.period) return;

    const currentDate = new Date(monthlyData.period.startDate);
    currentDate.setMonth(currentDate.getMonth() + (direction === 'prev' ? -1 : 1));

    // Use consistent date format
    const year = currentDate.getFullYear();
    const month = String(currentDate.getMonth() + 1).padStart(2, '0');
    const newDate = `${year}-${month}-01`;

    setMonthlyDate(newDate);
    setMonthlyPage(1); // Reset pagination when changing period
    const data = await fetchPeriodData('month', newDate);
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

  // Define columns for the DataTable
  const columns: Column<LeaderboardEntry>[] = useMemo(
    () => [
      {
        key: 'rank',
        header: 'Rank',
        width: '80px',
        align: 'center',
        render: (entry) => {
          const rankDisplay =
            entry.rank <= 3 ? (
              <span className={`dt-rank dt-rank-${entry.rank}`}>
                {entry.rank === 1 && '🥇 '}
                {entry.rank === 2 && '🥈 '}
                {entry.rank === 3 && '🥉 '}
                {entry.rank}
              </span>
            ) : (
              <span className="dt-rank">{entry.rank}</span>
            );
          return rankDisplay;
        },
      },
      {
        key: 'movement',
        header: 'Move',
        width: '70px',
        align: 'center',
        render: (entry) => {
          if (entry.movement === 'new') {
            return <span className="dt-badge dt-badge-warning">NEW</span>;
          }
          if (entry.movement === 'up') {
            return <span className="movement-up">↑{entry.movementAmount}</span>;
          }
          if (entry.movement === 'down') {
            return <span className="movement-down">↓{entry.movementAmount}</span>;
          }
          return <span className="dt-text-muted">-</span>;
        },
      },
      {
        key: 'user',
        header: 'User',
        render: (entry) => (
          <Link to={`/users/${entry.userId}`} className="dt-text-link">
            <div className="dt-info-cell">
              <div className="dt-avatar">
                {entry.firstName[0]}
                {entry.lastName[0]}
              </div>
              <div className="dt-info-details">
                <span className="dt-info-name">
                  {entry.firstName} {entry.lastName}
                  {isCurrentUser(entry.userId) && <span className="dt-you-badge">You</span>}
                </span>
                <span className="dt-info-subtitle">@{entry.username}</span>
              </div>
            </div>
          </Link>
        ),
      },
      {
        key: 'points',
        header: 'Points',
        width: '100px',
        align: 'center',
        render: (entry) => <span className="dt-text-price">{entry.points}</span>,
      },
      {
        key: 'teamValue',
        header: 'Team Value',
        width: '120px',
        align: 'center',
        headerClassName: 'hide-on-mobile',
        cellClassName: 'hide-on-mobile',
        render: (entry) => formatPrice(entry.teamValue),
      },
      {
        key: 'events',
        header: 'Events',
        width: '80px',
        align: 'center',
        headerClassName: 'hide-on-small',
        cellClassName: 'hide-on-small',
        render: (entry) => entry.eventsPlayed,
      },
      {
        key: 'action',
        header: 'Action',
        width: '90px',
        align: 'center',
        render: (entry) =>
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
      },
    ],
    [isCurrentUser]
  );

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

  // Render a leaderboard table using DataTable
  const renderTable = (
    data: LeaderboardResponse | null,
    title: string,
    type: 'week' | 'month' | 'season',
    showNavigation: boolean = false,
    currentPage: number,
    setCurrentPage: (page: number) => void
  ) => {
    const entries = data?.entries || [];
    const period = data?.period;
    const tournamentCount = data?.tournamentCount || 0;

    const canGoPrev = period?.hasPrevious ?? false;
    const canGoNext = period?.hasNext ?? false;

    // Pagination calculations
    const totalEntries = entries.length;
    const totalPages = Math.ceil(totalEntries / ITEMS_PER_PAGE);
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    const paginatedEntries = entries.slice(startIndex, startIndex + ITEMS_PER_PAGE);

    return (
      <div className="leaderboard-section">
        <div className="section-header">
          <div className="section-title-row">
            <h2>{title}</h2>
            <span className="section-meta">
              {tournamentCount} tournament{tournamentCount !== 1 ? 's' : ''} · {entries.length}{' '}
              participants
            </span>
          </div>
          {showNavigation && period && (
            <PeriodNav
              id={`${type}-period-select`}
              options={type === 'week' ? weekOptions : monthOptions}
              selectedDate={type === 'week' ? weeklyDate : monthlyDate}
              hasPrevious={canGoPrev}
              hasNext={canGoNext}
              onNavigate={(dir) =>
                type === 'week' ? handleWeekNavigation(dir) : handleMonthNavigation(dir)
              }
              onSelect={(date) =>
                type === 'week' ? handleWeekSelect(date) : handleMonthSelect(date)
              }
            />
          )}
        </div>

        <DataTable
          data={paginatedEntries}
          columns={columns}
          rowKey={(entry) => entry.userId}
          rowClassName={(entry) => (isCurrentUser(entry.userId) ? 'dt-row-highlighted' : '')}
          emptyMessage={`No tournaments this ${type === 'week' ? 'week' : type === 'month' ? 'month' : 'season'} yet.`}
        />

        {/* Pagination Controls */}
        {totalPages > 1 && (
          <div className="pagination-controls">
            <button
              className="pagination-btn"
              onClick={() => setCurrentPage(currentPage - 1)}
              disabled={currentPage === 1}
            >
              ← Previous
            </button>
            <span className="page-info">
              Page {currentPage} of {totalPages}
            </span>
            <button
              className="pagination-btn"
              onClick={() => setCurrentPage(currentPage + 1)}
              disabled={currentPage === totalPages}
            >
              Next →
            </button>
          </div>
        )}
      </div>
    );
  };

  // Render leader card
  const renderLeaderCard = (leader: LeaderboardEntry | null, title: string, emoji: string) => {
    if (!leader) {
      return (
        <div className="leader-card empty">
          <div className="leader-title">
            {emoji} {title}
          </div>
          <div className="leader-empty">No leader yet</div>
        </div>
      );
    }

    return (
      <div className={`leader-card ${isCurrentUser(leader.userId) ? 'is-you' : ''}`}>
        <div className="leader-title">
          {emoji} {title}
        </div>
        <div className="leader-avatar">
          {leader.firstName[0]}
          {leader.lastName[0]}
        </div>
        <div className="leader-name">
          {leader.firstName} {leader.lastName}
          {isCurrentUser(leader.userId) && <span className="dt-you-badge">You</span>}
        </div>
        <div className="leader-points">{leader.points} pts</div>
      </div>
    );
  };

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
            {renderLeaderCard(leaders?.weeklyLeader || null, 'Weekly Leader', '📅')}
            {renderLeaderCard(leaders?.monthlyLeader || null, 'Monthly Leader', '📆')}
            {renderLeaderCard(leaders?.seasonLeader || null, 'Season Leader', '🏆')}
          </div>

          {/* Weekly Table */}
          {renderTable(weeklyData, 'Weekly Standings', 'week', true, weeklyPage, setWeeklyPage)}

          {/* Monthly Table */}
          {renderTable(
            monthlyData,
            'Monthly Standings',
            'month',
            true,
            monthlyPage,
            setMonthlyPage
          )}

          {/* Season Table */}
          {renderTable(seasonData, 'Season Standings', 'season', false, seasonPage, setSeasonPage)}
        </div>
      </div>

      {/* Team Compare Modal */}
      {compareUserId && (
        <TeamCompareModal targetUserId={compareUserId} onClose={() => setCompareUserId(null)} />
      )}
    </PageLayout>
  );
};

export default LeaderboardPage;
