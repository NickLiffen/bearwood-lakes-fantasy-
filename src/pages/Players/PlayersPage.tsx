// All Players Page - View all players with stats

import React, { useEffect, useState, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import './PlayersPage.css';

interface User {
  id: string;
  firstName: string;
  lastName: string;
  username: string;
  role: string;
}

interface PlayerStats {
  timesScored36Plus: number;
  timesFinished1st: number;
  timesFinished2nd: number;
  timesFinished3rd: number;
  timesPlayed: number;
}

interface PlayerPoints {
  week: number;
  month: number;
  season: number;
}

interface Player {
  id: string;
  firstName: string;
  lastName: string;
  picture: string;
  price: number;
  membershipType: 'men' | 'junior' | 'female' | 'senior';
  isActive: boolean;
  stats2025: PlayerStats;
  stats2026: PlayerStats;
  points: PlayerPoints;
}

// Sort column and direction
type SortColumn = 
  | 'name' 
  | 'price' 
  | 'played-2026' | 'first-2026' | 'second-2026' | 'third-2026' | 'consistent-2026'
  | 'week-pts' | 'month-pts' | 'season-pts';

type SortDirection = 'asc' | 'desc';

// Quick filter presets
type QuickFilter = 
  | 'all' 
  | 'active'
  | 'inactive'
  | 'winners-2026'
  | 'podium-finishers-2026'
  | 'experienced-2026'
  | 'premium'
  | 'budget';

const PlayersPage: React.FC = () => {
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortColumn, setSortColumn] = useState<SortColumn>('name');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [quickFilter, setQuickFilter] = useState<QuickFilter>('all');

  useEffect(() => {
    const storedUser = localStorage.getItem('user');
    if (!storedUser) {
      navigate('/login');
      return;
    }
    setUser(JSON.parse(storedUser));
  }, [navigate]);

  useEffect(() => {
    if (user) {
      fetchPlayers();
    }
  }, [user]);

  const fetchPlayers = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');

      const response = await fetch('/.netlify/functions/players-list', {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          setPlayers(data.data);
        }
      } else {
        throw new Error('Failed to fetch players');
      }
    } catch {
      setError('Failed to load players. Please refresh the page.');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    navigate('/login');
  };

  // Helper functions
  const formatPrice = (price: number) => `$${(price / 1000000).toFixed(1)}M`;

  const getPodiums = (stats: PlayerStats) => {
    if (!stats) return 0;
    return stats.timesFinished1st + stats.timesFinished2nd + stats.timesFinished3rd;
  };

  const getMembershipLabel = (type: string) => {
    switch (type) {
      case 'men': return 'Men';
      case 'junior': return 'Junior';
      case 'female': return 'Female';
      case 'senior': return 'Senior';
      default: return type;
    }
  };

  const getMembershipClass = (type: string) => {
    switch (type) {
      case 'men': return 'membership-men';
      case 'junior': return 'membership-junior';
      case 'female': return 'membership-female';
      case 'senior': return 'membership-senior';
      default: return '';
    }
  };

  // Quick filter logic
  const applyQuickFilter = (player: Player): boolean => {
    switch (quickFilter) {
      case 'active':
        return player.isActive;
      case 'inactive':
        return !player.isActive;
      case 'winners-2026':
        return player.stats2026?.timesFinished1st > 0;
      case 'podium-finishers-2026':
        return getPodiums(player.stats2026) > 0;
      case 'experienced-2026':
        return player.stats2026?.timesPlayed >= 5;
      case 'premium':
        return player.price >= 10000000;
      case 'budget':
        return player.price <= 6000000;
      default:
        return true;
    }
  };

  // Handle column header click for sorting
  const handleSort = (column: SortColumn) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection(column === 'name' ? 'asc' : 'desc'); // Default desc for stats, asc for name
    }
  };

  // Get sort arrow for column
  const getSortArrow = (column: SortColumn) => {
    if (sortColumn !== column) return <span className="sort-arrows">↕</span>;
    return <span className="sort-arrow active">{sortDirection === 'asc' ? '↑' : '↓'}</span>;
  };

  // Filter and sort players
  const filteredPlayers = useMemo(() => {
    return players
      .filter((player) => {
        const fullName = `${player.firstName} ${player.lastName}`.toLowerCase();
        const matchesSearch = fullName.includes(searchTerm.toLowerCase());
        const matchesQuickFilter = applyQuickFilter(player);
        return matchesSearch && matchesQuickFilter;
      })
      .sort((a, b) => {
        const dir = sortDirection === 'asc' ? 1 : -1;
        
        const getValue = (player: Player): number | string => {
          switch (sortColumn) {
            case 'name': return `${player.firstName} ${player.lastName}`;
            case 'price': return player.price;
            case 'played-2026': return player.stats2026?.timesPlayed || 0;
            case 'first-2026': return player.stats2026?.timesFinished1st || 0;
            case 'second-2026': return player.stats2026?.timesFinished2nd || 0;
            case 'third-2026': return player.stats2026?.timesFinished3rd || 0;
            case 'consistent-2026': return player.stats2026?.timesScored36Plus || 0;
            case 'week-pts': return player.points?.week || 0;
            case 'month-pts': return player.points?.month || 0;
            case 'season-pts': return player.points?.season || 0;
            default: return 0;
          }
        };

        const aVal = getValue(a);
        const bVal = getValue(b);

        if (typeof aVal === 'string' && typeof bVal === 'string') {
          return aVal.localeCompare(bVal) * dir;
        }
        return ((aVal as number) - (bVal as number)) * dir;
      });
  }, [players, searchTerm, quickFilter, sortColumn, sortDirection]);

  // Reset filters
  const resetFilters = () => {
    setSearchTerm('');
    setQuickFilter('all');
    setSortColumn('name');
    setSortDirection('asc');
  };

  const hasActiveFilters = searchTerm !== '' || quickFilter !== 'all';

  if (!user) {
    return null;
  }

  if (loading) {
    return (
      <div className="players-page">
        <header className="dashboard-header">
          <div className="header-container">
            <Link to="/dashboard" className="header-brand">
              <img src="/bearwood_lakes_logo.png" alt="Bearwood Lakes" className="brand-logo" />
              <span className="brand-text">Bearwood Lakes Fantasy</span>
            </Link>
          </div>
        </header>
        <main className="players-main">
          <div className="players-container">
            <div className="loading-state">
              <div className="loading-spinner"></div>
              <p>Loading players...</p>
            </div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="players-page">
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
            <Link to="/players" className="nav-link active">Players</Link>
            <Link to="/leaderboard" className="nav-link">Leaderboard</Link>
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
      <main className="players-main">
        <div className="players-container">
          {/* Page Title */}
          <div className="page-header">
            <h1>All Players</h1>
            <p className="page-subtitle">View all players and their performance statistics</p>
          </div>

          {/* Search Bar - Full Width */}
          <div className="search-container">
            <span className="search-icon">🔍</span>
            <input
              type="text"
              placeholder="Search players by name..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="search-input"
            />
            {searchTerm && (
              <button className="search-clear" onClick={() => setSearchTerm('')}>
                ×
              </button>
            )}
          </div>

          {/* Filters Row */}
          <div className="filters-row">
            <select
              value={quickFilter}
              onChange={(e) => setQuickFilter(e.target.value as QuickFilter)}
              className="filter-select"
            >
              <option value="all">All Players</option>
              <option value="active">Active Only</option>
              <option value="inactive">Inactive Only</option>
              <option value="winners-2026">🏆 Winners</option>
              <option value="podium-finishers-2026">🥇 Podium Finishers</option>
              <option value="experienced-2026">⭐ Experienced (5+ rounds)</option>
              <option value="premium">💎 Premium ($10M+)</option>
              <option value="budget">💰 Budget (≤$6M)</option>
            </select>
            {hasActiveFilters && (
              <button className="reset-btn" onClick={resetFilters}>Reset</button>
            )}
            <span className="results-count">Showing {filteredPlayers.length} of {players.length}</span>
          </div>

          {/* Error State */}
          {error && (
            <div className="error-message">{error}</div>
          )}

          {/* Players Table */}
          <div className="table-container">
            <table className="players-table">
              <thead>
                <tr>
                  <th className="th-player th-sortable" onClick={() => handleSort('name')}>
                    Player {getSortArrow('name')}
                  </th>
                  <th className="th-membership">Type</th>
                  <th className="th-price th-sortable" onClick={() => handleSort('price')}>
                    Price {getSortArrow('price')}
                  </th>
                  <th className="th-status">Status</th>
                  <th className="th-stat th-sortable" onClick={() => handleSort('week-pts')}>Week {getSortArrow('week-pts')}</th>
                  <th className="th-stat th-sortable" onClick={() => handleSort('month-pts')}>Month {getSortArrow('month-pts')}</th>
                  <th className="th-stat th-sortable" onClick={() => handleSort('season-pts')}>Season {getSortArrow('season-pts')}</th>
                  <th className="th-stat th-sortable" onClick={() => handleSort('played-2026')}>Played {getSortArrow('played-2026')}</th>
                  <th className="th-stat th-sortable" onClick={() => handleSort('first-2026')}>1st {getSortArrow('first-2026')}</th>
                  <th className="th-stat th-sortable" onClick={() => handleSort('second-2026')}>2nd {getSortArrow('second-2026')}</th>
                  <th className="th-stat th-sortable" onClick={() => handleSort('third-2026')}>3rd {getSortArrow('third-2026')}</th>
                  <th className="th-stat th-sortable" onClick={() => handleSort('consistent-2026')}>36+ {getSortArrow('consistent-2026')}</th>
                </tr>
              </thead>
              <tbody>
                {filteredPlayers.length === 0 ? (
                  <tr>
                    <td colSpan={12} className="no-results">
                      No players found matching your filters.
                    </td>
                  </tr>
                ) : (
                  filteredPlayers.map((player) => (
                    <tr key={player.id} className={!player.isActive ? 'inactive-player' : ''}>
                      <td className="td-player">
                        <div className="player-info">
                          <Link to={`/players/${player.id}`} className="player-name-link">
                            {player.firstName} {player.lastName}
                          </Link>
                        </div>
                      </td>
                      <td className="td-membership">
                        <span className={`membership-badge ${getMembershipClass(player.membershipType)}`}>
                          {getMembershipLabel(player.membershipType)}
                        </span>
                      </td>
                      <td className="td-price">{formatPrice(player.price)}</td>
                      <td className="td-status">
                        <span className={`status-badge ${player.isActive ? 'status-active' : 'status-inactive'}`}>
                          {player.isActive ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      {/* Points */}
                      <td className="td-stat">
                        {player.points?.week > 0 ? (
                          <span className="stat-points">{player.points.week}</span>
                        ) : '0'}
                      </td>
                      <td className="td-stat">
                        {player.points?.month > 0 ? (
                          <span className="stat-points">{player.points.month}</span>
                        ) : '0'}
                      </td>
                      <td className="td-stat">
                        {player.points?.season > 0 ? (
                          <span className="stat-points">{player.points.season}</span>
                        ) : '0'}
                      </td>
                      {/* 2026 Stats */}
                      <td className="td-stat">{player.stats2026?.timesPlayed || 0}</td>
                      <td className="td-stat td-highlight">
                        {player.stats2026?.timesFinished1st > 0 && <span className="stat-gold">{player.stats2026.timesFinished1st}</span>}
                        {!player.stats2026?.timesFinished1st && '0'}
                      </td>
                      <td className="td-stat">
                        {player.stats2026?.timesFinished2nd > 0 && <span className="stat-silver">{player.stats2026.timesFinished2nd}</span>}
                        {!player.stats2026?.timesFinished2nd && '0'}
                      </td>
                      <td className="td-stat">
                        {player.stats2026?.timesFinished3rd > 0 && <span className="stat-bronze">{player.stats2026.timesFinished3rd}</span>}
                        {!player.stats2026?.timesFinished3rd && '0'}
                      </td>
                      <td className="td-stat">{player.stats2026?.timesScored36Plus || 0}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Legend */}
          <div className="table-legend">
            <span className="legend-item"><span className="stat-gold">●</span> 1st Place</span>
            <span className="legend-item"><span className="stat-silver">●</span> 2nd Place</span>
            <span className="legend-item"><span className="stat-bronze">●</span> 3rd Place</span>
            <span className="legend-item">36+ = Scored 36 points or more</span>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="players-footer">
        <div className="footer-container">
          <p>&copy; 2026 Bearwood Lakes Fantasy Golf League</p>
        </div>
      </footer>
    </div>
  );
};

export default PlayersPage;
