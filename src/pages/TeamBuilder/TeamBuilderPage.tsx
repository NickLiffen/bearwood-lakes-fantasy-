// Team Builder Page - Pick your fantasy golf team

import React, { useEffect, useState, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import PageLayout from '../../components/layout/PageLayout';
import { useApiClient } from '../../hooks/useApiClient';
import './TeamBuilderPage.css';

interface GolferStats {
  timesScored36Plus: number;
  timesFinished1st: number;
  timesFinished2nd: number;
  timesFinished3rd: number;
  timesPlayed: number;
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
  stats2026?: GolferStats;
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
  | 'podium-rate';

// Quick filter presets
type QuickFilter = 
  | 'all' 
  | 'winners' 
  | 'podium-finishers' 
  | 'consistent' 
  | 'experienced' 
  | 'value-picks' 
  | 'premium';

const TeamBuilderPage: React.FC = () => {
  const navigate = useNavigate();
  const [golfers, setGolfers] = useState<Golfer[]>([]);
  const [selectedGolfers, setSelectedGolfers] = useState<Golfer[]>([]);
  const [hasExistingTeam, setHasExistingTeam] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [membershipFilter, setMembershipFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<SortOption>('price-high');
  const [quickFilter, setQuickFilter] = useState<QuickFilter>('all');
  const [minRoundsPlayed, setMinRoundsPlayed] = useState<number>(0);
  const [showAffordableOnly, setShowAffordableOnly] = useState(false);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [showCelebration, setShowCelebration] = useState(false);
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedGolferDetail, setSelectedGolferDetail] = useState<Golfer | null>(null);
  const previousPlayerCount = useRef<number | null>(null);
  const { get, post, isAuthReady } = useApiClient();

  useEffect(() => {
    if (isAuthReady) {
      fetchData();
    }
  }, [isAuthReady]);

  // Show celebration only when team becomes complete (going from <6 to 6 golfers)
  useEffect(() => {
    const currentCount = selectedGolfers.length;
    const prevCount = previousPlayerCount.current;
    
    // Only celebrate if we're going from less than 6 to exactly 6
    if (prevCount !== null && prevCount < TEAM_SIZE && currentCount === TEAM_SIZE) {
      setShowCelebration(true);
      setTimeout(() => setShowCelebration(false), 4000);
    }
    
    // Update the ref with current count
    previousPlayerCount.current = currentCount;
  }, [selectedGolfers.length]);

  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null); // Clear previous errors

      // Fetch golfers, user's picks, and settings in parallel
      const [playersRes, picksRes, settingsRes] = await Promise.all([
        get<Golfer[]>('golfers-list'),
        get<{ golfers: Golfer[] }>('picks-get'),
        get<Settings>('settings'),
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
        setHasExistingTeam(true); // User has an existing team
      }

      if (settingsRes.success && settingsRes.data) {
        setSettings(settingsRes.data);
      }
    } catch {
      setError('Failed to load data. Please refresh the page.');
    } finally {
      setLoading(false);
    }
  };

  const budgetUsed = selectedGolfers.reduce((sum, p) => sum + p.price, 0);
  const budgetRemaining = TOTAL_BUDGET - budgetUsed;
  const budgetPercentage = (budgetUsed / TOTAL_BUDGET) * 100;

  const formatPrice = (price: number) => {
    return `$${(price / 1000000).toFixed(1)}M`;
  };

  const canAfford = (golfer: Golfer) => {
    return golfer.price <= budgetRemaining;
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
    if (!canAfford(golfer)) return;
    if (selectedGolfers.length >= TEAM_SIZE) return;

    setSelectedGolfers([...selectedGolfers, golfer]);
    setSuccessMessage(`${golfer.firstName} ${golfer.lastName} added to your team!`);
    setTimeout(() => setSuccessMessage(null), 2000);
  };

  const handleRemoveGolfer = (golfer: Golfer) => {
    if (!canEditTeam) return;
    setSelectedGolfers(selectedGolfers.filter((g) => g.id !== golfer.id));
  };

  const handleSaveTeam = async () => {
    if (!canEditTeam) return;

    // Validate team is complete
    if (selectedGolfers.length < TEAM_SIZE) {
      setError(`You must select ${TEAM_SIZE} golfers to save your team. Currently selected: ${selectedGolfers.length}`);
      return;
    }

    try {
      setSaving(true);
      setError(null);

      const response = await post('picks-save', {
        golferIds: selectedGolfers.map((p) => p.id),
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

  // Helper functions for calculated stats
  const getPodiums = (golfer: Golfer) => {
    const stats = golfer.stats2025;
    if (!stats) return 0;
    return stats.timesFinished1st + stats.timesFinished2nd + stats.timesFinished3rd;
  };

  const getWinRate = (golfer: Golfer) => {
    const stats = golfer.stats2025;
    if (!stats || stats.timesPlayed === 0) return 0;
    return (stats.timesFinished1st / stats.timesPlayed) * 100;
  };

  const getPodiumRate = (golfer: Golfer) => {
    const stats = golfer.stats2025;
    if (!stats || stats.timesPlayed === 0) return 0;
    return (getPodiums(golfer) / stats.timesPlayed) * 100;
  };

  const getConsistencyRate = (golfer: Golfer) => {
    const stats = golfer.stats2025;
    if (!stats || stats.timesPlayed === 0) return 0;
    return (stats.timesScored36Plus / stats.timesPlayed) * 100;
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
    const stats = golfer.stats2025;
    switch (quickFilter) {
      case 'winners':
        return stats?.timesFinished1st > 0;
      case 'podium-finishers':
        return getPodiums(golfer) > 0;
      case 'consistent':
        return stats?.timesScored36Plus >= 3;
      case 'experienced':
        return stats?.timesPlayed >= 5;
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
    setMembershipFilter('all');
    setQuickFilter('all');
    setMinRoundsPlayed(0);
    setShowAffordableOnly(false);
    setSortBy('price-high');
  };

  // Check if any filters are active
  const hasActiveFilters = searchTerm !== '' || 
    membershipFilter !== 'all' || 
    quickFilter !== 'all' || 
    minRoundsPlayed > 0 || 
    showAffordableOnly;

  // Filter and sort golfers
  const filteredGolfers = golfers
    .filter((golfer) => {
      const fullName = `${golfer.firstName} ${golfer.lastName}`.toLowerCase();
      const matchesSearch = fullName.includes(searchTerm.toLowerCase());
      const matchesMembership = membershipFilter === 'all' || golfer.membershipType === membershipFilter;
      const matchesQuickFilter = applyQuickFilter(golfer);
      const matchesMinRounds = !golfer.stats2025 || golfer.stats2025.timesPlayed >= minRoundsPlayed;
      const matchesAffordable = !showAffordableOnly || canAfford(golfer);
      return matchesSearch && matchesMembership && matchesQuickFilter && matchesMinRounds && matchesAffordable;
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
          return (b.stats2025?.timesFinished1st || 0) - (a.stats2025?.timesFinished1st || 0);
        case 'most-podiums':
          return getPodiums(b) - getPodiums(a);
        case 'most-played':
          return (b.stats2025?.timesPlayed || 0) - (a.stats2025?.timesPlayed || 0);
        case 'most-consistent':
          return (b.stats2025?.timesScored36Plus || 0) - (a.stats2025?.timesScored36Plus || 0);
        case 'best-value':
          return getValueScore(b) - getValueScore(a);
        case 'win-rate':
          return getWinRate(b) - getWinRate(a);
        case 'podium-rate':
          return getPodiumRate(b) - getPodiumRate(a);
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
  }, [searchTerm, membershipFilter, quickFilter, minRoundsPlayed, showAffordableOnly, sortBy]);

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

  const getMembershipLabel = (type: string) => {
    switch (type) {
      case 'men':
        return 'Men';
      case 'junior':
        return 'Junior';
      case 'female':
        return 'Female';
      case 'senior':
        return 'Senior';
      default:
        return type;
    }
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
        {/* Celebration Overlay */}
        {showCelebration && (
          <div className="celebration-overlay">
            <div className="celebration-content">
              <div className="celebration-icon">🎉</div>
              <h2>Team Complete!</h2>
              <p>You've selected all 6 golfers. Don't forget to save your team!</p>
            </div>
            <div className="confetti">
              {[...Array(50)].map((_, i) => (
                <div key={i} className="confetti-piece" style={{
                  left: `${Math.random() * 100}%`,
                  animationDelay: `${Math.random() * 2}s`,
                  backgroundColor: ['#1a472a', '#c9a227', '#2d5a3d', '#f4e4ba', '#4a7c59'][Math.floor(Math.random() * 5)]
                }} />
              ))}
            </div>
          </div>
        )}

        <div className="team-builder-container">
          {/* Page Header */}
          <div className="users-page-header">
              <h1> 👥 {hasExistingTeam ? 'Edit Your Team' : 'Build Your Team'}</h1>
            <p className="users-page-subtitle">Select 6 golfers within your $50M budget</p>
          </div>
            {!canEditTeam && (
              <div className="transfer-locked-banner">
                <span className="lock-icon">🔒</span>
                <span>{hasExistingTeam ? 'Transfer window is closed' : 'New team creation is disabled'}</span>
              </div>
            )}

          {/* Alerts */}
          {error && (
            <div className="alert alert-error">
              <span>⚠️</span> {error}
              <button onClick={() => setError(null)} className="alert-close">×</button>
            </div>
          )}
          {successMessage && (
            <div className="alert alert-success">
              <span>✓</span> {successMessage}
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
                <span className="team-count">{selectedGolfers.length} / {TEAM_SIZE} golfers</span>
              </div>
              <div className="team-slots">
                {[...Array(TEAM_SIZE)].map((_, index) => {
                  const golfer = selectedGolfers[index];
                  return (
                    <div 
                      key={index} 
                      className={`team-slot ${golfer ? 'filled' : 'empty'}`}
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
                              onClick={() => handleRemoveGolfer(golfer)}
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
                  className={`btn btn-save-team ${selectedGolfers.length === TEAM_SIZE ? '' : 'btn-incomplete'}`}
                  onClick={handleSaveTeam}
                  disabled={saving || selectedGolfers.length !== TEAM_SIZE}
                >
                  {saving 
                    ? 'Saving...' 
                    : selectedGolfers.length === TEAM_SIZE 
                      ? 'Save Team' 
                      : `Select ${TEAM_SIZE - selectedGolfers.length} more golfer${TEAM_SIZE - selectedGolfers.length !== 1 ? 's' : ''}`
                  }
                </button>
              )}
            </div>
          </section>

          {/* Filters */}
          <section className="filters-section">
            {/* Search */}
            <div className="search-box">
              <span className="search-icon">🔍</span>
              <input
                type="text"
                placeholder="Search golfers..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
              {searchTerm && (
                <button className="search-clear" onClick={() => setSearchTerm('')}>×</button>
              )}
            </div>

            {/* Quick Filters */}
            <div className="quick-filters">
              <span className="quick-filters-label">Quick Filters:</span>
              <div className="quick-filter-chips">
                {[
                  { value: 'all', label: 'All golfers', icon: '👥' },
                  { value: 'winners', label: 'Winners', icon: '🏆' },
                  { value: 'podium-finishers', label: 'Podium Finishers', icon: '🥇' },
                  { value: 'consistent', label: 'Consistent', icon: '📈' },
                  { value: 'experienced', label: 'Experienced', icon: '⛳' },
                  { value: 'value-picks', label: 'Value Picks', icon: '💎' },
                  { value: 'premium', label: 'Premium', icon: '⭐' },
                ].map(filter => (
                  <button
                    key={filter.value}
                    className={`quick-filter-chip ${quickFilter === filter.value ? 'active' : ''}`}
                    onClick={() => setQuickFilter(filter.value as QuickFilter)}
                  >
                    <span>{filter.icon}</span>
                    <span>{filter.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Sort & Basic Filters Row */}
            <div className="filters-row">
              <div className="filter-group">
                <label>Sort by:</label>
                <select 
                  value={sortBy} 
                  onChange={(e) => setSortBy(e.target.value as SortOption)}
                >
                  <optgroup label="Price">
                    <option value="price-high">💰 Price: High to Low</option>
                    <option value="price-low">💰 Price: Low to High</option>
                  </optgroup>
                  <optgroup label="2025 Performance">
                    <option value="most-wins">🏆 Most Wins</option>
                    <option value="most-podiums">🥇 Most Podiums</option>
                    <option value="most-played">⛳ Most Rounds Played</option>
                    <option value="most-consistent">📊 Most 36+ Rounds</option>
                  </optgroup>
                  <optgroup label="Advanced Stats">
                    <option value="win-rate">📈 Best Win Rate</option>
                    <option value="podium-rate">📈 Best Podium Rate</option>
                    <option value="best-value">💎 Best Value (Podiums/$)</option>
                  </optgroup>
                  <optgroup label="Other">
                    <option value="name">🔤 Name: A-Z</option>
                  </optgroup>
                </select>
              </div>

              <div className="filter-group">
                <label>Category:</label>
                <select 
                  value={membershipFilter} 
                  onChange={(e) => setMembershipFilter(e.target.value)}
                >
                  <option value="all">All Members</option>
                  <option value="men">Men</option>
                  <option value="junior">Junior</option>
                  <option value="female">Female</option>
                  <option value="senior">Senior</option>
                </select>
              </div>

              <button 
                className={`filter-toggle-btn ${showAdvancedFilters ? 'active' : ''}`}
                onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
              >
                <span>⚙️</span>
                <span>Advanced</span>
              </button>

              {hasActiveFilters && (
                <button className="reset-filters-btn" onClick={resetFilters}>
                  <span>✕</span>
                  <span>Reset</span>
                </button>
              )}
            </div>

            {/* Advanced Filters Panel */}
            {showAdvancedFilters && (
              <div className="advanced-filters">
                <div className="advanced-filter-item">
                  <label>Min. Rounds Played (2025):</label>
                  <div className="range-input-group">
                    <input
                      type="range"
                      min="0"
                      max="10"
                      value={minRoundsPlayed}
                      onChange={(e) => setMinRoundsPlayed(Number(e.target.value))}
                    />
                    <span className="range-value">{minRoundsPlayed}+</span>
                  </div>
                </div>

                <div className="advanced-filter-item">
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={showAffordableOnly}
                      onChange={(e) => setShowAffordableOnly(e.target.checked)}
                    />
                    <span>Show only golfers I can afford</span>
                  </label>
                </div>
              </div>
            )}

            {/* Active Filters Summary */}
            {hasActiveFilters && (
              <div className="active-filters-summary">
                <span className="summary-label">Active filters:</span>
                {searchTerm && <span className="filter-tag">Search: "{searchTerm}"</span>}
                {membershipFilter !== 'all' && <span className="filter-tag">Category: {membershipFilter}</span>}
                {quickFilter !== 'all' && <span className="filter-tag">Quick: {quickFilter.replace('-', ' ')}</span>}
                {minRoundsPlayed > 0 && <span className="filter-tag">Min rounds: {minRoundsPlayed}+</span>}
                {showAffordableOnly && <span className="filter-tag">Affordable only</span>}
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
                    Showing {((currentPage - 1) * GOLFERS_PER_PAGE) + 1}-{Math.min(currentPage * GOLFERS_PER_PAGE, filteredGolfers.length)} of {filteredGolfers.length}
                  </span>
                )}
              </div>
            </div>
            
            {/* Compact Golfer Grid */}
            <div className="golfers-grid-compact">
              {paginatedGolfers.map((golfer) => {
                const selected = isSelected(golfer);
                const affordable = canAfford(golfer);
                const podiums = getPodiums(golfer);

                return (
                  <div 
                    key={golfer.id}
                    className={`golfer-card-compact ${selected ? 'selected' : ''} ${!affordable && !selected ? 'unaffordable' : ''}`}
                    onClick={() => setSelectedGolferDetail(golfer)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => e.key === 'Enter' && setSelectedGolferDetail(golfer)}
                  >
                    <div className="compact-photo">
                      {golfer.picture ? (
                        <img src={golfer.picture} alt={`${golfer.firstName} ${golfer.lastName}`} />
                      ) : (
                        <div className="compact-initials">
                          {golfer.firstName[0]}{golfer.lastName[0]}
                        </div>
                      )}
                      {selected && <div className="compact-selected-badge">✓</div>}
                      {golfer.stats2025?.timesFinished1st > 0 && !selected && (
                        <div className="compact-winner-badge">🏆</div>
                      )}
                    </div>
                    <div className="compact-info">
                      <h4 className="compact-name">{golfer.firstName} {golfer.lastName}</h4>
                      <div className="compact-meta">
                        <span className={`compact-membership ${golfer.membershipType}`}>
                          {getMembershipLabel(golfer.membershipType)}
                        </span>
                        <span className="compact-price">{formatPrice(golfer.price)}</span>
                      </div>
                      <div className="compact-stat">
                        <span className="compact-stat-icon">🏅</span>
                        <span>{podiums} podium{podiums !== 1 ? 's' : ''}</span>
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
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                >
                  ← Prev
                </button>
                
                <div className="pagination-pages">
                  {getPageNumbers().map((page, idx) => (
                    typeof page === 'number' ? (
                      <button
                        key={idx}
                        className={`pagination-btn ${currentPage === page ? 'active' : ''}`}
                        onClick={() => setCurrentPage(page)}
                      >
                        {page}
                      </button>
                    ) : (
                      <span key={idx} className="pagination-ellipsis">{page}</span>
                    )
                  ))}
                </div>

                <button 
                  className="pagination-btn pagination-nav"
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
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
                <button className="btn-reset" onClick={resetFilters}>Reset All Filters</button>
              </div>
            )}
          </section>
        </div>
      </div>

      {/* Golfer Detail Modal */}
      {selectedGolferDetail && (
        <div className="golfer-detail-overlay" onClick={() => setSelectedGolferDetail(null)}>
          <div className="golfer-detail-modal" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setSelectedGolferDetail(null)}>×</button>
            
            <div className="modal-header">
              <div className="modal-photo">
                {selectedGolferDetail.picture ? (
                  <img src={selectedGolferDetail.picture} alt={`${selectedGolferDetail.firstName} ${selectedGolferDetail.lastName}`} />
                ) : (
                  <div className="modal-initials">
                    {selectedGolferDetail.firstName[0]}{selectedGolferDetail.lastName[0]}
                  </div>
                )}
              </div>
              <div className="modal-title">
                <h2>{selectedGolferDetail.firstName} {selectedGolferDetail.lastName}</h2>
                <div className="modal-meta">
                  <span className={`membership-badge ${selectedGolferDetail.membershipType}`}>
                    {getMembershipLabel(selectedGolferDetail.membershipType)}
                  </span>
                  <span className="modal-price">{formatPrice(selectedGolferDetail.price)}</span>
                </div>
              </div>
            </div>

            <div className="modal-stats">
              <h3>2025 Season Stats</h3>
              <div className="modal-stats-grid">
                <div className="modal-stat-item">
                  <span className="modal-stat-value">{selectedGolferDetail.stats2025?.timesPlayed || 0}</span>
                  <span className="modal-stat-label">Rounds Played</span>
                </div>
                <div className="modal-stat-item gold">
                  <span className="modal-stat-value">{selectedGolferDetail.stats2025?.timesFinished1st || 0}</span>
                  <span className="modal-stat-label">🥇 1st Place</span>
                </div>
                <div className="modal-stat-item silver">
                  <span className="modal-stat-value">{selectedGolferDetail.stats2025?.timesFinished2nd || 0}</span>
                  <span className="modal-stat-label">🥈 2nd Place</span>
                </div>
                <div className="modal-stat-item bronze">
                  <span className="modal-stat-value">{selectedGolferDetail.stats2025?.timesFinished3rd || 0}</span>
                  <span className="modal-stat-label">🥉 3rd Place</span>
                </div>
                <div className="modal-stat-item">
                  <span className="modal-stat-value">{getPodiums(selectedGolferDetail)}</span>
                  <span className="modal-stat-label">Total Podiums</span>
                </div>
                <div className="modal-stat-item">
                  <span className="modal-stat-value">{selectedGolferDetail.stats2025?.timesScored36Plus || 0}</span>
                  <span className="modal-stat-label">36+ Rounds</span>
                </div>
              </div>

              {selectedGolferDetail.stats2025 && selectedGolferDetail.stats2025.timesPlayed > 0 && (
                <div className="modal-rates">
                  <span className="rate-badge win">{getWinRate(selectedGolferDetail).toFixed(1)}% Win Rate</span>
                  <span className="rate-badge podium">{getPodiumRate(selectedGolferDetail).toFixed(1)}% Podium Rate</span>
                  <span className="rate-badge consistency">{getConsistencyRate(selectedGolferDetail).toFixed(1)}% Consistency</span>
                </div>
              )}

              {selectedGolferDetail.stats2026 && (
                <>
                  <h3>2026 Season Stats</h3>
                  <div className="modal-stats-grid">
                    <div className="modal-stat-item">
                      <span className="modal-stat-value">{selectedGolferDetail.stats2026.timesPlayed}</span>
                      <span className="modal-stat-label">Rounds Played</span>
                    </div>
                    <div className="modal-stat-item gold">
                      <span className="modal-stat-value">{selectedGolferDetail.stats2026.timesFinished1st}</span>
                      <span className="modal-stat-label">🥇 1st Place</span>
                    </div>
                    <div className="modal-stat-item silver">
                      <span className="modal-stat-value">{selectedGolferDetail.stats2026.timesFinished2nd}</span>
                      <span className="modal-stat-label">🥈 2nd Place</span>
                    </div>
                    <div className="modal-stat-item bronze">
                      <span className="modal-stat-value">{selectedGolferDetail.stats2026.timesFinished3rd}</span>
                      <span className="modal-stat-label">🥉 3rd Place</span>
                    </div>
                  </div>
                </>
              )}
            </div>

            <div className="modal-action">
              {(() => {
                const selected = isSelected(selectedGolferDetail);
                const affordable = canAfford(selectedGolferDetail);
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

                if (!affordable) {
                  return (
                    <button className="modal-btn disabled" disabled>
                      💰 Can't Afford ({formatPrice(selectedGolferDetail.price - budgetRemaining)} over budget)
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
    </PageLayout>
  );
};

export default TeamBuilderPage;
