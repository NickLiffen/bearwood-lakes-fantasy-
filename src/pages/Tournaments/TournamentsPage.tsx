// Tournaments Page - View all tournaments and results

import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import PageLayout from '../../components/layout/PageLayout';
import SearchBar from '../../components/ui/SearchBar';
import SeasonSelector from '../../components/ui/SeasonSelector';
import DataTable, { Column } from '../../components/ui/DataTable';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import { useApiClient } from '../../hooks/useApiClient';
import { useActiveSeason } from '../../hooks/useActiveSeason';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { getTournamentTypeLabel, TOURNAMENT_TYPE_CONFIG, TournamentType } from '@shared/types';
import './TournamentsPage.css';

interface PodiumGolfer {
  id: string;
  firstName: string;
  lastName: string;
}

interface TournamentResults {
  first: PodiumGolfer | null;
  second: PodiumGolfer | null;
  third: PodiumGolfer | null;
  bonusScorerCount: number;
  participantCount: number;
}

interface Tournament {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  tournamentType: TournamentType;
  scoringFormat: 'stableford' | 'medal';
  isMultiDay: boolean;
  multiplier: number;
  golferCountTier: '0-10' | '10-20' | '20+';
  status: 'draft' | 'published' | 'complete';
  season: number;
  results?: TournamentResults;
}

type SortColumn = 'startDate' | 'name' | 'type' | 'participants';
type SortDirection = 'asc' | 'desc';
type TypeFilter = 'all' | TournamentType;

