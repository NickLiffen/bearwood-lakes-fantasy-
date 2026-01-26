// Team Builder Page - Pick your fantasy golf team

import React, { useEffect, useState, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import './TeamBuilderPage.css';

interface User {
  id: string;
  firstName: string;
  lastName: string;
  username: string;
  role: string;
}

interface Player {
  id: string;
  firstName: string;
  lastName: string;
  picture: string;
  price: number;
  membershipType: 'men' | 'junior' | 'female' | 'senior';
  isActive: boolean;
  stats2025: {
    timesScored36Plus: number;
    timesFinished1st: number;
    timesFinished2nd: number;
    timesFinished3rd: number;
    timesPlayed: number;
  };
}

interface Settings {
  transfersOpen: boolean;
  registrationOpen: boolean;
  currentSeason: number;
  allowNewTeamCreation: boolean;
}

const TOTAL_BUDGET = 50000000; // $50M
const TEAM_SIZE = 6;

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
  const [user, setUser] = useState<User | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [selectedPlayers, setSelectedPlayers] = useState<Player[]>([]);
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
  const previousPlayerCount = useRef<number | null>(null);

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
      fetchData();
    }
  }, [user]);

  // Show celebration only when team becomes complete (going from <6 to 6 players)
  useEffect(() => {
    const currentCount = selectedPlayers.length;
    const prevCount = previousPlayerCount.current;
    
    // Only celebrate if we're going from less than 6 to exactly 6
    if (prevCount !== null && prevCount < TEAM_SIZE && currentCount === TEAM_SIZE) {
      setShowCelebration(true);
      setTimeout(() => setShowCelebration(false), 4000);
    }
    
    // Update the ref with current count
    previousPlayerCount.current = currentCount;
  }, [selectedPlayers.length]);

  const fetchData = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');

      // Fetch players, user's picks, and settings in parallel
      const [playersRes, picksRes, settingsRes] = await Promise.all([
        fetch('/.netlify/functions/players-list', {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch('/.netlify/functions/picks-get', {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch('/.netlify/functions/settings', {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ]);

      if (playersRes.ok) {
        const playersData = await playersRes.json();
        if (playersData.success) {
          setPlayers(playersData.data.filter((p: Player) => p.isActive));
        }
      }

      if (picksRes.ok) {
        const picksData = await picksRes.json();
        if (picksData.success && picksData.data?.players) {
          setSelectedPlayers(picksData.data.players);
          setHasExistingTeam(true); // User has an existing team
        }
      }

      if (settingsRes.ok) {
        const settingsData = await settingsRes.json();
        if (settingsData.success) {
          setSettings(settingsData.data);
        }
      }
    } catch {
      setError('Failed to load data. Please refresh the page.');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    navigate('/login');
  };

  const budgetUsed = selectedPlayers.reduce((sum, p) => sum + p.price, 0);
  const budgetRemaining = TOTAL_BUDGET - budgetUsed;
  const budgetPercentage = (budgetUsed / TOTAL_BUDGET) * 100;

  const formatPrice = (price: number) => {
    return `$${(price / 1000000).toFixed(1)}M`;
  };

  const canAfford = (player: Player) => {
    return player.price <= budgetRemaining;
  };

  const isSelected = (player: Player) => {
    return selectedPlayers.some((p) => p.id === player.id);
  };

  // Determine if the user can edit their team
  // - If they have an existing team, check transfersOpen
  // - If they don't have a team, check allowNewTeamCreation
  const canEditTeam = hasExistingTeam 
    ? (settings?.transfersOpen ?? true)
    : (settings?.allowNewTeamCreation ?? true);

  const handleTogglePlayer = (player: Player) => {
    if (!canEditTeam) return;
    
    // If already selected, remove them
    if (isSelected(player)) {
      setSelectedPlayers(selectedPlayers.filter((p) => p.id !== player.id));
      return;
    }
    
    // Otherwise, try to add them
    if (!canAfford(player)) return;
    if (selectedPlayers.length >= TEAM_SIZE) return;

    setSelectedPlayers([...selectedPlayers, player]);
    setSuccessMessage(`${player.firstName} ${player.lastName} added to your team!`);
    setTimeout(() => setSuccessMessage(null), 2000);
  };

  const handleRemovePlayer = (player: Player) => {
    if (!canEditTeam) return;
    setSelectedPlayers(selectedPlayers.filter((p) => p.id !== player.id));
  };

  const handleSaveTeam = async () => {
    if (!canEditTeam) return;

    // Validate team is complete
    if (selectedPlayers.length < TEAM_SIZE) {
      setError(`You must select ${TEAM_SIZE} players to save your team. Currently selected: ${selectedPlayers.length}`);
      return;
    }

    try {
      setSaving(true);
      setError(null);
      const token = localStorage.getItem('token');

      const response = await fetch('/.netlify/functions/picks-save', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          playerIds: selectedPlayers.map((p) => p.id),
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to save team');
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
  const getPodiums = (player: Player) => {
    const stats = player.stats2025;
    if (!stats) return 0;
    return stats.timesFinished1st + stats.timesFinished2nd + stats.timesFinished3rd;
  };

  const getWinRate = (player: Player) => {
    const stats = player.stats2025;
    if (!stats || stats.timesPlayed === 0) return 0;
    return (stats.timesFinished1st / stats.timesPlayed) * 100;
  };

  const getPodiumRate = (player: Player) => {
    const stats = player.stats2025;
    if (!stats || stats.timesPlayed === 0) return 0;
    return (getPodiums(player) / stats.timesPlayed) * 100;
  };

  const getConsistencyRate = (player: Player) => {
    const stats = player.stats2025;
    if (!stats || stats.timesPlayed === 0) return 0;
    return (stats.timesScored36Plus / stats.timesPlayed) * 100;
  };

  const getValueScore = (player: Player) => {
    // Podiums per million dollars spent
    const podiums = getPodiums(player);
    const priceInMillions = player.price / 1000000;
    if (priceInMillions === 0) return 0;
    return podiums / priceInMillions;
  };

  // Quick filter logic
  const applyQuickFilter = (player: Player): boolean => {
    const stats = player.stats2025;
    switch (quickFilter) {
      case 'winners':
        return stats?.timesFinished1st > 0;
      case 'podium-finishers':
        return getPodiums(player) > 0;
      case 'consistent':
        return stats?.timesScored36Plus >= 3;
      case 'experienced':
        return stats?.timesPlayed >= 5;
      case 'value-picks':
        return player.price <= 8000000; // $8M or less
      case 'premium':
        return player.price >= 10000000; // $10M or more
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

  // Filter and sort players
  const filteredPlayers = players
    .filter((player) => {
      const fullName = `${player.firstName} ${player.lastName}`.toLowerCase();
      const matchesSearch = fullName.includes(searchTerm.toLowerCase());
      const matchesMembership = membershipFilter === 'all' || player.membershipType === membershipFilter;
      const matchesQuickFilter = applyQuickFilter(player);
      const matchesMinRounds = !player.stats2025 || player.stats2025.timesPlayed >= minRoundsPlayed;
      const matchesAffordable = !showAffordableOnly || canAfford(player);
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

  if (!user) {
    return null;
  }

  if (loading) {
    return (
      <div className="team-builder-page">
        <header className="dashboard-header">
          <div className="header-container">
            <Link to="/dashboard" className="header-brand">
              <img src="/bearwood_lakes_logo.png" alt="Bearwood Lakes" className="brand-logo" />
              <span className="brand-text">Bearwood Lakes Fantasy</span>
            </Link>
          </div>
        </header>
        <main className="team-builder-main">
          <div className="team-builder-container">
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
    <div className="team-builder-page">
      {/* Celebration Overlay */}
      {showCelebration && (
        <div className="celebration-overlay">
          <div className="celebration-content">
            <div className="celebration-icon">🎉</div>
            <h2>Team Complete!</h2>
            <p>You've selected all 6 players. Don't forget to save your team!</p>
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

      {/* Header */}
      <header className="dashboard-header">
        <div className="header-container">
          <Link to="/dashboard" className="header-brand">
            <img src="/bearwood_lakes_logo.png" alt="Bearwood Lakes" className="brand-logo" />
            <span className="brand-text">Bearwood Lakes Fantasy</span>
          </Link>

          <nav className="header-nav">
            <Link to="/dashboard" className="nav-link">
              Dashboard
            </Link>
            <Link to="/my-team" className="nav-link active">
              My Team
            </Link>
            <Link to="/players" className="nav-link">
              Players
            </Link>
            <Link to="/leaderboard" className="nav-link">
              Leaderboard
            </Link>
            <Link to="/tournaments" className="nav-link">
              Tournaments
            </Link>
            <Link to="/profile" className="nav-link">
              Profile
            </Link>
            {user.role === 'admin' && (
              <Link to="/admin" className="nav-link nav-admin">
                Admin
              </Link>
            )}
          </nav>

          <div className="header-user">
            <span className="user-greeting">
              Hi, <strong>{user.firstName}</strong>
            </span>
            <button onClick={handleLogout} className="btn-logout">
              Logout
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="team-builder-main">
        <div className="team-builder-container">
          {/* Page Header */}
          <section className="page-header">
            <div className="page-title">
              <h1>{hasExistingTeam ? 'Edit Your Team' : 'Build Your Team'}</h1>
              <p>Select 6 golfers within your $50M budget</p>
            </div>
            {!canEditTeam && (
              <div className="transfer-locked-banner">
                <span className="lock-icon">🔒</span>
                <span>{hasExistingTeam ? 'Transfer window is closed' : 'New team creation is disabled'}</span>
              </div>
            )}
          </section>

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
                <span className="team-count">{selectedPlayers.length} / {TEAM_SIZE} players</span>
              </div>
              <div className="team-slots">
                {[...Array(TEAM_SIZE)].map((_, index) => {
                  const player = selectedPlayers[index];
                  return (
                    <div 
                      key={index} 
                      className={`team-slot ${player ? 'filled' : 'empty'}`}
                    >
                      {player ? (
                        <>
                          <div className="slot-player">
                            <span className="slot-name">{player.lastName}</span>
                            <span className="slot-price">{formatPrice(player.price)}</span>
                          </div>
                          {canEditTeam && (
                            <button 
                              className="slot-remove"
                              onClick={() => handleRemovePlayer(player)}
                              title="Remove player"
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
                  className={`btn btn-save-team ${selectedPlayers.length === TEAM_SIZE ? '' : 'btn-incomplete'}`}
                  onClick={handleSaveTeam}
                  disabled={saving || selectedPlayers.length !== TEAM_SIZE}
                >
                  {saving 
                    ? 'Saving...' 
                    : selectedPlayers.length === TEAM_SIZE 
                      ? 'Save Team' 
                      : `Select ${TEAM_SIZE - selectedPlayers.length} more player${TEAM_SIZE - selectedPlayers.length !== 1 ? 's' : ''}`
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
                placeholder="Search players..."
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
                  { value: 'all', label: 'All Players', icon: '👥' },
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
                    <span>Show only players I can afford</span>
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

          {/* Players Grid */}
          <section className="players-section">
            <div className="players-section-header">
              <h2>Available Players ({filteredPlayers.length})</h2>
              {filteredPlayers.length > 0 && (
                <span className="results-hint">
                  Sorted by: {sortBy.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                </span>
              )}
            </div>
            <div className="players-grid">
              {filteredPlayers.map((player) => {
                const selected = isSelected(player);
                const affordable = canAfford(player);
                // Card is only truly disabled if unaffordable AND not selected, or team editing not allowed
                const cannotSelect = !selected && (!affordable || selectedPlayers.length >= TEAM_SIZE);
                const isClickable = canEditTeam && (selected || (!cannotSelect));
                const podiums = getPodiums(player);
                const winRate = getWinRate(player);
                const podiumRate = getPodiumRate(player);
                const consistencyRate = getConsistencyRate(player);

                return (
                  <div 
                    key={player.id}
                    className={`player-card ${selected ? 'selected' : ''} ${!affordable && !selected ? 'unaffordable' : ''} ${!isClickable ? 'disabled' : 'clickable'}`}
                    onClick={() => isClickable && handleTogglePlayer(player)}
                    role="button"
                    tabIndex={isClickable ? 0 : -1}
                    onKeyDown={(e) => e.key === 'Enter' && isClickable && handleTogglePlayer(player)}
                  >
                    <div className="player-photo">
                      {player.picture ? (
                        <img src={player.picture} alt={`${player.firstName} ${player.lastName}`} />
                      ) : (
                        <div className="player-initials">
                          {player.firstName[0]}{player.lastName[0]}
                        </div>
                      )}
                      {selected && <div className="selected-badge">✓</div>}
                      {/* Badges for achievements */}
                      {player.stats2025?.timesFinished1st > 0 && !selected && (
                        <div className="achievement-badge winner">🏆</div>
                      )}
                    </div>
                    <div className="player-info">
                      <h4 className="player-name">{player.firstName} {player.lastName}</h4>
                      <span className={`membership-badge ${player.membershipType}`}>
                        {getMembershipLabel(player.membershipType)}
                      </span>
                      <div className="player-price">{formatPrice(player.price)}</div>
                      
                      {/* 2025 Stats */}
                      {player.stats2025 && (
                        <div className="player-stats-2025">
                          <div className="stats-row primary">
                            <span className="stat-item" title="1st Place Finishes">
                              <span className="stat-icon">🥇</span>
                              <span className="stat-value">{player.stats2025.timesFinished1st}</span>
                            </span>
                            <span className="stat-item" title="2nd Place Finishes">
                              <span className="stat-icon">🥈</span>
                              <span className="stat-value">{player.stats2025.timesFinished2nd}</span>
                            </span>
                            <span className="stat-item" title="3rd Place Finishes">
                              <span className="stat-icon">🥉</span>
                              <span className="stat-value">{player.stats2025.timesFinished3rd}</span>
                            </span>
                          </div>
                          <div className="stats-row secondary">
                            <span className="stat-item" title="Rounds Played">
                              <span className="stat-label">Played</span>
                              <span className="stat-value">{player.stats2025.timesPlayed}</span>
                            </span>
                            <span className="stat-item" title="36+ Point Rounds">
                              <span className="stat-label">36+</span>
                              <span className="stat-value">{player.stats2025.timesScored36Plus}</span>
                            </span>
                            <span className="stat-item" title="Total Podium Finishes">
                              <span className="stat-label">Podiums</span>
                              <span className="stat-value">{podiums}</span>
                            </span>
                          </div>
                          {player.stats2025.timesPlayed > 0 && (
                            <div className="stats-row rates">
                              {winRate > 0 && (
                                <span className="rate-badge win" title="Win Rate">
                                  {winRate.toFixed(0)}% WR
                                </span>
                              )}
                              {podiumRate > 0 && (
                                <span className="rate-badge podium" title="Podium Rate">
                                  {podiumRate.toFixed(0)}% PR
                                </span>
                              )}
                              {consistencyRate > 0 && (
                                <span className="rate-badge consistency" title="Consistency Rate (36+ rounds)">
                                  {consistencyRate.toFixed(0)}% CR
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                    <div className={`player-action-label ${selected ? 'selected' : ''}`}>
                      {selected ? 'Tap to Remove' : !affordable ? 'Can\'t Afford' : selectedPlayers.length >= TEAM_SIZE ? 'Team Full' : 'Tap to Select'}
                    </div>
                  </div>
                );
              })}
            </div>
            {filteredPlayers.length === 0 && (
              <div className="no-results">
                <div className="no-results-icon">🔍</div>
                <h3>No players found</h3>
                <p>Try adjusting your filters or search term.</p>
                <button className="btn-reset" onClick={resetFilters}>Reset All Filters</button>
              </div>
            )}
          </section>
        </div>
      </main>

      {/* Footer */}
      <footer className="team-builder-footer">
        <p>© 2026 Bearwood Lakes Fantasy Golf. All rights reserved.</p>
      </footer>
    </div>
  );
};

export default TeamBuilderPage;
