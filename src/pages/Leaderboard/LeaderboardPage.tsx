// Leaderboard Page - Three separate tables: Weekly, Monthly, Season with navigation

import React, { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import PageLayout from '../../components/layout/PageLayout';
import TeamCompareModal from '../../components/ui/TeamCompareModal';
import { useAuth } from '../../hooks/useAuth';
import { useApiClient } from '../../hooks/useApiClient';
import { formatPrice } from '../../utils/formatters';
import './LeaderboardPage.css';

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

interface WeekOption {
  date: string;
  label: string;
}

interface MonthOption {
  date: string;
  label: string;
}

// Helper to get Monday of the week for any date
const getMondayOfWeek = (dateStr: string): string => {
  const d = new Date(dateStr);
  const dayOfWeek = d.getDay();
  const daysSinceMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  d.setDate(d.getDate() - daysSinceMonday);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const LeaderboardPage: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [compareUserId, setCompareUserId] = useState<string | null>(null);

  // Get user from useAuth hook for current user check
  const { user } = useAuth();
  const userId = user?.id; // Use primitive value for dependency
  const { get, isAuthReady } = useApiClient();

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
  const [weekOptions, setWeekOptions] = useState<WeekOption[]>([]);
  const [monthOptions, setMonthOptions] = useState<MonthOption[]>([]);

  // Generate week options from season start to now
  const generateWeekOptions = useCallback((seasonStart: string) => {
    const options: WeekOption[] = [];
    const start = new Date(seasonStart);
    const now = new Date();
    
    // Start from the Monday of the first week
    const dayOfWeek = start.getDay();
    const firstMonday = new Date(start);
    const daysSinceMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    firstMonday.setDate(start.getDate() - daysSinceMonday);
    firstMonday.setHours(0, 0, 0, 0);
    
    // eslint-disable-next-line prefer-const
    let current = new Date(firstMonday);
    while (current <= now) {
      const weekEnd = new Date(current);
      weekEnd.setDate(current.getDate() + 6);
      
      const formatOpts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
      const label = `${current.toLocaleDateString('en-GB', formatOpts)} - ${weekEnd.toLocaleDateString('en-GB', formatOpts)}`;
      
      // Use consistent date format (YYYY-MM-DD in local time)
      const year = current.getFullYear();
      const month = String(current.getMonth() + 1).padStart(2, '0');
      const day = String(current.getDate()).padStart(2, '0');
      
      options.push({
        date: `${year}-${month}-${day}`,
        label,
      });
      
      current.setDate(current.getDate() + 7);
    }
    
    return options.reverse(); // Most recent first
  }, []);

  // Generate month options from season start to now
  const generateMonthOptions = useCallback((seasonStart: string) => {
    const options: MonthOption[] = [];
    const start = new Date(seasonStart);
    const now = new Date();
    
    // eslint-disable-next-line prefer-const
    let current = new Date(start.getFullYear(), start.getMonth(), 1);
    while (current <= now) {
      const label = current.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
      
      // Use consistent date format (YYYY-MM-DD in local time)
      const year = current.getFullYear();
      const month = String(current.getMonth() + 1).padStart(2, '0');
      
      options.push({
        date: `${year}-${month}-01`,
        label,
      });
      
      current.setMonth(current.getMonth() + 1);
    }
    
    return options.reverse(); // Most recent first
  }, []);

  const fetchLeaders = useCallback(async () => {
    try {
      const response = await get<LeadersResponse>('leaderboard-periods?action=leaders');

      // Ignore cancelled requests
      if (response.cancelled) return;

      if (response.success && response.data) {
        setLeaders(response.data);
        
        // Set initial dates - use getMondayOfWeek to ensure we match option values
        if (response.data.currentWeek) {
          setWeeklyDate(getMondayOfWeek(response.data.currentWeek.startDate));
        }
        if (response.data.currentMonth) {
          const d = new Date(response.data.currentMonth.startDate);
          const year = d.getFullYear();
          const month = String(d.getMonth() + 1).padStart(2, '0');
          setMonthlyDate(`${year}-${month}-01`);
        }
        
        // Generate dropdown options
        if (response.data.seasonInfo) {
          setWeekOptions(generateWeekOptions(response.data.seasonInfo.startDate));
          setMonthOptions(generateMonthOptions(response.data.seasonInfo.startDate));
        }
      }
    } catch (err) {
      console.error('Failed to fetch leaders:', err);
    }
  }, [get, generateWeekOptions, generateMonthOptions]);

  const fetchPeriodData = useCallback(async (period: 'week' | 'month' | 'season', date?: string) => {
    try {
      let url = `leaderboard-periods?period=${period}`;
      if (date) {
        url += `&date=${date}`;
      }
      
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
  }, [get]);

  // Initial data fetch
  useEffect(() => {
    if (!isAuthReady || !userId) return;

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
  }, [userId, fetchLeaders, fetchPeriodData]);

  // Navigation handlers
  const handleWeekNavigation = async (direction: 'prev' | 'next') => {
    if (!weeklyData?.period) return;
    
    const currentDate = new Date(weeklyData.period.startDate);
    const offset = direction === 'prev' ? -7 : 7;
    currentDate.setDate(currentDate.getDate() + offset);
    
    // Use consistent date format
    const newDate = getMondayOfWeek(currentDate.toISOString());
    
    setWeeklyDate(newDate);
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
    const data = await fetchPeriodData('month', newDate);
    if (data) setMonthlyData(data);
  };

  const handleWeekSelect = async (date: string) => {
    setWeeklyDate(date);
    const data = await fetchPeriodData('week', date);
    if (data) setWeeklyData(data);
  };

  const handleMonthSelect = async (date: string) => {
    setMonthlyDate(date);
    const data = await fetchPeriodData('month', date);
    if (data) setMonthlyData(data);
  };

  const getRankDisplay = (rank: number): { emoji: string; className: string } => {
    switch (rank) {
      case 1: return { emoji: '🥇', className: 'rank-gold' };
      case 2: return { emoji: '🥈', className: 'rank-silver' };
      case 3: return { emoji: '🥉', className: 'rank-bronze' };
      default: return { emoji: '', className: '' };
    }
  };

  const getMovementDisplay = (entry: LeaderboardEntry): React.ReactNode => {
    if (entry.movement === 'new') {
      return <span className="movement-new">NEW</span>;
    }
    if (entry.movement === 'up') {
      return <span className="movement-up">↑{entry.movementAmount}</span>;
    }
    if (entry.movement === 'down') {
      return <span className="movement-down">↓{entry.movementAmount}</span>;
    }
    return <span className="movement-same">-</span>;
  };

  const isCurrentUser = (userId: string): boolean => {
    return user?.id === userId;
  };

  if (loading) {
    return (
      <PageLayout activeNav="leaderboard">
        <div className="leaderboard-content">
          <div className="leaderboard-container">
            <div className="loading-state">
              <div className="loading-spinner"></div>
              <p>Loading leaderboard...</p>
            </div>
          </div>
        </div>
      </PageLayout>
    );
  }

  // Render a leaderboard table
  const renderTable = (
    data: LeaderboardResponse | null,
    title: string,
    type: 'week' | 'month' | 'season',
    showNavigation: boolean = false
  ) => {
    const entries = data?.entries || [];
    const period = data?.period;
    const tournamentCount = data?.tournamentCount || 0;

    const canGoPrev = period?.hasPrevious ?? false;
    const canGoNext = period?.hasNext ?? false;

    return (
      <div className="leaderboard-section">
        <div className="section-header">
          <div className="section-title-row">
            <h2>{title}</h2>
            {showNavigation && period && (
              <div className="period-navigation">
                <button 
                  className="nav-btn"
                  onClick={() => type === 'week' ? handleWeekNavigation('prev') : handleMonthNavigation('prev')}
                  disabled={!canGoPrev}
                  aria-label="Previous"
                >
                  ←
                </button>
                <select 
                  className="period-select"
                  value={type === 'week' ? weeklyDate : monthlyDate}
                  onChange={(e) => type === 'week' ? handleWeekSelect(e.target.value) : handleMonthSelect(e.target.value)}
                >
                  {(type === 'week' ? weekOptions : monthOptions).map(opt => (
                    <option key={opt.date} value={opt.date}>{opt.label}</option>
                  ))}
                </select>
                <button 
                  className="nav-btn"
                  onClick={() => type === 'week' ? handleWeekNavigation('next') : handleMonthNavigation('next')}
                  disabled={!canGoNext}
                  aria-label="Next"
                >
                  →
                </button>
              </div>
            )}
          </div>
          <div className="section-subtitle">
            <span className="period-label">{period?.label || ''}</span>
            <span className="meta-separator">•</span>
            <span className="tournament-count">{tournamentCount} tournament{tournamentCount !== 1 ? 's' : ''}</span>
            <span className="meta-separator">•</span>
            <span className="participant-count">{entries.length} participants</span>
          </div>
        </div>

        {entries.length === 0 ? (
          <div className="empty-table-state">
            <p>No tournaments this {type === 'week' ? 'week' : type === 'month' ? 'month' : 'season'} yet.</p>
          </div>
        ) : (
          <div className="table-container">
            <table className="leaderboard-table">
              <thead>
                <tr>
                  <th className="th-rank">Rank</th>
                  <th className="th-movement">Move</th>
                  <th className="th-golfer">golfer</th>
                  <th className="th-points">Points</th>
                  <th className="th-value">Team Value</th>
                  <th className="th-events">Events</th>
                  <th className="th-action">Action</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => {
                  const { emoji, className } = getRankDisplay(entry.rank);
                  return (
                    <tr 
                      key={entry.userId} 
                      className={`${isCurrentUser(entry.userId) ? 'current-user-row' : ''} ${className}`}
                    >
                      <td className="td-rank">
                        {emoji && <span className="rank-emoji-small">{emoji}</span>}
                        <span className={`rank-text ${className}`}>{entry.rank}</span>
                      </td>
                      <td className="td-movement">
                        {getMovementDisplay(entry)}
                      </td>
                      <td className="td-golfer">
                        <Link to={`/users/${entry.userId}`} className="golfer-link">
                          <div className="golfer-info">
                            <div className="golfer-avatar">
                              {entry.firstName[0]}{entry.lastName[0]}
                            </div>
                            <div className="golfer-details">
                              <span className="golfer-name">
                                {entry.firstName} {entry.lastName}
                                {isCurrentUser(entry.userId) && <span className="you-badge-small">You</span>}
                              </span>
                              <span className="golfer-username">@{entry.username}</span>
                            </div>
                          </div>
                        </Link>
                      </td>
                      <td className="td-points">
                        <span className="points-value">{entry.points}</span>
                      </td>
                      <td className="td-value">{formatPrice(entry.teamValue)}</td>
                      <td className="td-events">{entry.eventsPlayed}</td>
                      <td className="td-action">
                        {!isCurrentUser(entry.userId) && (
                          <button 
                            className="btn-compare-small"
                            onClick={() => setCompareUserId(entry.userId)}
                            title="Compare teams"
                          >
                            ⚖️
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    );
  };

  // Render leader card
  const renderLeaderCard = (
    leader: LeaderboardEntry | null,
    title: string,
    emoji: string
  ) => {
    if (!leader) {
      return (
        <div className="leader-card empty">
          <div className="leader-title">{emoji} {title}</div>
          <div className="leader-empty">No leader yet</div>
        </div>
      );
    }

    return (
      <div className={`leader-card ${isCurrentUser(leader.userId) ? 'is-you' : ''}`}>
        <div className="leader-title">{emoji} {title}</div>
        <div className="leader-avatar">
          {leader.firstName[0]}{leader.lastName[0]}
        </div>
        <div className="leader-name">
          {leader.firstName} {leader.lastName}
          {isCurrentUser(leader.userId) && <span className="you-badge">You</span>}
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
            <h1>👥 Fantasy Leaderboard</h1>
            <p className="users-page-subtitle">View the weekly/monthly and season standings</p>
          </div>

          {/* Error State */}
          {error && (
            <div className="error-message">{error}</div>
          )}

          {/* Leader Cards */}
          <div className="leaders-section">
            {renderLeaderCard(leaders?.weeklyLeader || null, 'Weekly Leader', '📅')}
            {renderLeaderCard(leaders?.monthlyLeader || null, 'Monthly Leader', '📆')}
            {renderLeaderCard(leaders?.seasonLeader || null, 'Season Leader', '🏆')}
          </div>

          {/* Weekly Table */}
          {renderTable(weeklyData, 'Weekly Standings', 'week', true)}

          {/* Monthly Table */}
          {renderTable(monthlyData, 'Monthly Standings', 'month', true)}

          {/* Season Table */}
          {renderTable(seasonData, 'Season Standings', 'season', false)}
        </div>
      </div>

      {/* Team Compare Modal */}
      {compareUserId && (
        <TeamCompareModal
          targetUserId={compareUserId}
          onClose={() => setCompareUserId(null)}
        />
      )}
    </PageLayout>
  );
};

export default LeaderboardPage;