const TournamentsPage: React.FC = () => {
  const { season } = useActiveSeason();
  const { get, isAuthReady } = useApiClient();
  useDocumentTitle('Tournaments');

  const [selectedSeason, setSelectedSeason] = useState<string>('overall');
  const [tournaments, setTournaments] = useState<Tournament[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortColumn, setSortColumn] = useState<SortColumn>('startDate');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');

  // Initialize selectedSeason from active season
  useEffect(() => {
    if (season?.name && !selectedSeason) {
      setSelectedSeason(season.name);
    }
  }, [season?.name, selectedSeason]);

  // Fetch tournaments when selectedSeason changes
  const fetchTournaments = useCallback(async () => {
    if (!isAuthReady || !selectedSeason) return;
    setLoading(true);
    setError(null);
    try {
      const response = await get<Tournament[]>(
        `tournaments-list?includeResults=true&season=${selectedSeason}`
      );
      if (response.cancelled) return;
      if (response.success && response.data) {
        setTournaments(response.data);
      } else {
        setError(response.error || 'Failed to load tournaments');
      }
    } catch {
      setError('Failed to load tournaments. Please refresh the page.');
    } finally {
      setLoading(false);
    }
  }, [get, isAuthReady, selectedSeason]);

  useEffect(() => {
    fetchTournaments();
  }, [fetchTournaments]);

  // Format date for display
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  };

  // Get tournament type badge class
  const getTypeBadgeClass = (type: TournamentType) => {
    const config = TOURNAMENT_TYPE_CONFIG[type];
    if (config.multiplier >= 4) return 'tournament-type tournament-type-signature';
    if (config.multiplier >= 2) return 'tournament-type tournament-type-elevated';
    return 'tournament-type tournament-type-regular';
  };

  // Handle column header click for sorting
  const handleSort = (column: SortColumn) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection(column === 'name' ? 'asc' : 'desc');
    }
  };

  // Filter and sort tournaments - only show complete tournaments (those with scores)
  const filteredTournaments = useMemo(() => {
    if (tournaments === null) return [];

    return tournaments
      .filter((tournament) => {
        // Only show complete tournaments (with scores)
        if (tournament.status !== 'complete') return false;
        const matchesSearch = tournament.name.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesType = typeFilter === 'all' || tournament.tournamentType === typeFilter;
        return matchesSearch && matchesType;
      })
      .sort((a, b) => {
        const dir = sortDirection === 'asc' ? 1 : -1;

        switch (sortColumn) {
          case 'startDate':
            return (new Date(a.startDate).getTime() - new Date(b.startDate).getTime()) * dir;
          case 'name':
            return a.name.localeCompare(b.name) * dir;
          case 'type':
            return a.tournamentType.localeCompare(b.tournamentType) * dir;
          case 'participants':
            return ((a.results?.participantCount || 0) - (b.results?.participantCount || 0)) * dir;
          default:
            return 0;
        }
      });
  }, [tournaments, searchTerm, typeFilter, sortColumn, sortDirection]);

  // Reset filters
  const resetFilters = () => {
    setSearchTerm('');
    setTypeFilter('all');
    setSortColumn('startDate');
    setSortDirection('desc');
  };

  const hasActiveFilters = searchTerm !== '' || typeFilter !== 'all';

  // Define table columns
  const columns: Column<Tournament>[] = useMemo(
    () => [
      {
        key: 'startDate',
        header: 'Date',
        sortable: true,
        width: '120px',
        render: (tournament) => (
          <span className="dt-cell-muted">{formatDate(tournament.startDate)}</span>
        ),
      },
      {
        key: 'name',
        header: 'Tournament',
        sortable: true,
        render: (tournament) => (
          <Link to={`/tournaments/${tournament.id}`} className="dt-cell-link">
            <span className="tournament-name">{tournament.name}</span>
          </Link>
        ),
      },
      {
        key: 'type',
        header: 'Type',
        sortable: true,
        width: '130px',
        align: 'center',
        render: (tournament) => (
          <span className={getTypeBadgeClass(tournament.tournamentType)}>
            {getTournamentTypeLabel(tournament.tournamentType)}
            <span className="multiplier-badge">{tournament.multiplier}x</span>
          </span>
        ),
      },
      {
        key: 'first',
        header: '1st',
        width: '140px',
        render: (tournament) =>
          tournament.results?.first ? (
            <Link
              to={`/golfers/${tournament.results.first.id}`}
              className="podium-link podium-gold"
            >
              {tournament.results.first.firstName} {tournament.results.first.lastName}
            </Link>
          ) : (
            <span className="dt-cell-muted">-</span>
          ),
      },
      {
        key: 'second',
        header: '2nd',
        width: '140px',
        render: (tournament) =>
          tournament.results?.second ? (
            <Link
              to={`/golfers/${tournament.results.second.id}`}
              className="podium-link podium-silver"
            >
              {tournament.results.second.firstName} {tournament.results.second.lastName}
            </Link>
          ) : (
            <span className="dt-cell-muted">-</span>
          ),
      },
      {
        key: 'third',
        header: '3rd',
        width: '140px',
        render: (tournament) =>
          tournament.results?.third ? (
            <Link
              to={`/golfers/${tournament.results.third.id}`}
              className="podium-link podium-bronze"
            >
              {tournament.results.third.firstName} {tournament.results.third.lastName}
            </Link>
          ) : (
            <span className="dt-cell-muted">-</span>
          ),
      },
      {
        key: 'bonusScorers',
        header: 'Bonus',
        width: '70px',
        align: 'center',
        render: (tournament) => (
          <span className={tournament.results?.bonusScorerCount ? 'dt-cell-stat' : 'dt-cell-muted'}>
            {tournament.results?.bonusScorerCount || 0}
          </span>
        ),
      },
      {
        key: 'participants',
        header: 'Players',
        sortable: true,
        width: '80px',
        align: 'center',
        render: (tournament) => (
          <span className="dt-cell-stat">{tournament.results?.participantCount || 0}</span>
        ),
      },
    ],
    []
  );

  if (loading) {
    return (
      <PageLayout activeNav="tournaments">
        <div className="tournaments-content">
          <div className="tournaments-container">
            <LoadingSpinner text="Loading tournaments..." />
          </div>
        </div>
      </PageLayout>
    );
  }

  // Calculate stats - only from complete tournaments
  const completeTournaments = tournaments?.filter((t) => t.status === 'complete') || [];
  const typeCounts = Object.keys(TOURNAMENT_TYPE_CONFIG).reduce(
    (acc, key) => {
      acc[key as TournamentType] = completeTournaments.filter(
        (t) => t.tournamentType === key
      ).length;
      return acc;
    },
    {} as Record<TournamentType, number>
  );

  return (
    <PageLayout activeNav="tournaments">
      <div className="tournaments-content">
        <div className="tournaments-container">
          {/* Page Title */}
          <div className="tournaments-page-header">
            <div className="page-header-row">
              <h1>Tournaments</h1>
              <SeasonSelector value={selectedSeason} onChange={setSelectedSeason} />
            </div>
            <p className="tournaments-page-subtitle">
              View all tournaments and results for the {selectedSeason || '2026'} season
            </p>
          </div>

          {/* Search Bar */}
          <SearchBar
            value={searchTerm}
            onChange={setSearchTerm}
            placeholder="Search by tournament name..."
          />

          {/* Filters Row */}
          <div className="filters-row">
            <select
              id="tournament-type-filter"
              name="tournament-type-filter"
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value as TypeFilter)}
              className="filter-select"
            >
              <option value="all">All Types</option>
              {(
                Object.entries(TOURNAMENT_TYPE_CONFIG) as [
                  TournamentType,
                  (typeof TOURNAMENT_TYPE_CONFIG)[TournamentType],
                ][]
              ).map(([key, config]) => (
                <option key={key} value={key}>
                  {config.label} ({config.multiplier}×)
                </option>
              ))}
            </select>
            {hasActiveFilters && (
              <button className="reset-btn" onClick={resetFilters}>
                Reset
              </button>
            )}
            <span className="results-count">
              Showing {filteredTournaments.length} of {completeTournaments.length} tournaments
            </span>
          </div>

          {/* Error State */}
          {error && <div className="error-message">{error}</div>}

          {/* Tournaments Table */}
          <DataTable
            data={filteredTournaments}
            columns={columns}
            rowKey={(tournament) => tournament.id}
            sortColumn={sortColumn}
            sortDirection={sortDirection}
            onSort={(col) => handleSort(col as SortColumn)}
            emptyMessage="No tournaments found matching your filters."
            loading={loading}
          />

          {/* Stats Summary */}
          <div className="stats-summary">
            <div className="stat-item">
              <span className="stat-value">{completeTournaments.length}</span>
              <span className="stat-label">Tournaments</span>
            </div>
            {(
              Object.entries(TOURNAMENT_TYPE_CONFIG) as [
                TournamentType,
                (typeof TOURNAMENT_TYPE_CONFIG)[TournamentType],
              ][]
            ).map(([key, config]) => (
              <div className="stat-item" key={key}>
                <span className="stat-value">{typeCounts[key]}</span>
                <span className="stat-label">
                  {config.label} ({config.multiplier}×)
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </PageLayout>
  );
};

export default TournamentsPage;
