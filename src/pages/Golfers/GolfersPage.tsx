// All Golfers Page - View all golfers with stats

import React, { useCallback, useState, useMemo, useEffect } from 'react';
import { Link } from 'react-router-dom';
import PageLayout from '../../components/layout/PageLayout';
import SearchBar from '../../components/ui/SearchBar';
import SeasonSelector from '../../components/ui/SeasonSelector';
import DataTable, { Column } from '../../components/ui/DataTable';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import { useApiClient } from '../../hooks/useApiClient';
import { formatPrice } from '../../utils/formatters';
import { useActiveSeason } from '../../hooks/useActiveSeason';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import './GolfersPage.css';

interface GolferStats {
  timesBonusScored: number;
  timesFinished1st: number;
  timesFinished2nd: number;
  timesFinished3rd: number;
  timesPlayed: number;
  timesScored36Plus: number;
  timesScored32Plus: number;
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
  stats2024: GolferStats;
  stats2025: GolferStats;
  stats2026: GolferStats;
  points: GolferPoints;
  selectedPercentage: number;
}

// Sort column and direction
type SortColumn = string;

type SortDirection = 'asc' | 'desc';

// Quick filter presets
type QuickFilter = 'all' | 'active' | 'inactive' | 'premium' | 'budget' | string;

const GolfersPage: React.FC = () => {
  const { season } = useActiveSeason();
  const { get, isAuthReady } = useApiClient();
  useDocumentTitle('Golfers');

  const [selectedSeason, setSelectedSeason] = useState<string>('');
  const [golfers, setGolfers] = useState<Golfer[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const seasonName = selectedSeason || '2026';

  // Initialize selectedSeason from active season
  useEffect(() => {
    if (season?.name && !selectedSeason) {
      setSelectedSeason(season.name);
    }
  }, [season?.name, selectedSeason]);

  // Fetch golfers when selectedSeason changes
  useEffect(() => {
    if (!isAuthReady || !selectedSeason) return;
    let cancelled = false;

    const fetchGolfers = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await get<Golfer[]>(`golfers-list?season=${selectedSeason}`);
        if (response.cancelled || cancelled) return;
        if (response.success && response.data) {
          setGolfers(response.data);
        } else {
          setError(response.error || 'Failed to load golfers');
        }
      } catch {
        if (!cancelled) setError('Failed to load golfers. Please refresh the page.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchGolfers();
    return () => { cancelled = true; };
  }, [get, isAuthReady, selectedSeason]);

  const getStats = useCallback(
    (golfer: Golfer) => {
      if (seasonName === '2024') return golfer.stats2024;
      if (seasonName === '2025') return golfer.stats2025;
      return golfer.stats2026;
    },
    [seasonName]
  );

  const [searchTerm, setSearchTerm] = useState('');
  const [sortColumn, setSortColumn] = useState<SortColumn>('season-pts');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [quickFilter, setQuickFilter] = useState<QuickFilter>('all');

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
        case `winners-${seasonName}`:
          return (getStats(golfer)?.timesFinished1st || 0) > 0;
        case `podium-finishers-${seasonName}`:
          return getPodiums(getStats(golfer)) > 0;
        case `experienced-${seasonName}`:
          return (getStats(golfer)?.timesPlayed || 0) >= 5;
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
            case 'name':
              return `${golfer.firstName} ${golfer.lastName}`;
            case 'price':
              return golfer.price;
            case 'selected':
              return golfer.selectedPercentage || 0;
            case 'week-pts':
              return golfer.points?.week || 0;
            case 'month-pts':
              return golfer.points?.month || 0;
            case 'season-pts':
              return golfer.points?.season || 0;
            default:
              return 0;
          }
        };

        const aVal = getValue(a);
        const bVal = getValue(b);

        if (typeof aVal === 'string' && typeof bVal === 'string') {
          return aVal.localeCompare(bVal) * dir;
        }
        return ((aVal as number) - (bVal as number)) * dir;
      });
  }, [golfers, searchTerm, quickFilter, sortColumn, sortDirection, seasonName, getStats]);

  // Reset filters
  const resetFilters = () => {
    setSearchTerm('');
    setQuickFilter('all');
    setSortColumn('season-pts');
    setSortDirection('desc');
  };

  const hasActiveFilters = searchTerm !== '' || quickFilter !== 'all';

  // Row styling for inactive golfers
  const getRowClassName = (golfer: Golfer): string => {
    return !golfer.isActive ? 'dt-row-inactive' : '';
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
      key: 'price',
      header: 'Price',
      sortable: true,
      align: 'right',
      render: (golfer) => <span className="dt-text-price">{formatPrice(golfer.price)}</span>,
    },
    {
      key: 'selected',
      header: 'Selected',
      sortable: true,
      align: 'center',
      render: (golfer) => (
        <span style={{ color: golfer.selectedPercentage > 0 ? 'var(--primary-green)' : '#9ca3af' }}>
          {golfer.selectedPercentage}%
        </span>
      ),
    },
    {
      key: 'week-pts',
      header: 'Week Pts',
      sortable: true,
      align: 'center',
      render: (golfer) => golfer.points?.week || 0,
    },
    {
      key: 'month-pts',
      header: 'Month Pts',
      sortable: true,
      align: 'center',
      render: (golfer) => golfer.points?.month || 0,
    },
    {
      key: 'season-pts',
      header: 'Season Pts',
      sortable: true,
      align: 'center',
      render: (golfer) => (
        <span style={{ fontWeight: 600 }}>{golfer.points?.season || 0}</span>
      ),
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
            <div className="page-header-row">
              <h1>👥 Bearwood Lakes Golfers</h1>
              <SeasonSelector value={selectedSeason} onChange={setSelectedSeason} />
            </div>
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
              id="golfer-filter"
              name="golfer-filter"
              value={quickFilter}
              onChange={(e) => setQuickFilter(e.target.value as QuickFilter)}
              className="filter-select"
            >
              <option value="all">All Golfers</option>
              <option value="active">Active Only</option>
              <option value="inactive">Inactive Only</option>
              <option value={`winners-${seasonName}`}>🏆 Winners</option>
              <option value={`podium-finishers-${seasonName}`}>🥇 Podium Finishers</option>
              <option value={`experienced-${seasonName}`}>⭐ Experienced (5+ rounds)</option>
              <option value="premium">💎 Premium ($10M+)</option>
              <option value="budget">💰 Budget (≤$6M)</option>
            </select>
            {hasActiveFilters && (
              <button className="reset-btn" onClick={resetFilters}>
                Reset
              </button>
            )}
            <span className="results-count">
              Showing {filteredGolfers.length} of {golfers?.length ?? 0}
            </span>
          </div>

          {/* Error State */}
          {error && <div className="error-message">{error}</div>}

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
            <span className="dt-legend-item">
              <span className="dt-gold">●</span> 1st Place
            </span>
            <span className="dt-legend-item">
              <span className="dt-silver">●</span> 2nd Place
            </span>
            <span className="dt-legend-item">
              <span className="dt-bronze">●</span> 3rd Place
            </span>
            <span className="dt-legend-item">36+ = Scored 36 points or more</span>
          </div>
        </div>
      </div>
    </PageLayout>
  );
};

export default GolfersPage;
