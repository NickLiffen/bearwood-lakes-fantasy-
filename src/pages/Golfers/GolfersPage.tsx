// All Golfers Page - View all golfers with stats

import React, { useEffect, useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import PageLayout from '../../components/layout/PageLayout';
import SearchBar from '../../components/ui/SearchBar';
import DataTable, { Column } from '../../components/ui/DataTable';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import { useApiClient } from '../../hooks/useApiClient';
import { formatPrice, getMembershipLabel } from '../../utils/formatters';
import './GolfersPage.css';

interface GolferStats {
  timesScored36Plus: number;
  timesFinished1st: number;
  timesFinished2nd: number;
  timesFinished3rd: number;
  timesPlayed: number;
}

interface GolferPoints {
  week: number;
  month: number;
  season: number;
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
  points: GolferPoints;
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

const GolfersPage: React.FC = () => {
  const { get, isAuthReady } = useApiClient();
  const [golfers, setGolfers] = useState<Golfer[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortColumn, setSortColumn] = useState<SortColumn>('name');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [quickFilter, setQuickFilter] = useState<QuickFilter>('all');

  useEffect(() => {
    const fetchGolfers = async () => {
      try {
        setLoading(true);
        setError(null); // Clear previous errors
        const response = await get<Golfer[]>('golfers-list');

        // Ignore cancelled requests
        if (response.cancelled) return;

        if (response.success && response.data) {
          setGolfers(response.data);
        } else {
          throw new Error(response.error || 'Failed to fetch golfers');
        }
      } catch {
        setError('Failed to load golfers. Please refresh the page.');
      } finally {
        setLoading(false);
      }
    };

    if (isAuthReady) {
      fetchGolfers();
    }
  }, [get, isAuthReady]);

  // Helper functions
  const getPodiums = (stats: GolferStats) => {
    if (!stats) return 0;
    return stats.timesFinished1st + stats.timesFinished2nd + stats.timesFinished3rd;
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

  // Filter and sort golfers
  const filteredGolfers = useMemo(() => {
    // Guard against null data during initial load
    if (golfers === null) return [];

    // Apply quick filter (defined inside useMemo to satisfy exhaustive-deps)
    const filterByQuickFilter = (golfer: Golfer): boolean => {
      switch (quickFilter) {
        case 'all':
          return true;
        case 'active':
          return golfer.isActive;
        case 'inactive':
          return !golfer.isActive;
        case 'winners-2026':
          return (golfer.stats2026?.timesFinished1st || 0) > 0;
        case 'podium-finishers-2026':
          return getPodiums(golfer.stats2026) > 0;
        case 'experienced-2026':
          return (golfer.stats2026?.timesPlayed || 0) >= 5;
        case 'premium':
          return golfer.price >= 10000000;
        case 'budget':
          return golfer.price <= 6000000;
        default:
          return true;
      }
    };

    return golfers
      .filter((golfer) => {
        const fullName = `${golfer.firstName} ${golfer.lastName}`.toLowerCase();
        const matchesSearch = fullName.includes(searchTerm.toLowerCase());
        const matchesQuickFilter = filterByQuickFilter(golfer);
        return matchesSearch && matchesQuickFilter;
      })
      .sort((a, b) => {
        const dir = sortDirection === 'asc' ? 1 : -1;
        
        const getValue = (golfer: Golfer): number | string => {
          switch (sortColumn) {
            case 'name': return `${golfer.firstName} ${golfer.lastName}`;
            case 'price': return golfer.price;
            case 'played-2026': return golfer.stats2026?.timesPlayed || 0;
            case 'first-2026': return golfer.stats2026?.timesFinished1st || 0;
            case 'second-2026': return golfer.stats2026?.timesFinished2nd || 0;
            case 'third-2026': return golfer.stats2026?.timesFinished3rd || 0;
            case 'consistent-2026': return golfer.stats2026?.timesScored36Plus || 0;
            case 'week-pts': return golfer.points?.week || 0;
            case 'month-pts': return golfer.points?.month || 0;
            case 'season-pts': return golfer.points?.season || 0;
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
  }, [golfers, searchTerm, quickFilter, sortColumn, sortDirection]);

  // Reset filters
  const resetFilters = () => {
    setSearchTerm('');
    setQuickFilter('all');
    setSortColumn('name');
    setSortDirection('asc');
  };

  const hasActiveFilters = searchTerm !== '' || quickFilter !== 'all';

  // Row styling for inactive golfers
  const getRowClassName = (golfer: Golfer): string => {
    return !golfer.isActive ? 'dt-row-inactive' : '';
  };

  // Helper to get membership class
  const getDtMembershipClass = (type: string) => {
    switch (type) {
      case 'men': return 'dt-membership dt-membership-men';
      case 'female': return 'dt-membership dt-membership-female';
      case 'junior': return 'dt-membership dt-membership-junior';
      case 'senior': return 'dt-membership dt-membership-senior';
      default: return 'dt-membership';
    }
  };

  // Column definitions for DataTable
  const columns: Column<Golfer>[] = [
    {
      key: 'name',
      header: 'Golfer',
      sortable: true,
      render: (golfer) => (
        <div className="dt-info-cell">
          <Link to={`/golfers/${golfer.id}`} className="dt-text-link">
            {golfer.firstName} {golfer.lastName}
          </Link>
        </div>
      ),
    },
    {
      key: 'membership',
      header: 'Type',
      render: (golfer) => (
        <span className={getDtMembershipClass(golfer.membershipType)}>
          {getMembershipLabel(golfer.membershipType)}
        </span>
      ),
    },
    {
      key: 'price',
      header: 'Price',
      sortable: true,
      align: 'right',
      render: (golfer) => <span className="dt-text-price">{formatPrice(golfer.price)}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      render: (golfer) => (
        <span className={`dt-status ${golfer.isActive ? 'dt-status-active' : 'dt-status-inactive'}`}>
          {golfer.isActive ? 'Active' : 'Inactive'}
        </span>
      ),
    },
    {
      key: 'week-pts',
      header: 'Week',
      sortable: true,
      align: 'center',
      render: (golfer) => golfer.points?.week || 0,
    },
    {
      key: 'month-pts',
      header: 'Month',
      sortable: true,
      align: 'center',
      render: (golfer) => golfer.points?.month || 0,
    },
    {
      key: 'season-pts',
      header: 'Season',
      sortable: true,
      align: 'center',
      render: (golfer) => golfer.points?.season || 0,
    },
    {
      key: 'played-2026',
      header: 'Played',
      sortable: true,
      align: 'center',
      render: (golfer) => golfer.stats2026?.timesPlayed || 0,
    },
    {
      key: 'first-2026',
      header: '1st',
      sortable: true,
      align: 'center',
      render: (golfer) => golfer.stats2026?.timesFinished1st > 0 ? (
        <span className="dt-gold">{golfer.stats2026.timesFinished1st}</span>
      ) : '0',
    },
    {
      key: 'second-2026',
      header: '2nd',
      sortable: true,
      align: 'center',
      render: (golfer) => golfer.stats2026?.timesFinished2nd > 0 ? (
        <span className="dt-silver">{golfer.stats2026.timesFinished2nd}</span>
      ) : '0',
    },
    {
      key: 'third-2026',
      header: '3rd',
      sortable: true,
      align: 'center',
      render: (golfer) => golfer.stats2026?.timesFinished3rd > 0 ? (
        <span className="dt-bronze">{golfer.stats2026.timesFinished3rd}</span>
      ) : '0',
    },
    {
      key: 'consistent-2026',
      header: '36+',
      sortable: true,
      align: 'center',
      render: (golfer) => golfer.stats2026?.timesScored36Plus || 0,
    },
  ];

  if (loading) {
    return (
      <PageLayout activeNav="golfers">
        <div className="golfers-content">
          <div className="golfers-container">
            <LoadingSpinner text="Loading golfers..." fullPage />
          </div>
        </div>
      </PageLayout>
    );
  }

  return (
    <PageLayout activeNav="golfers">
      <div className="golfers-content">
        <div className="golfers-container">
          {/* Page Title */}
          <div className="users-page-header">
            <h1>👥 Bearwood Lakes Golfers</h1>
            <p className="users-page-subtitle">View all golfers with their points/scores </p>
          </div>

          {/* Search Bar - Full Width */}
          <SearchBar
            value={searchTerm}
            onChange={setSearchTerm}
            placeholder="Search golfers by name..."
          />

          {/* Filters Row */}
          <div className="filters-row">
            <select
              value={quickFilter}
              onChange={(e) => setQuickFilter(e.target.value as QuickFilter)}
              className="filter-select"
            >
              <option value="all">All Golfers</option>
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
            <span className="results-count">Showing {filteredGolfers.length} of {golfers?.length ?? 0}</span>
          </div>

          {/* Error State */}
          {error && (
            <div className="error-message">{error}</div>
          )}

          {/* Golfers Table */}
          <DataTable
            data={filteredGolfers}
            columns={columns}
            rowKey={(golfer) => golfer.id}
            sortColumn={sortColumn}
            sortDirection={sortDirection}
            onSort={(col) => handleSort(col as SortColumn)}
            emptyMessage="No golfers found matching your filters."
            loading={loading}
            rowClassName={getRowClassName}
          />

          {/* Legend */}
          <div className="dt-legend">
            <span className="dt-legend-item"><span className="dt-gold">●</span> 1st Place</span>
            <span className="dt-legend-item"><span className="dt-silver">●</span> 2nd Place</span>
            <span className="dt-legend-item"><span className="dt-bronze">●</span> 3rd Place</span>
            <span className="dt-legend-item">36+ = Scored 36 points or more</span>
          </div>
        </div>
      </div>
    </PageLayout>
  );
};

export default GolfersPage;
