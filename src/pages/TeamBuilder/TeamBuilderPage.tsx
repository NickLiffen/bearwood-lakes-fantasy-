// Team Builder Page - Pick your fantasy golf team

import React, { useCallback, useEffect, useState, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import PageLayout from '../../components/layout/PageLayout';
import { useApiClient } from '../../hooks/useApiClient';
import { useActiveSeason } from '../../hooks/useActiveSeason';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { matchesSearch } from '../../utils/search';
import Toast from '../../components/ui/Toast';
import './TeamBuilderPage.css';

interface GolferStats {
  timesBonusScored: number;
  timesFinished1st: number;
  timesFinished2nd: number;
  timesFinished3rd: number;
  timesPlayed: number;
}

interface SeasonStat {
  seasonName: string;
  isActive: boolean;
  startDate: string;
  endDate: string;
  timesPlayed: number;
  timesFinished1st: number;
  timesFinished2nd: number;
  timesFinished3rd: number;
  timesBonusScored: number;
  timesScored36Plus: number;
  timesScored32Plus: number;
  totalPoints: number;
}

interface Golfer {
  id: string;
  firstName: string;
  lastName: string;
  picture: string;
  price: number;
  isActive: boolean;
  stats2024: GolferStats;
  stats2025: GolferStats;
  stats2026?: GolferStats;
  seasonStats?: SeasonStat[];
  selectedPercentage?: number;
}

interface Settings {
  transfersOpen: boolean;
  registrationOpen: boolean;
  currentSeason: number;
  allowNewTeamCreation: boolean;
}

const TOTAL_BUDGET = 50000000; // $50M
const TEAM_SIZE = 6;
const GOLFERS_PER_PAGE = 24; // 4 columns × 6 rows

// Sort options type
type SortOption =
  | 'price-high'
  | 'price-low'
  | 'name'
  | 'most-wins'
  | 'most-podiums'
  | 'most-played'
  | 'most-consistent'
  | 'best-value'
  | 'win-rate'
  | 'podium-rate'
  | 'selected-high'
  | 'selected-low';

// Quick filter presets
type QuickFilter =
  | 'all'
  | 'winners'
  | 'podium-finishers'
  | 'consistent'
  | 'value-picks'
  | 'premium';

const TeamBuilderPage: React.FC = () => {
  const navigate = useNavigate();
  const [golfers, setGolfers] = useState<Golfer[]>([]);
  const [selectedGolfers, setSelectedGolfers] = useState<Golfer[]>([]);
  const [hasExistingTeam, setHasExistingTeam] = useState(false);
  const [existingCaptainId, setExistingCaptainId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'warning' } | null>(null);
  const searchSectionRef = useRef<HTMLDivElement>(null);
  const teamSlotsRef = useRef<HTMLDivElement>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState<SortOption>('price-high');
  const [quickFilter, setQuickFilter] = useState<QuickFilter>('all');
  const [settings, setSettings] = useState<Settings | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedGolferDetail, setSelectedGolferDetail] = useState<Golfer | null>(null);
  const { get, post, isAuthReady } = useApiClient();
  const { season } = useActiveSeason();
  const seasonName = season?.name || '2026';
  useDocumentTitle('Team Builder');

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null); // Clear previous errors

      // Fetch golfers, user's picks, and settings in parallel
      const [playersRes, picksRes, settingsRes] = await Promise.all([
        get<Golfer[]>('golfers-list'),
        get<{ golfers: Golfer[]; captainId?: string | null }>('picks-get'),
        get<Settings>('settings-public'),
      ]);

      // Ignore cancelled requests
      if (playersRes.cancelled || picksRes.cancelled || settingsRes.cancelled) {
        return;
      }

      if (playersRes.success && playersRes.data) {
        setGolfers(playersRes.data.filter((g: Golfer) => g.isActive));
      }

      if (picksRes.success && picksRes.data?.golfers) {
        setSelectedGolfers(picksRes.data.golfers);
        setHasExistingTeam(true);
        if (picksRes.data.captainId) {
          setExistingCaptainId(picksRes.data.captainId);
        }
      }

      if (settingsRes.success && settingsRes.data) {
        setSettings(settingsRes.data);
      }
    } catch {
      setError('Failed to load data. Please refresh the page.');
    } finally {
      setLoading(false);
    }
  }, [get]);

  useEffect(() => {
    if (isAuthReady) {
      fetchData();
    }
  }, [isAuthReady, fetchData]);

  const budgetUsed = selectedGolfers.reduce((sum, p) => sum + p.price, 0);
  const budgetRemaining = TOTAL_BUDGET - budgetUsed;
  const budgetPercentage = (budgetUsed / TOTAL_BUDGET) * 100;

  const formatPrice = (price: number) => {
    return `$${(price / 1000000).toFixed(1)}M`;
  };

  const isSelected = (golfer: Golfer) => {
    return selectedGolfers.some((g) => g.id === golfer.id);
  };

  // Determine if the user can edit their team
  // - If they have an existing team, check transfersOpen
  // - If they don't have a team, check allowNewTeamCreation
  const canEditTeam = hasExistingTeam
    ? (settings?.transfersOpen ?? true)
    : (settings?.allowNewTeamCreation ?? true);

  const handleToggleGolfer = (golfer: Golfer) => {
    if (!canEditTeam) return;

    // If already selected, remove them
    if (isSelected(golfer)) {
      setSelectedGolfers(selectedGolfers.filter((g) => g.id !== golfer.id));
      return;
    }

    // Otherwise, try to add them
    if (selectedGolfers.length >= TEAM_SIZE) return;

    setSelectedGolfers([...selectedGolfers, golfer]);
    setToast({ message: `✓ ${golfer.firstName} ${golfer.lastName} added`, type: 'success' });
    setTimeout(() => {
      teamSlotsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 300);
  };

  const handleRemoveGolfer = (golfer: Golfer) => {
    if (!canEditTeam) return;
    setSelectedGolfers(selectedGolfers.filter((g) => g.id !== golfer.id));
    setToast({ message: `✕ ${golfer.firstName} ${golfer.lastName} removed`, type: 'warning' });
  };

  const handleSaveTeam = async () => {
    if (!canEditTeam) return;

    // Validate team is complete
    if (selectedGolfers.length < TEAM_SIZE) {
      setError(
        `You must select ${TEAM_SIZE} golfers to save your team. Currently selected: ${selectedGolfers.length}`
      );
      return;
    }

    try {
      setSaving(true);
      setError(null);

      // Preserve captain if they're still in the team
      const selectedIds = selectedGolfers.map((p) => p.id);
      const captainStillInTeam = existingCaptainId && selectedIds.includes(existingCaptainId);

      const response = await post('picks-save', {
        golferIds: selectedIds,
        captainId: captainStillInTeam ? existingCaptainId : null,
      });

      if (!response.success) {
        throw new Error(response.error || 'Failed to save team');
      }

      // Redirect to My Team page after successful save
      navigate('/my-team');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save team');
    } finally {
      setSaving(false);
    }
  };

  // Combine stats from all seasons for filtering/sorting
  const getCombinedStats = (golfer: Golfer) => {
    if (!golfer.seasonStats || golfer.seasonStats.length === 0) {
      const s = golfer.stats2025;
      return {
        timesPlayed: s?.timesPlayed ?? 0,
        timesFinished1st: s?.timesFinished1st ?? 0,
        timesFinished2nd: s?.timesFinished2nd ?? 0,
        timesFinished3rd: s?.timesFinished3rd ?? 0,
        timesBonusScored: s?.timesBonusScored ?? 0,
        timesScored32Plus: 0,
        totalPoints: 0,
      };
    }
    return golfer.seasonStats.reduce(
      (acc, ss) => ({
        timesPlayed: acc.timesPlayed + ss.timesPlayed,
        timesFinished1st: acc.timesFinished1st + ss.timesFinished1st,
        timesFinished2nd: acc.timesFinished2nd + ss.timesFinished2nd,
        timesFinished3rd: acc.timesFinished3rd + ss.timesFinished3rd,
        timesBonusScored: acc.timesBonusScored + ss.timesBonusScored,
        timesScored32Plus: acc.timesScored32Plus + (ss.timesScored32Plus || 0),
        totalPoints: acc.totalPoints + ss.totalPoints,
      }),
      {
        timesPlayed: 0,
        timesFinished1st: 0,
        timesFinished2nd: 0,
        timesFinished3rd: 0,
        timesBonusScored: 0,
        timesScored32Plus: 0,
        totalPoints: 0,
      }
    );
  };

  // Consistency = % of events where golfer scored 32+ points
  const getConsistencyPct = (golfer: Golfer): number => {
    const stats = getCombinedStats(golfer);
    if (stats.timesPlayed < 1) return 0;
    return Math.round((stats.timesScored32Plus / stats.timesPlayed) * 100);
  };

  // Helper functions for calculated stats
  const getPodiums = (golfer: Golfer) => {
    const stats = getCombinedStats(golfer);
    return stats.timesFinished1st + stats.timesFinished2nd + stats.timesFinished3rd;
  };

  const getWinRate = (golfer: Golfer) => {
    const stats = getCombinedStats(golfer);
    return stats.timesPlayed > 0 ? (stats.timesFinished1st / stats.timesPlayed) * 100 : 0;
  };

  const getPodiumRate = (golfer: Golfer) => {
    const stats = getCombinedStats(golfer);
    const podiums = stats.timesFinished1st + stats.timesFinished2nd + stats.timesFinished3rd;
    return stats.timesPlayed > 0 ? (podiums / stats.timesPlayed) * 100 : 0;
  };

  const getValueScore = (golfer: Golfer) => {
    // Podiums per million dollars spent
    const podiums = getPodiums(golfer);
    const priceInMillions = golfer.price / 1000000;
    if (priceInMillions === 0) return 0;
    return podiums / priceInMillions;
  };

  // Quick filter logic
  const applyQuickFilter = (golfer: Golfer): boolean => {
    const stats = getCombinedStats(golfer);
    switch (quickFilter) {
      case 'winners':
        return stats.timesFinished1st > 0;
      case 'podium-finishers':
        return getPodiums(golfer) > 0;
      case 'consistent':
        return stats.timesPlayed >= 3 && (stats.timesScored32Plus / stats.timesPlayed) >= 0.7;
      case 'value-picks':
        return golfer.price <= 8000000; // $8M or less
      case 'premium':
        return golfer.price >= 10000000; // $10M or more
      default:
        return true;
    }
  };

  // Reset all filters
  const resetFilters = () => {
    setSearchTerm('');
    setQuickFilter('all');
    setSortBy('price-high');
  };

  // Check if any filters are active
  const hasActiveFilters =
    searchTerm !== '' ||
    quickFilter !== 'all';

  // Filter and sort golfers
  const filteredGolfers = golfers
    .filter((golfer) => {
      const fullName = `${golfer.firstName} ${golfer.lastName}`;
      const matches = matchesSearch(fullName, searchTerm);
      const matchesQuickFilter = applyQuickFilter(golfer);
      return (
        matches &&
        matchesQuickFilter
      );
    })
    .sort((a, b) => {
      switch (sortBy) {
        case 'name':
          return `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`);
        case 'price-low':
          return a.price - b.price;
        case 'price-high':
          return b.price - a.price;
        case 'most-wins':
          return getCombinedStats(b).timesFinished1st - getCombinedStats(a).timesFinished1st;
        case 'most-podiums':
          return getPodiums(b) - getPodiums(a);
        case 'most-played':
          return getCombinedStats(b).timesPlayed - getCombinedStats(a).timesPlayed;
        case 'most-consistent':
          return getConsistencyPct(b) - getConsistencyPct(a);
        case 'best-value':
          return getValueScore(b) - getValueScore(a);
        case 'win-rate':
          return getWinRate(b) - getWinRate(a);
        case 'podium-rate':
          return getPodiumRate(b) - getPodiumRate(a);
        case 'selected-high':
          return (b.selectedPercentage ?? 0) - (a.selectedPercentage ?? 0);
        case 'selected-low':
          return (a.selectedPercentage ?? 0) - (b.selectedPercentage ?? 0);
        default:
          return 0;
      }
    });

  // Pagination logic
  const totalPages = Math.ceil(filteredGolfers.length / GOLFERS_PER_PAGE);
  const paginatedGolfers = useMemo(() => {
    const startIndex = (currentPage - 1) * GOLFERS_PER_PAGE;
    return filteredGolfers.slice(startIndex, startIndex + GOLFERS_PER_PAGE);
  }, [filteredGolfers, currentPage]);

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, quickFilter, sortBy]);

  // Generate page numbers for pagination
  const getPageNumbers = () => {
    const pages: (number | string)[] = [];
    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      if (currentPage <= 3) {
        pages.push(1, 2, 3, 4, '...', totalPages);
      } else if (currentPage >= totalPages - 2) {
        pages.push(1, '...', totalPages - 3, totalPages - 2, totalPages - 1, totalPages);
      } else {
        pages.push(1, '...', currentPage - 1, currentPage, currentPage + 1, '...', totalPages);
      }
    }
    return pages;
  };

  if (loading) {
    return (
      <PageLayout activeNav="my-team">
        <div className="team-builder-content">
          <div className="team-builder-container">
            <div className="loading-state">
              <div className="loading-spinner"></div>
              <p>Loading golfers...</p>
            </div>
          </div>
        </div>
      </PageLayout>
    );
  }

  return (
    <PageLayout activeNav="my-team">
      <div className="team-builder-content">
        <div className="team-builder-container">
          {/* Page Header */}
          <div className="users-page-header">
            <h1> 👥 {hasExistingTeam ? 'Edit Your Team' : 'Build Your Team'}</h1>
            <p className="users-page-subtitle">Select 6 golfers within your $50M budget</p>
          </div>
          {!canEditTeam && (
            <div className="transfer-locked-banner">
              <span className="lock-icon">🔒</span>
              <span>
                {hasExistingTeam ? 'Transfer window is closed' : 'New team creation is disabled'}
              </span>
            </div>
          )}

          {/* Alerts */}
          {error && (
            <div className="alert alert-error">
              <span>⚠️</span> {error}
              <button onClick={() => setError(null)} className="alert-close">
                ×
              </button>
            </div>
          )}


          {/* Budget & Team Summary */}
          <section className="summary-section">
            <div className="summary-card budget-card">
              <div className="summary-header">
                <h3>💰 Budget</h3>
                <span className="budget-amount">{formatPrice(budgetRemaining)} remaining</span>
              </div>
              <div className="budget-bar-container">
                <div
                  className={`budget-bar ${budgetPercentage > 90 ? 'budget-critical' : budgetPercentage > 70 ? 'budget-warning' : ''}`}
                  style={{ width: `${budgetPercentage}%` }}
                />
              </div>
              <div className="budget-details">
                <span>Spent: {formatPrice(budgetUsed)}</span>
                <span>Total: {formatPrice(TOTAL_BUDGET)}</span>
              </div>
            </div>

            <div className="summary-card team-card">
              <div className="summary-header">
                <h3>👥 Your Team</h3>
                <span className="team-count">
                  {selectedGolfers.length} / {TEAM_SIZE} golfers
                </span>
              </div>
              <div className="team-slots" ref={teamSlotsRef}>
                {[...Array(TEAM_SIZE)].map((_, index) => {
                  const golfer = selectedGolfers[index];
                  return (
                    <div
                      key={index}
                      className={`team-slot ${golfer ? 'filled' : 'empty'}`}
                      onClick={
                        golfer
                          ? () => handleRemoveGolfer(golfer)
                          : () => {
                              searchSectionRef.current?.scrollIntoView({
                                behavior: 'smooth',
                                block: 'start',
                              });
                              setTimeout(() => {
                                const input = document.getElementById('golfer-search');
                                if (input) input.focus();
                              }, 500);
                            }
                      }
                      style={{ cursor: 'pointer' }}
                      title={golfer ? 'Tap to remove' : undefined}
                    >
                      {golfer ? (
                        <>
                          <div className="slot-golfer">
                            <span className="slot-name">{golfer.lastName}</span>
                            <span className="slot-price">{formatPrice(golfer.price)}</span>
                          </div>
                          {canEditTeam && (
                            <button
                              className="slot-remove"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleRemoveGolfer(golfer);
                              }}
                              title="Remove golfer"
                            >
                              ×
                            </button>
                          )}
                        </>
                      ) : (
                        <span className="slot-empty-text">Empty</span>
                      )}
                    </div>
                  );
                })}
              </div>
              {canEditTeam && (
                <button
                  className={`btn btn-save-team ${selectedGolfers.length === TEAM_SIZE && budgetRemaining >= 0 ? '' : 'btn-incomplete'}`}
                  onClick={handleSaveTeam}
                  disabled={saving || selectedGolfers.length !== TEAM_SIZE || budgetRemaining < 0}
                >
                  {saving
                    ? 'Saving...'
                    : budgetRemaining < 0
                      ? `Over budget by ${formatPrice(Math.abs(budgetRemaining))} — remove golfers to save`
                      : selectedGolfers.length === TEAM_SIZE
                        ? 'Save Team'
                        : `Select ${TEAM_SIZE - selectedGolfers.length} more golfer${TEAM_SIZE - selectedGolfers.length !== 1 ? 's' : ''}`}
                </button>
              )}
            </div>
          </section>

          {/* Filters */}
          <section className="filters-section" ref={searchSectionRef}>
            {/* Search */}
            <div className="search-box">
              <span className="search-icon">🔍</span>
              <input
                id="golfer-search"
                name="golfer-search"
                type="text"
                placeholder="Search golfers..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
              {searchTerm && (
                <button className="search-clear" onClick={() => setSearchTerm('')}>
                  ×
                </button>
              )}
            </div>

            {/* Quick Filters */}
            <div className="quick-filters">
              <span className="quick-filters-label">Quick Filters:</span>
              <div className="quick-filter-chips">
                {[
                  { value: 'all', label: 'All', icon: '👥', desc: '' },
                  { value: 'winners', label: 'Winners', icon: '🏆', desc: 'Won 1st place' },
                  { value: 'podium-finishers', label: 'Podium', icon: '🥇', desc: 'Finished top 3' },
                  { value: 'consistent', label: 'Consistent', icon: '📈', desc: 'Score 32+ in 70%+ of events' },
                  { value: 'value-picks', label: 'Value', icon: '💎', desc: 'Great podiums for price' },
                  { value: 'premium', label: 'Premium', icon: '⭐', desc: 'Highest priced' },
                ].map((filter) => (
                  <button
                    key={filter.value}
                    className={`quick-filter-chip ${quickFilter === filter.value ? 'active' : ''}`}
                    onClick={() => setQuickFilter(filter.value as QuickFilter)}
                  >
                    <span>{filter.icon} {filter.label}</span>
                    {filter.desc && <span className="filter-desc">{filter.desc}</span>}
                  </button>
                ))}
              </div>
            </div>

            {/* Sort & Basic Filters Row */}
            <div className="filters-row">
              <div className="filter-group">
                <label htmlFor="sort-by">Sort by:</label>
                <select
                  id="sort-by"
                  name="sort-by"
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as SortOption)}
                >
                  <optgroup label="Price">
                    <option value="price-high">💰 Price: High to Low</option>
                    <option value="price-low">💰 Price: Low to High</option>
                  </optgroup>
                  <optgroup label={`${seasonName} Performance`}>
                    <option value="most-wins">🏆 Most Wins</option>
                    <option value="most-podiums">🥇 Most Podiums</option>
                    <option value="most-played">⛳ Most Rounds Played</option>
                    <option value="most-consistent">📊 Most Consistent (%)</option>
                  </optgroup>
                  <optgroup label="Advanced Stats">
                    <option value="win-rate">📈 Best Win Rate</option>
                    <option value="podium-rate">📈 Best Podium Rate</option>
                    <option value="best-value">💎 Best Value (Podiums/$)</option>
                  </optgroup>
                  <optgroup label="Other">
                    <option value="selected-high">👥 Selected: High to Low</option>
                    <option value="selected-low">👥 Selected: Low to High</option>
                    <option value="name">🔤 Name: A-Z</option>
                  </optgroup>
                </select>
              </div>

              {hasActiveFilters && (
                <button className="reset-filters-btn" onClick={resetFilters}>
                  <span>✕</span>
                  <span>Reset</span>
                </button>
              )}
            </div>

            {/* Active Filters Summary */}
            {hasActiveFilters && (
              <div className="active-filters-summary">
                <span className="summary-label">Active filters:</span>
                {searchTerm && <span className="filter-tag">Search: &quot;{searchTerm}&quot;</span>}
                {quickFilter !== 'all' && (
                  <span className="filter-tag">Quick: {quickFilter.replace('-', ' ')}</span>
                )}
              </div>
            )}
          </section>

          {/* golfers Grid */}
          <section className="golfers-section">
            <div className="golfers-section-header">
              <h2>Available golfers ({filteredGolfers.length})</h2>
              <div className="section-header-right">
                {filteredGolfers.length > 0 && (
                  <span className="results-hint">
                    Showing {(currentPage - 1) * GOLFERS_PER_PAGE + 1}-
                    {Math.min(currentPage * GOLFERS_PER_PAGE, filteredGolfers.length)} of{' '}
                    {filteredGolfers.length}
                  </span>
                )}
              </div>
            </div>

            {/* Compact Golfer Grid */}
            <div className="golfers-grid-compact">
              {paginatedGolfers.map((golfer) => {
                const selected = isSelected(golfer);
                const podiums = getPodiums(golfer);

                return (
                  <div
                    key={golfer.id}
                    className={`golfer-card-compact ${selected ? 'selected' : ''}`}
                    onClick={() => setSelectedGolferDetail(golfer)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => e.key === 'Enter' && setSelectedGolferDetail(golfer)}
                  >
                    <div className="compact-photo">
                      {golfer.picture ? (
                        <img
                          src={golfer.picture}
                          alt={`${golfer.firstName} ${golfer.lastName}`}
                          loading="lazy"
                        />
                      ) : (
                        <div className="compact-initials">
                          {golfer.firstName[0]}
                          {golfer.lastName[0]}
                        </div>
                      )}
                      {selected && <div className="compact-selected-badge">✓</div>}
                      {getCombinedStats(golfer).timesFinished1st > 0 && !selected && (
                        <div className="compact-winner-badge">🏆</div>
                      )}
                    </div>
                    <div className="compact-info">
                      <h4 className="compact-name">
                        {golfer.firstName} {golfer.lastName}
                      </h4>
                      <div className="compact-meta">
                        <span className="compact-price">{formatPrice(golfer.price)}</span>
                      </div>
                      <div className="compact-stat">
                        <span className="compact-stat-icon">🏅</span>
                        <span>
                          {podiums} podium{podiums !== 1 ? 's' : ''}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="pagination">
                <button
                  className="pagination-btn pagination-nav"
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                >
                  ← Prev
                </button>

                <div className="pagination-pages">
                  {getPageNumbers().map((page, idx) =>
                    typeof page === 'number' ? (
                      <button
                        key={idx}
                        className={`pagination-btn ${currentPage === page ? 'active' : ''}`}
                        onClick={() => setCurrentPage(page)}
                      >
                        {page}
                      </button>
                    ) : (
                      <span key={idx} className="pagination-ellipsis">
                        {page}
                      </span>
                    )
                  )}
                </div>

                <button
                  className="pagination-btn pagination-nav"
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                >
                  Next →
                </button>
              </div>
            )}

            {filteredGolfers.length === 0 && (
              <div className="no-results">
                <div className="no-results-icon">🔍</div>
                <h3>No golfers found</h3>
                <p>Try adjusting your filters or search term.</p>
                <button className="btn-reset" onClick={resetFilters}>
                  Reset All Filters
                </button>
              </div>
            )}
          </section>
        </div>
      </div>

      {/* Golfer Detail Modal */}
      {selectedGolferDetail && (
        <div className="golfer-detail-overlay" onClick={() => setSelectedGolferDetail(null)}>
          <div className="golfer-detail-modal" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setSelectedGolferDetail(null)}>
              ×
            </button>

            <div className="modal-header">
              <div className="modal-photo">
                {selectedGolferDetail.picture ? (
                  <img
                    src={selectedGolferDetail.picture}
                    alt={`${selectedGolferDetail.firstName} ${selectedGolferDetail.lastName}`}
                    loading="lazy"
                  />
                ) : (
                  <div className="modal-initials">
                    {selectedGolferDetail.firstName[0]}
                    {selectedGolferDetail.lastName[0]}
                  </div>
                )}
              </div>
              <div className="modal-title">
                <h2>
                  {selectedGolferDetail.firstName} {selectedGolferDetail.lastName}
                </h2>
                <div className="modal-meta">
                  <span className="modal-price">{formatPrice(selectedGolferDetail.price)}</span>
                </div>
              </div>
            </div>

            {/* Dynamic Season Stats */}
            {selectedGolferDetail.seasonStats && selectedGolferDetail.seasonStats.length > 0 ? (
              (() => {
                const totals = selectedGolferDetail.seasonStats.reduce(
                  (acc, ss) => ({
                    played: acc.played + ss.timesPlayed,
                    points: acc.points + ss.totalPoints,
                    wins: acc.wins + ss.timesFinished1st,
                    podiums: acc.podiums + ss.timesFinished1st + ss.timesFinished2nd + ss.timesFinished3rd,
                    scored36Plus: acc.scored36Plus + (ss.timesScored36Plus || 0),
                    scored32Plus: acc.scored32Plus + (ss.timesScored32Plus || 0),
                  }),
                  { played: 0, points: 0, wins: 0, podiums: 0, scored36Plus: 0, scored32Plus: 0 }
                );
                return (
                  <>
                    <div className="modal-stats-mobile">
                      <div className="modal-stats">
                        <h3>Career Summary</h3>
                        <div className="modal-stats-grid">
                          <div className="modal-stat-item">
                            <span className="modal-stat-value">{totals.played}</span>
                            <span className="modal-stat-label">Played</span>
                          </div>
                          <div className="modal-stat-item">
                            <span className="modal-stat-value">{totals.points}</span>
                            <span className="modal-stat-label">Points</span>
                          </div>
                          <div className="modal-stat-item gold">
                            <span className="modal-stat-value">{totals.wins}</span>
                            <span className="modal-stat-label">1st</span>
                          </div>
                          <div className="modal-stat-item">
                            <span className="modal-stat-value">{totals.podiums}</span>
                            <span className="modal-stat-label">Podiums</span>
                          </div>
                          <div className="modal-stat-item">
                            <span className="modal-stat-value">{totals.scored36Plus}</span>
                            <span className="modal-stat-label">36+</span>
                          </div>
                          <div className="modal-stat-item">
                            <span className="modal-stat-value">{totals.scored32Plus}</span>
                            <span className="modal-stat-label">32+</span>
                          </div>
                          <div className="modal-stat-item" style={{ gridColumn: '1 / -1' }}>
                            <span className="modal-stat-value">{selectedGolferDetail.selectedPercentage ?? 0}%</span>
                            <span className="modal-stat-label">Selected</span>
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="modal-stats-full">
                      {selectedGolferDetail.seasonStats.map((ss) => {
                        const podiums = ss.timesFinished1st + ss.timesFinished2nd + ss.timesFinished3rd;
                        const winRate =
                          ss.timesPlayed > 0
                            ? ((ss.timesFinished1st / ss.timesPlayed) * 100).toFixed(0)
                            : '0';
                        const podiumRate =
                          ss.timesPlayed > 0 ? ((podiums / ss.timesPlayed) * 100).toFixed(0) : '0';

                        return (
                          <div
                            key={ss.seasonName}
                            className="modal-stats"
                            style={
                              ss.isActive
                                ? {
                                    border: '2px solid var(--primary-green)',
                                    borderRadius: '12px',
                                    padding: '1rem',
                                    marginBottom: '1rem',
                                    background: 'rgba(22, 163, 74, 0.03)',
                                  }
                                : {
                                    border: '1px solid #e5e7eb',
                                    borderRadius: '12px',
                                    padding: '1rem',
                                    marginBottom: '1rem',
                                  }
                            }
                          >
                            <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                              {ss.seasonName} Season
                              {ss.isActive && (
                                <span
                                  style={{
                                    background: 'rgba(22, 163, 74, 0.1)',
                                    color: '#16a34a',
                                    padding: '0.15rem 0.5rem',
                                    borderRadius: '12px',
                                    fontSize: '0.7rem',
                                    fontWeight: 500,
                                  }}
                                >
                                  Active
                                </span>
                              )}
                            </h3>
                            <div className="modal-stats-grid">
                              <div className="modal-stat-item">
                                <div className="stat-value">{ss.timesPlayed}</div>
                                <div className="stat-label">Played</div>
                              </div>
                              <div className="modal-stat-item">
                                <div className="stat-value">{ss.totalPoints}</div>
                                <div className="stat-label">Points</div>
                              </div>
                              <div className="modal-stat-item">
                                <div className="stat-value gold">{ss.timesFinished1st}</div>
                                <div className="stat-label">🥇 1st</div>
                              </div>
                              <div className="modal-stat-item">
                                <div className="stat-value silver">{ss.timesFinished2nd}</div>
                                <div className="stat-label">🥈 2nd</div>
                              </div>
                              <div className="modal-stat-item">
                                <div className="stat-value bronze">{ss.timesFinished3rd}</div>
                                <div className="stat-label">🥉 3rd</div>
                              </div>
                              <div className="modal-stat-item">
                                <div className="stat-value">{ss.timesBonusScored}</div>
                                <div className="stat-label">⭐ Bonus</div>
                              </div>
                            </div>
                            <div
                              style={{
                                display: 'flex',
                                gap: '1rem',
                                marginTop: '0.75rem',
                                fontSize: '0.85rem',
                                color: '#6b7280',
                              }}
                            >
                              <span>Win: {winRate}%</span>
                              <span>Podium: {podiumRate}%</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </>
                );
              })()
            ) : (
              <div className="modal-stats">
                <p style={{ color: '#6b7280' }}>No season data available.</p>
              </div>
            )}

            <div className="modal-action">
              {(() => {
                const selected = isSelected(selectedGolferDetail);
                const teamFull = selectedGolfers.length >= TEAM_SIZE;

                if (!canEditTeam) {
                  return (
                    <button className="modal-btn disabled" disabled>
                      🔒 {hasExistingTeam ? 'Transfers Locked' : 'Team Creation Disabled'}
                    </button>
                  );
                }

                if (selected) {
                  return (
                    <button
                      className="modal-btn remove"
                      onClick={() => {
                        handleToggleGolfer(selectedGolferDetail);
                        setSelectedGolferDetail(null);
                      }}
                    >
                      ✕ Remove from Team
                    </button>
                  );
                }

                if (teamFull) {
                  return (
                    <button className="modal-btn disabled" disabled>
                      👥 Team Full (6/6 golfers)
                    </button>
                  );
                }

                return (
                  <button
                    className="modal-btn add"
                    onClick={() => {
                      handleToggleGolfer(selectedGolferDetail);
                      setSelectedGolferDetail(null);
                    }}
                  >
                    ✓ Add to Team
                  </button>
                );
              })()}
            </div>
          </div>
        </div>
      )}
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}
    </PageLayout>
  );
};

export default TeamBuilderPage;
