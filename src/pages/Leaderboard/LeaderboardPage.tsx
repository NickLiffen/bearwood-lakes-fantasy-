// Leaderboard Page - Three separate tables: Weekly, Monthly, Season with navigation

import React, { useEffect, useState, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import './LeaderboardPage.css';

interface User {
  id: string;
  firstName: string;
  lastName: string;
  username: string;
  role: string;
}

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
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  useEffect(() => {
    const storedUser = localStorage.getItem('user');
    if (!storedUser) {
      navigate('/login');
      return;
    }
    setUser(JSON.parse(storedUser));
  }, [navigate]);

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
      const token = localStorage.getItem('token');
      const response = await fetch('/.netlify/functions/leaderboard-periods?action=leaders', {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          setLeaders(data.data);
          
          // Set initial dates - use getMondayOfWeek to ensure we match option values
          if (data.data.currentWeek) {
            setWeeklyDate(getMondayOfWeek(data.data.currentWeek.startDate));
          }
          if (data.data.currentMonth) {
            const d = new Date(data.data.currentMonth.startDate);
            const year = d.getFullYear();
            const month = String(d.getMonth() + 1).padStart(2, '0');
            setMonthlyDate(`${year}-${month}-01`);
          }
          
          // Generate dropdown options
          if (data.data.seasonInfo) {
            setWeekOptions(generateWeekOptions(data.data.seasonInfo.startDate));
            setMonthOptions(generateMonthOptions(data.data.seasonInfo.startDate));
          }
        }
      }
    } catch (err) {
      console.error('Failed to fetch leaders:', err);
    }
  }, [generateWeekOptions, generateMonthOptions]);

  const fetchPeriodData = useCallback(async (period: 'week' | 'month' | 'season', date?: string) => {
    try {
      const token = localStorage.getItem('token');
      let url = `/.netlify/functions/leaderboard-periods?period=${period}`;
      if (date) {
        url += `&date=${date}`;
      }
      
      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          return data.data as LeaderboardResponse;
        }
      }
      return null;
    } catch (err) {
      console.error(`Failed to fetch ${period} data:`, err);
      return null;
    }
  }, []);

  // Initial data fetch
  useEffect(() => {
    if (!user) return;

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
  }, [user, fetchLeaders, fetchPeriodData]);

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

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    navigate('/login');
  };

  const formatPrice = (price: number) => `$${(price / 1000000).toFixed(1)}M`;

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

  if (!user) {
    return null;
  }

  if (loading) {
    return (
      <div className="leaderboard-page">
        <header className="dashboard-header">
          <div className="header-container">
            <Link to="/dashboard" className="header-brand">
              <img src="/bearwood_lakes_logo.png" alt="Bearwood Lakes" className="brand-logo" />
              <span className="brand-text">Bearwood Lakes Fantasy</span>
            </Link>
          </div>
        </header>
        <main className="leaderboard-main">
          <div className="leaderboard-container">
            <div className="loading-state">
              <div className="loading-spinner"></div>
              <p>Loading leaderboard...</p>
            </div>
          </div>
        </main>
      </div>
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
                  <th className="th-player">Player</th>
                  <th className="th-points">Points</th>
                  <th className="th-value">Team Value</th>
                  <th className="th-events">Events</th>
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
                      <td className="td-player">
                        <div className="player-info">
                          <div className="player-avatar">
                            {entry.firstName[0]}{entry.lastName[0]}
                          </div>
                          <div className="player-details">
                            <span className="player-name">
                              {entry.firstName} {entry.lastName}
                              {isCurrentUser(entry.userId) && <span className="you-badge-small">You</span>}
                            </span>
                            <span className="player-username">@{entry.username}</span>
                          </div>
                        </div>
                      </td>
                      <td className="td-points">
                        <span className="points-value">{entry.points}</span>
                      </td>
                      <td className="td-value">{formatPrice(entry.teamValue)}</td>
                      <td className="td-events">{entry.eventsPlayed}</td>
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
    <div className="leaderboard-page">
      {/* Header */}
      <header className="dashboard-header">
        <div className="header-container">
          <Link to="/dashboard" className="header-brand">
            <img src="/bearwood_lakes_logo.png" alt="Bearwood Lakes" className="brand-logo" />
            <span className="brand-text">Bearwood Lakes Fantasy</span>
          </Link>

          <nav className="header-nav">
            <Link to="/dashboard" className="nav-link">Dashboard</Link>
            <Link to="/my-team" className="nav-link">My Team</Link>
            <Link to="/players" className="nav-link">Players</Link>
            <Link to="/leaderboard" className="nav-link active">Leaderboard</Link>
            <Link to="/profile" className="nav-link">Profile</Link>
            {user.role === 'admin' && (
              <Link to="/admin" className="nav-link nav-admin">Admin</Link>
            )}
          </nav>

          <div className="header-user">
            <span className="user-greeting">
              Hi, <strong>{user.firstName}</strong>
            </span>
            <button onClick={handleLogout} className="btn-logout">Logout</button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="leaderboard-main">
        <div className="leaderboard-container">
          {/* Page Header */}
          <div className="page-header">
            <h1>🏆 Leaderboard</h1>
            <p className="page-subtitle">See how you rank against other players</p>
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
      </main>

      {/* Footer */}
      <footer className="leaderboard-footer">
        <div className="footer-container">
          <p>&copy; 2026 Bearwood Lakes Fantasy Golf League</p>
        </div>
      </footer>
    </div>
  );
};

export default LeaderboardPage;
