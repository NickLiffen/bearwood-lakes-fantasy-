// All Users Page - View all fantasy participants

import React, { useEffect, useState, useMemo, useRef } from 'react';
import { Link } from 'react-router-dom';
import PageLayout from '../../components/layout/PageLayout';
import SearchBar from '../../components/ui/SearchBar';
import DataTable, { Column } from '../../components/ui/DataTable';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import { useAuth } from '../../hooks/useAuth';
import { useApiClient } from '../../hooks/useApiClient';
import './UsersPage.css';

interface FantasyUser {
  id: string;
  firstName: string;
  lastName: string;
  username: string;
  hasTeam: boolean;
  teamSize: number;
  totalSpent: number;
  weekPoints: number;
  monthPoints: number;
  seasonPoints: number;
  weekRank: number | null;
  monthRank: number | null;
  seasonRank: number | null;
  createdAt: string;
}

type SortColumn = 'name' | 'username' | 'weekPoints' | 'monthPoints' | 'seasonPoints' | 'createdAt';
type SortDirection = 'asc' | 'desc';
type QuickFilter = 'all' | 'hasTeam' | 'noTeam' | 'top10Week' | 'top10Month' | 'top10Season';

const UsersPage: React.FC = () => {
  const [users, setUsers] = useState<FantasyUser[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortColumn, setSortColumn] = useState<SortColumn>('seasonPoints');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [quickFilter, setQuickFilter] = useState<QuickFilter>('all');

  // Get current user ID for highlighting
  const { user } = useAuth();
  const currentUserId = user?.id ?? null;
  const { get, isAuthReady } = useApiClient();
  
  // Track if component is mounted to prevent state updates after unmount
  const isMounted = useRef(true);

  useEffect(() => {
    isMounted.current = true;
    
    if (isAuthReady) {
      fetchUsers();
    }
    
    // Cleanup: mark as unmounted
    return () => {
      isMounted.current = false;
    };
  }, [isAuthReady]);

  const fetchUsers = async () => {
    try {
      setLoading(true);
      setError(null); // Clear any previous errors

      const response = await get<FantasyUser[]>('users-fantasy');

      // Don't update state if component unmounted or request was cancelled
      if (!isMounted.current || response.cancelled) {
        return;
      }

      if (response.success && response.data) {
        setUsers(response.data);
      } else {
        // Only show error if we don't have data yet
        if (users === null || users.length === 0) {
          setError(response.error || 'Failed to load users');
        }
      }
    } catch (err) {
      if (isMounted.current) {
        console.error('UsersPage fetchUsers error:', err);
        setError('Failed to load users. Please refresh the page.');
      }
    } finally {
      if (isMounted.current) {
        setLoading(false);
      }
    }
  };

  // Helper functions
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  };

  // Handle column header click for sorting
  const handleSort = (column: SortColumn) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection(column === 'name' || column === 'username' ? 'asc' : 'desc');
    }
  };

  // Filter and sort users
  const filteredUsers = useMemo(() => {
    // Guard against null data during initial load
    if (users === null) return [];

    // Apply quick filter
    const applyQuickFilter = (user: FantasyUser): boolean => {
      switch (quickFilter) {
        case 'hasTeam':
          return user.hasTeam;
        case 'noTeam':
          return !user.hasTeam;
        case 'top10Week':
          return user.weekRank !== null && user.weekRank <= 10;
        case 'top10Month':
          return user.monthRank !== null && user.monthRank <= 10;
        case 'top10Season':
          return user.seasonRank !== null && user.seasonRank <= 10;
        default:
          return true;
      }
    };

    return users
      .filter((user) => {
        const fullName = `${user.firstName} ${user.lastName}`.toLowerCase();
        const matchesSearch = fullName.includes(searchTerm.toLowerCase()) || 
                            user.username.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesQuickFilter = applyQuickFilter(user);
        return matchesSearch && matchesQuickFilter;
      })
      .sort((a, b) => {
        const dir = sortDirection === 'asc' ? 1 : -1;

        const getValue = (user: FantasyUser): number | string => {
          switch (sortColumn) {
            case 'name': return `${user.firstName} ${user.lastName}`;
            case 'username': return user.username;
            case 'weekPoints': return user.weekPoints;
            case 'monthPoints': return user.monthPoints;
            case 'seasonPoints': return user.seasonPoints;
            case 'createdAt': return new Date(user.createdAt).getTime();
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
  }, [users, searchTerm, quickFilter, sortColumn, sortDirection]);

  // Reset filters
  const resetFilters = () => {
    setSearchTerm('');
    setQuickFilter('all');
    setSortColumn('seasonPoints');
    setSortDirection('desc');
  };

  const hasActiveFilters = searchTerm !== '' || quickFilter !== 'all';

  // Get rank display with emoji
  const getRankDisplay = (rank: number | null) => {
    if (rank === null) return '-';
    if (rank === 1) return <span className="dt-rank dt-rank-gold">🥇 1</span>;
    if (rank === 2) return <span className="dt-rank dt-rank-silver">🥈 2</span>;
    if (rank === 3) return <span className="dt-rank dt-rank-bronze">🥉 3</span>;
    return <span className="dt-rank">{rank}</span>;
  };

  // Define table columns
  const columns: Column<FantasyUser>[] = useMemo(() => [
    {
      key: 'rank',
      header: 'Rank',
      width: '70px',
      align: 'center',
      render: (user) => getRankDisplay(user.seasonRank),
    },
    {
      key: 'name',
      header: 'User',
      sortable: true,
      render: (user) => (
        <Link to={`/users/${user.id}`} className="dt-cell-link">
          <div className="dt-info-cell">
            <div className="dt-avatar">
              {user.firstName[0]}{user.lastName[0]}
            </div>
            <div className="dt-info-details">
              <span className="dt-info-name">
                {user.firstName} {user.lastName}
                {currentUserId === user.id && <span className="dt-you-badge">You</span>}
              </span>
              <span className="dt-info-subtitle">@{user.username}</span>
            </div>
          </div>
        </Link>
      ),
    },
    {
      key: 'team',
      header: 'Team',
      width: '120px',
      align: 'center',
      render: (user) => user.hasTeam ? (
        <span className="dt-badge dt-badge-success">✓ {user.teamSize} golfers</span>
      ) : (
        <span className="dt-badge dt-badge-muted">No team</span>
      ),
    },
    {
      key: 'weekPoints',
      header: 'Week',
      sortable: true,
      width: '100px',
      align: 'center',
      render: (user) => (
        <div className="points-cell">
          <span className="dt-cell-stat">{user.weekPoints}</span>
          {user.weekRank && <span className="dt-cell-muted"> #{user.weekRank}</span>}
        </div>
      ),
    },
    {
      key: 'monthPoints',
      header: 'Month',
      sortable: true,
      width: '100px',
      align: 'center',
      render: (user) => (
        <div className="points-cell">
          <span className="dt-cell-stat">{user.monthPoints}</span>
          {user.monthRank && <span className="dt-cell-muted"> #{user.monthRank}</span>}
        </div>
      ),
    },
    {
      key: 'seasonPoints',
      header: 'Season',
      sortable: true,
      width: '100px',
      align: 'center',
      render: (user) => (
        <div className="points-cell">
          <span className="dt-cell-stat dt-cell-stat-highlight">{user.seasonPoints}</span>
          {user.seasonRank && <span className="dt-cell-muted"> #{user.seasonRank}</span>}
        </div>
      ),
    },
    {
      key: 'createdAt',
      header: 'Member Since',
      sortable: true,
      width: '130px',
      render: (user) => <span className="dt-cell-muted">{formatDate(user.createdAt)}</span>,
    },
    {
      key: 'action',
      header: 'Action',
      width: '120px',
      align: 'center',
      render: (user) => (
        <Link to={`/users/${user.id}`} className="dt-btn dt-btn-primary">View Profile</Link>
      ),
    },
  ], [currentUserId]);

  // Get row class name
  const getRowClassName = (user: FantasyUser) => {
    const classes: string[] = [];
    if (currentUserId === user.id) classes.push('dt-row-highlighted');
    if (!user.hasTeam) classes.push('dt-row-muted');
    return classes.join(' ');
  };

  if (loading) {
    return (
      <PageLayout activeNav="users">
        <div className="users-content">
          <div className="users-container">
            <LoadingSpinner text="Loading users..." />
          </div>
        </div>
      </PageLayout>
    );
  }

  return (
    <PageLayout activeNav="users">
      <div className="users-content">
        <div className="users-container">
          {/* Page Title */}
          <div className="users-page-header">
            <h1>👥 Fantasy Participants</h1>
            <p className="users-page-subtitle">View all users playing Bearwood Lakes Fantasy Golf</p>
          </div>

          {/* Search Bar */}
          <SearchBar
            value={searchTerm}
            onChange={setSearchTerm}
            placeholder="Search by name or username..."
          />

          {/* Filters Row */}
          <div className="filters-row">
            <select
              value={quickFilter}
              onChange={(e) => setQuickFilter(e.target.value as QuickFilter)}
              className="filter-select"
            >
              <option value="all">All Users</option>
              <option value="hasTeam">With Team</option>
              <option value="noTeam">Without Team</option>
              <option value="top10Week">🏆 Top 10 Weekly</option>
              <option value="top10Month">🏆 Top 10 Monthly</option>
              <option value="top10Season">🏆 Top 10 Season</option>
            </select>
            {hasActiveFilters && (
              <button className="reset-btn" onClick={resetFilters}>Reset</button>
            )}
            <span className="results-count">Showing {filteredUsers.length} of {users?.length ?? 0}</span>
          </div>

          {/* Error State */}
          {error && (
            <div className="error-message">{error}</div>
          )}

          {/* Users Table */}
          <DataTable
            data={filteredUsers}
            columns={columns}
            rowKey={(user) => user.id}
            sortColumn={sortColumn}
            sortDirection={sortDirection}
            onSort={(col) => handleSort(col as SortColumn)}
            emptyMessage="No users found matching your filters."
            loading={loading}
            rowClassName={getRowClassName}
          />

          {/* Stats Summary */}
          <div className="stats-summary">
            <div className="stat-item">
              <span className="stat-value">{users?.length ?? 0}</span>
              <span className="stat-label">Total Users</span>
            </div>
            <div className="stat-item">
              <span className="stat-value">{users?.filter(u => u.hasTeam).length ?? 0}</span>
              <span className="stat-label">With Teams</span>
            </div>
            <div className="stat-item">
              <span className="stat-value">{users?.filter(u => !u.hasTeam).length ?? 0}</span>
              <span className="stat-label">Without Teams</span>
            </div>
          </div>
        </div>
      </div>
    </PageLayout>
  );
};

export default UsersPage;