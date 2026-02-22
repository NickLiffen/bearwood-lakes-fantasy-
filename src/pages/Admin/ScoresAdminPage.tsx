// Admin: Scores management page

import React, { useCallback, useEffect, useState } from 'react';
import AdminLayout from '../../components/AdminLayout/AdminLayout';
import { useApiClient } from '../../hooks/useApiClient';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';

interface Tournament {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  tournamentType: 'regular' | 'elevated' | 'signature';
  multiplier: number;
  status: 'draft' | 'published' | 'complete';
  participatingGolferIds: string[];
}

interface Golfer {
  id: string;
  firstName: string;
  lastName: string;
  picture: string;
  price: number;
  isActive: boolean;
}

interface Score {
  id: string;
  tournamentId: string;
  golferId: string;
  participated: boolean;
  position: number | null;
  scored36Plus: boolean;
  basePoints: number;
  bonusPoints: number;
  multipliedPoints: number;
}

interface ScoreEntry {
  golferId: string;
  participated: boolean;
  position: number | null;
  scored36Plus: boolean;
}

interface TournamentWithScores {
  tournament: Tournament;
  scores: Score[];
  totalPoints: number;
}

const ScoresAdminPage: React.FC = () => {
  const { get, post, put, request, isAuthReady } = useApiClient();
  useDocumentTitle('Admin: Scores');
  const [golfers, setGolfers] = useState<Golfer[]>([]);
  const [tournamentsWithScores, setTournamentsWithScores] = useState<TournamentWithScores[]>([]);
  const [tournamentsWithoutScores, setTournamentsWithoutScores] = useState<Tournament[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Modal state for adding/editing scores
  const [showModal, setShowModal] = useState(false);
  const [editingTournament, setEditingTournament] = useState<Tournament | null>(null);
  const [scores, setScores] = useState<Record<string, ScoreEntry>>({});
  const [saving, setSaving] = useState(false);
  const [saveProgress, setSaveProgress] = useState<string>('');

  // Details modal state
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [viewingTournament, setViewingTournament] = useState<TournamentWithScores | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setError(''); // Clear previous errors
      const [tournamentsRes, golfersRes, scoresRes] = await Promise.all([
        get<Tournament[]>('tournaments-list?allSeasons=true'),
        get<Golfer[]>('golfers-list'),
        get<Score[]>('scores-list'),
      ]);

      // Ignore cancelled requests
      if (tournamentsRes.cancelled || golfersRes.cancelled || scoresRes.cancelled) {
        return;
      }

      let fetchedTournaments: Tournament[] = [];
      let fetchedGolfers: Golfer[] = [];
      let fetchedScores: Score[] = [];

      if (tournamentsRes.success && tournamentsRes.data) {
        // Filter to published/complete tournaments
        fetchedTournaments = tournamentsRes.data.filter(
          (t: Tournament) => t.status === 'published' || t.status === 'complete'
        );
      }
      if (golfersRes.success && golfersRes.data) {
        fetchedGolfers = golfersRes.data;
        setGolfers(fetchedGolfers);
      }
      if (scoresRes.success && scoresRes.data) {
        fetchedScores = scoresRes.data;
      }

      // Group scores by tournament
      const scoresByTournament = new Map<string, Score[]>();
      fetchedScores.forEach(score => {
        const existing = scoresByTournament.get(score.tournamentId) || [];
        existing.push(score);
        scoresByTournament.set(score.tournamentId, existing);
      });

      // Separate tournaments with and without scores
      const withScores: TournamentWithScores[] = [];
      const withoutScores: Tournament[] = [];

      fetchedTournaments.forEach(tournament => {
        const tournamentScores = scoresByTournament.get(tournament.id);
        if (tournamentScores && tournamentScores.length > 0) {
          const totalPoints = tournamentScores.reduce((sum, s) => sum + s.multipliedPoints, 0);
          withScores.push({ tournament, scores: tournamentScores, totalPoints });
        } else {
          withoutScores.push(tournament);
        }
      });

      // Sort by date (most recent first)
      withScores.sort((a, b) => 
        new Date(b.tournament.startDate).getTime() - new Date(a.tournament.startDate).getTime()
      );
      withoutScores.sort((a, b) => 
        new Date(b.startDate).getTime() - new Date(a.startDate).getTime()
      );

      setTournamentsWithScores(withScores);
      setTournamentsWithoutScores(withoutScores);
    } catch (err) {
      console.error('Failed to fetch data:', err);
      setError('Failed to load data');
    } finally {
      setLoading(false);
    }
  }, [get]);

  useEffect(() => {
    if (isAuthReady) {
      fetchData();
    }
  }, [isAuthReady, fetchData]);

  const getGolferName = (golferId: string) => {
    const golfer = golfers.find(g => g.id === golferId);
    return golfer ? `${golfer.firstName} ${golfer.lastName}` : 'Unknown Golfer';
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  };

  const handleOpenAddScores = (tournament: Tournament) => {
    setEditingTournament(tournament);
    setError('');
    setSuccess('');

    // Initialize scores for all active golfers
    const initialScores: Record<string, ScoreEntry> = {};
    golfers.filter(g => g.isActive).forEach(golfer => {
      initialScores[golfer.id] = {
        golferId: golfer.id,
        participated: false,
        position: null,
        scored36Plus: false,
      };
    });

    // Load existing participation from tournament if any
    if (tournament.participatingGolferIds?.length) {
      tournament.participatingGolferIds.forEach(golferId => {
        if (initialScores[golferId]) {
          initialScores[golferId].participated = true;
        }
      });
    }

    setScores(initialScores);
    setShowModal(true);
  };

  const handleOpenEditScores = (tournamentWithScores: TournamentWithScores) => {
    setEditingTournament(tournamentWithScores.tournament);
    setError('');
    setSuccess('');

    // Initialize scores for all active golfers
    const initialScores: Record<string, ScoreEntry> = {};
    golfers.filter(g => g.isActive).forEach(golfer => {
      initialScores[golfer.id] = {
        golferId: golfer.id,
        participated: false,
        position: null,
        scored36Plus: false,
      };
    });

    // Load existing scores
    tournamentWithScores.scores.forEach(score => {
      if (initialScores[score.golferId]) {
        initialScores[score.golferId] = {
          golferId: score.golferId,
          participated: score.participated,
          position: score.position,
          scored36Plus: score.scored36Plus,
        };
      }
    });

    setScores(initialScores);
    setShowModal(true);
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setEditingTournament(null);
    setScores({});
    setError('');
  };

  const handleViewScores = (tournamentWithScores: TournamentWithScores) => {
    setViewingTournament(tournamentWithScores);
    setShowDetailsModal(true);
  };

  const handleCloseDetailsModal = () => {
    setShowDetailsModal(false);
    setViewingTournament(null);
  };

  const handleScoreChange = (golferId: string, field: 'participated' | 'position' | 'scored36Plus', value: string | boolean) => {
    setScores((prev) => {
      const newScore = {
        ...prev[golferId],
        golferId,
        [field]: field === 'position' ? (value ? parseInt(value as string) : null) : value,
      };

      // If unchecking participated, reset position and bonus
      if (field === 'participated' && value === false) {
        newScore.position = null;
        newScore.scored36Plus = false;
      }

      return {
        ...prev,
        [golferId]: newScore,
      };
    });
  };

  // Calculate participant count and tier dynamically
  const participantCount = Object.values(scores).filter(s => s.participated).length;
  const getTier = (count: number): '0-10' | '10-20' | '20+' => {
    if (count <= 10) return '0-10';
    if (count < 20) return '10-20';
    return '20+';
  };
  const currentTier = getTier(participantCount);

  // Validation function for scores
  const validateScores = (): { valid: boolean; error: string } => {
    const participatingPlayers = Object.values(scores).filter(s => s.participated);
    
    // Rule 1: At least 1 golfer must have participated
    if (participatingPlayers.length === 0) {
      return { valid: false, error: 'At least one golfer must have participated' };
    }

    const tier = getTier(participatingPlayers.length);
    
    // Check for required positions
    const hasFirst = participatingPlayers.some(s => s.position === 1);
    const hasSecond = participatingPlayers.some(s => s.position === 2);
    const hasThird = participatingPlayers.some(s => s.position === 3);

    // Rule 2: 0-10 golfers → must have 1st place
    if (tier === '0-10') {
      if (!hasFirst) {
        return { valid: false, error: 'With 1-10 golfers, you must assign a 1st place finish' };
      }
    }

    // Rule 3: 10-20 golfers → must have 1st and 2nd place
    if (tier === '10-20') {
      if (!hasFirst || !hasSecond) {
        return { valid: false, error: 'With 10-20 golfers, you must assign both 1st and 2nd place finishes' };
      }
    }

    // Rule 4: 20+ golfers → must have 1st, 2nd, and 3rd place
    if (tier === '20+') {
      if (!hasFirst || !hasSecond || !hasThird) {
        return { valid: false, error: 'With 20+ golfers, you must assign 1st, 2nd, and 3rd place finishes' };
      }
    }

    // Check for duplicate positions (only for positions 1, 2, 3)
    const positions = participatingPlayers
      .filter(s => s.position !== null && s.position >= 1 && s.position <= 3)
      .map(s => s.position);
    const uniquePositions = new Set(positions);
    if (positions.length !== uniquePositions.size) {
      return { valid: false, error: 'Duplicate positions found. Each position (1st, 2nd, 3rd) can only be assigned once' };
    }

    return { valid: true, error: '' };
  };

  // Get validation state for UI feedback
  const validationResult = validateScores();

  const handleSaveScores = async () => {
    if (!editingTournament) {
      setError('No tournament selected');
      return;
    }

    // Run validation
    const validation = validateScores();
    if (!validation.valid) {
      setError(validation.error);
      return;
    }

    const participatingPlayers = Object.values(scores).filter(s => s.participated);

    setSaving(true);
    setSaveProgress('Updating tournament...');
    setError('');

    try {
      // First, update tournament with participating golfers
      await put<Tournament>('tournaments-update', {
        id: editingTournament.id,
        participatingGolferIds: participatingPlayers.map(s => s.golferId),
      });

      // Save scores for ALL golfers (both participating and non-participating)
      // This ensures golfers who were unchecked get their scores reset to 0
      const scoresToSave = Object.values(scores).map((s) => ({
        golferId: s.golferId,
        participated: s.participated,
        position: s.participated ? s.position : null,
        scored36Plus: s.participated ? s.scored36Plus : false,
      }));

      if (scoresToSave.length > 0) {
        setSaveProgress(`Saving ${scoresToSave.length} scores...`);
        const response = await post<Score[]>('scores-enter', {
          tournamentId: editingTournament.id,
          scores: scoresToSave,
        });

        if (!response.success) throw new Error(response.error || 'Failed to save scores');
      }

      setSuccess('Scores saved successfully!');
      handleCloseModal();
      fetchData();
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setSaving(false);
      setSaveProgress('');
    }
  };

  const handleDeleteScores = async (tournament: Tournament) => {
    if (!window.confirm(`Are you sure you want to delete all scores for "${tournament.name}"? This action cannot be undone.`)) {
      return;
    }

    try {
      const response = await request<void>('scores-delete', {
        method: 'DELETE',
        body: JSON.stringify({ tournamentId: tournament.id }),
      });
      if (!response.success) throw new Error(response.error || 'Failed to delete scores');
      setSuccess('Scores deleted successfully!');
      fetchData();
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    }
  };

  const getTypeBadge = (tournament: Tournament) => {
    if (tournament.tournamentType === 'signature') {
      return (
        <span
          style={{
            background: '#7c3aed',
            color: 'white',
            padding: '0.25rem 0.5rem',
            borderRadius: '4px',
            fontWeight: 600,
            fontSize: '0.8rem',
          }}
        >
          3x Signature
        </span>
      );
    } else if (tournament.tournamentType === 'elevated') {
      return (
        <span
          style={{
            background: 'var(--accent-gold)',
            color: '#1a1a1a',
            padding: '0.25rem 0.5rem',
            borderRadius: '4px',
            fontWeight: 600,
            fontSize: '0.8rem',
          }}
        >
          2x Elevated
        </span>
      );
    }
    return <span style={{ color: '#6b7280' }}>1x Regular</span>;
  };

  // Calculate stats for summary boxes
  const totalScoresEntered = tournamentsWithScores.reduce(
    (sum, t) => sum + t.scores.filter(s => s.participated).length, 
    0
  );
  const totalPointsAwarded = tournamentsWithScores.reduce(
    (sum, t) => sum + t.totalPoints, 
    0
  );
  const tournamentsScored = tournamentsWithScores.length;
  const tournamentsNeedingScores = tournamentsWithoutScores.length;

  return (
    <AdminLayout title="Manage Scores">
      {success && <div className="alert alert-success">{success}</div>}
      {error && <div className="alert alert-error">{error}</div>}

      {/* Stats Row */}
      <div className="stats-row" style={{ marginBottom: '1.5rem' }}>
        <div className="stat-box">
          <div className="stat-box-icon">📊</div>
          <div className="stat-box-value">{totalScoresEntered}</div>
          <div className="stat-box-label">Scores Entered</div>
        </div>
        <div className="stat-box">
          <div className="stat-box-icon">⭐</div>
          <div className="stat-box-value">{totalPointsAwarded}</div>
          <div className="stat-box-label">Total Points</div>
        </div>
        <div className="stat-box">
          <div className="stat-box-icon">✅</div>
          <div className="stat-box-value">{tournamentsScored}</div>
          <div className="stat-box-label">Tournaments Scored</div>
        </div>
        <div className="stat-box">
          <div className="stat-box-icon">⏳</div>
          <div className="stat-box-value">{tournamentsNeedingScores}</div>
          <div className="stat-box-label">Needing Scores</div>
        </div>
      </div>

      {loading ? (
        <div className="admin-card">
          <div className="admin-card-body">
            <p>Loading...</p>
          </div>
        </div>
      ) : (
        <>
          {/* Tournaments with Scores */}
          <div className="admin-card" style={{ marginBottom: '1.5rem' }}>
            <div className="admin-card-header">
              <h2>Tournaments with Scores ({tournamentsWithScores.length})</h2>
            </div>

            {tournamentsWithScores.length === 0 ? (
              <div className="empty-state">
                <div className="empty-state-icon">📊</div>
                <h3>No Scores Entered Yet</h3>
                <p>Add scores to tournaments below to see them here.</p>
              </div>
            ) : (
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Tournament</th>
                    <th>Date</th>
                    <th>Type</th>
                    <th>golfers</th>
                    <th>Total Points</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {tournamentsWithScores.map((item) => (
                    <tr key={item.tournament.id}>
                      <td>
                        <button
                          onClick={() => handleViewScores(item)}
                          style={{
                            background: 'none',
                            border: 'none',
                            padding: 0,
                            fontWeight: 500,
                            color: 'var(--primary-green)',
                            cursor: 'pointer',
                            textDecoration: 'underline',
                            textUnderlineOffset: '2px',
                          }}
                        >
                          {item.tournament.name}
                        </button>
                      </td>
                      <td>{formatDate(item.tournament.startDate)}</td>
                      <td>{getTypeBadge(item.tournament)}</td>
                      <td>{item.scores.filter(s => s.participated).length} golfers</td>
                      <td>
                        <strong style={{ color: 'var(--primary-green)' }}>
                          {item.totalPoints} pts
                        </strong>
                      </td>
                      <td>
                        <div className="table-actions">
                          <button
                            className="btn btn-secondary btn-sm"
                            onClick={() => handleOpenEditScores(item)}
                          >
                            Edit
                          </button>
                          <button
                            className="btn btn-danger btn-sm"
                            onClick={() => handleDeleteScores(item.tournament)}
                            style={{ background: '#dc2626', color: 'white' }}
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Tournaments without Scores */}
          <div className="admin-card">
            <div className="admin-card-header">
              <h2>Tournaments Needing Scores ({tournamentsWithoutScores.length})</h2>
            </div>

            {tournamentsWithoutScores.length === 0 ? (
              <div className="empty-state">
                <div className="empty-state-icon">✅</div>
                <h3>All Caught Up!</h3>
                <p>All tournaments have scores entered.</p>
              </div>
            ) : (
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Tournament</th>
                    <th>Date</th>
                    <th>Type</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {tournamentsWithoutScores.map((tournament) => (
                    <tr key={tournament.id}>
                      <td style={{ fontWeight: 500 }}>{tournament.name}</td>
                      <td>{formatDate(tournament.startDate)}</td>
                      <td>{getTypeBadge(tournament)}</td>
                      <td>
                        <span className={`badge ${tournament.status === 'complete' ? 'badge-info' : 'badge-success'}`}>
                          {tournament.status}
                        </span>
                      </td>
                      <td>
                        <button
                          className="btn btn-primary btn-sm"
                          onClick={() => handleOpenAddScores(tournament)}
                        >
                          + Add Scores
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}

      {/* Add/Edit Scores Modal */}
      {showModal && editingTournament && (
        <div className="modal-overlay" onClick={handleCloseModal}>
          <div className="modal modal-lg" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '900px', maxHeight: '90vh', overflow: 'auto' }}>
            <div className="modal-header">
              <h2>
                {tournamentsWithScores.some(t => t.tournament.id === editingTournament.id) ? 'Edit' : 'Add'} Scores: {editingTournament.name}
              </h2>
              <button className="modal-close" onClick={handleCloseModal}>
                ×
              </button>
            </div>
            <div className="modal-body">
              {error && <div className="alert alert-error">{error}</div>}

              <div
                style={{
                  marginBottom: '1rem',
                  padding: '1rem',
                  background: '#f9fafb',
                  borderRadius: '8px',
                }}
              >
                <div style={{ marginBottom: '0.5rem' }}>
                  <strong>{editingTournament.name}</strong>
                  <span
                    style={{
                      marginLeft: '0.5rem',
                      background: editingTournament.tournamentType === 'signature' ? '#7c3aed' : editingTournament.tournamentType === 'elevated' ? 'var(--accent-gold)' : '#e5e7eb',
                      color: editingTournament.tournamentType === 'signature' ? 'white' : editingTournament.tournamentType === 'elevated' ? '#1a1a1a' : '#6b7280',
                      padding: '0.2rem 0.5rem',
                      borderRadius: '4px',
                      fontSize: '0.75rem',
                      fontWeight: 600,
                    }}
                  >
                    {editingTournament.multiplier}x {editingTournament.tournamentType}
                  </span>
                </div>
                <div style={{ fontSize: '0.85rem', color: '#6b7280' }}>
                  <strong>Participants:</strong> {participantCount} golfers |{' '}
                  <strong>Tier:</strong> {currentTier} |{' '}
                  <strong>Points:</strong>{' '}
                  {currentTier === '0-10' && '1st = 5pts'}
                  {currentTier === '10-20' && '1st = 5pts, 2nd = 2pts'}
                  {currentTier === '20+' && '1st = 5pts, 2nd = 3pts, 3rd = 1pt'}
                  {' + 36+ bonus = +1pt'}
                </div>
                {/* Required positions indicator */}
                {participantCount > 0 && (
                  <div style={{ 
                    marginTop: '0.5rem', 
                    fontSize: '0.85rem', 
                    color: validationResult.valid ? '#059669' : '#dc2626',
                    fontWeight: 500,
                  }}>
                    ✓ Required:{' '}
                    {currentTier === '0-10' && '1st place'}
                    {currentTier === '10-20' && '1st & 2nd place'}
                    {currentTier === '20+' && '1st, 2nd & 3rd place'}
                    {validationResult.valid && ' ✅'}
                  </div>
                )}
              </div>

              <p style={{ marginBottom: '1rem', color: '#6b7280' }}>
                Mark the golfers who played in this tournament, then set their position and 36+ bonus.
              </p>

              {golfers.length === 0 ? (
                <p>No golfers available. Add golfers first.</p>
              ) : (
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>golfer</th>
                      <th style={{ width: '80px' }}>Played?</th>
                      <th style={{ width: '120px' }}>Position</th>
                      <th style={{ width: '100px' }}>36+ Points?</th>
                      <th style={{ width: '120px' }}>Final Points</th>
                    </tr>
                  </thead>
                  <tbody>
                    {golfers
                      .filter((g) => g.isActive)
                      .map((golfer) => {
                        const score = scores[golfer.id];
                        const isParticipant = score?.participated || false;

                        // Calculate points based on dynamic tier
                        const getBasePoints = () => {
                          if (!score?.position) return 0;
                          if (currentTier === '0-10') {
                            return score.position === 1 ? 5 : 0;
                          } else if (currentTier === '10-20') {
                            if (score.position === 1) return 5;
                            if (score.position === 2) return 2;
                            return 0;
                          } else {
                            if (score.position === 1) return 5;
                            if (score.position === 2) return 3;
                            if (score.position === 3) return 1;
                            return 0;
                          }
                        };

                        const basePoints = getBasePoints();
                        const bonusPoints = score?.scored36Plus ? 1 : 0;
                        const finalPoints = (basePoints + bonusPoints) * editingTournament.multiplier;

                        return (
                          <tr key={golfer.id}>
                            <td>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                {golfer.picture ? (
                                  <img
                                    src={golfer.picture}
                                    alt=""
                                    style={{
                                      width: '32px',
                                      height: '32px',
                                      borderRadius: '50%',
                                      objectFit: 'cover',
                                    }}
                                  />
                                ) : (
                                  <div
                                    style={{
                                      width: '32px',
                                      height: '32px',
                                      borderRadius: '50%',
                                      background: '#e5e7eb',
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      fontSize: '0.9rem',
                                    }}
                                  >
                                    🏌️
                                  </div>
                                )}
                                <span style={{ fontWeight: 500 }}>
                                  {golfer.firstName} {golfer.lastName}
                                </span>
                              </div>
                            </td>
                            <td>
                              <input
                                id={`participated-${golfer.id}`}
                                name={`participated-${golfer.id}`}
                                type="checkbox"
                                checked={isParticipant}
                                onChange={(e) => handleScoreChange(golfer.id, 'participated', e.target.checked)}
                                style={{ width: '18px', height: '18px' }}
                              />
                            </td>
                            <td>
                              {isParticipant ? (
                                <select
                                  id={`score-position-${golfer.id}`}
                                  name={`score-position-${golfer.id}`}
                                  value={score?.position || ''}
                                  onChange={(e) =>
                                    handleScoreChange(golfer.id, 'position', e.target.value)
                                  }
                                  style={{ width: '100%' }}
                                >
                                  <option value="">-</option>
                                  <option value="1">🥇 1st</option>
                                  {(currentTier === '10-20' || currentTier === '20+') && (
                                    <option value="2">🥈 2nd</option>
                                  )}
                                  {currentTier === '20+' && (
                                    <option value="3">🥉 3rd</option>
                                  )}
                                </select>
                              ) : (
                                <span style={{ color: '#9ca3af' }}>-</span>
                              )}
                            </td>
                            <td>
                              {isParticipant ? (
                                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                                  <input
                                    id={`scored-36-plus-${golfer.id}`}
                                    name={`scored-36-plus-${golfer.id}`}
                                    type="checkbox"
                                    checked={score?.scored36Plus || false}
                                    onChange={(e) =>
                                      handleScoreChange(golfer.id, 'scored36Plus', e.target.checked)
                                    }
                                    style={{ width: '18px', height: '18px' }}
                                  />
                                  <span style={{ fontSize: '0.85rem', color: score?.scored36Plus ? 'var(--primary-green)' : '#6b7280' }}>
                                    {score?.scored36Plus ? '+1' : ''}
                                  </span>
                                </label>
                              ) : (
                                <span style={{ color: '#9ca3af' }}>-</span>
                              )}
                            </td>
                            <td>
                              {isParticipant ? (
                                <span
                                  style={{
                                    fontWeight: 700,
                                    color: finalPoints > 0 ? 'var(--primary-green)' : '#9ca3af',
                                  }}
                                >
                                  {finalPoints > 0 ? `${finalPoints} pts` : '-'}
                                </span>
                              ) : (
                                <span style={{ color: '#9ca3af' }}>-</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              )}
            </div>
            {/* Validation feedback */}
            {participantCount > 0 && !validationResult.valid && (
              <div style={{ padding: '0 1.5rem', marginBottom: '1rem' }}>
                <div style={{ 
                  background: '#fef2f2', 
                  border: '1px solid #fecaca', 
                  borderRadius: '8px', 
                  padding: '0.75rem 1rem',
                  color: '#dc2626',
                  fontSize: '0.9rem',
                }}>
                  ⚠️ {validationResult.error}
                </div>
              </div>
            )}
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={handleCloseModal}>
                Cancel
              </button>
              <button
                className="btn btn-primary"
                onClick={handleSaveScores}
                disabled={saving || !validationResult.valid}
                title={!validationResult.valid ? validationResult.error : ''}
              >
                {saving ? (saveProgress || 'Saving...') : 'Save Scores'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* View Scores Details Modal */}
      {showDetailsModal && viewingTournament && (
        <div className="modal-overlay" onClick={handleCloseDetailsModal}>
          <div className="modal modal-lg" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '800px', maxHeight: '90vh', overflow: 'auto' }}>
            <div className="modal-header">
              <h2>{viewingTournament.tournament.name} - Scores</h2>
              <button className="modal-close" onClick={handleCloseDetailsModal}>
                ×
              </button>
            </div>
            <div className="modal-body">
              <div
                style={{
                  marginBottom: '1rem',
                  padding: '1rem',
                  background: '#f9fafb',
                  borderRadius: '8px',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <strong>{viewingTournament.tournament.name}</strong>
                    <span
                      style={{
                        marginLeft: '0.5rem',
                        background: viewingTournament.tournament.tournamentType === 'signature' ? '#7c3aed' : viewingTournament.tournament.tournamentType === 'elevated' ? 'var(--accent-gold)' : '#e5e7eb',
                        color: viewingTournament.tournament.tournamentType === 'signature' ? 'white' : viewingTournament.tournament.tournamentType === 'elevated' ? '#1a1a1a' : '#6b7280',
                        padding: '0.2rem 0.5rem',
                        borderRadius: '4px',
                        fontSize: '0.75rem',
                        fontWeight: 600,
                      }}
                    >
                      {viewingTournament.tournament.multiplier}x {viewingTournament.tournament.tournamentType}
                    </span>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--primary-green)' }}>
                      {viewingTournament.totalPoints} pts
                    </div>
                    <div style={{ fontSize: '0.85rem', color: '#6b7280' }}>
                      {viewingTournament.scores.filter(s => s.participated).length} golfers
                    </div>
                  </div>
                </div>
              </div>

              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Position</th>
                    <th>golfer</th>
                    <th>36+ Bonus</th>
                    <th>Points</th>
                  </tr>
                </thead>
                <tbody>
                  {viewingTournament.scores
                    .filter(s => s.participated)
                    .sort((a, b) => {
                      if (a.position !== null && b.position !== null) return a.position - b.position;
                      if (a.position !== null) return -1;
                      if (b.position !== null) return 1;
                      return b.multipliedPoints - a.multipliedPoints;
                    })
                    .map((score) => (
                      <tr key={score.id}>
                        <td>
                          {score.position === 1 && '🥇 1st'}
                          {score.position === 2 && '🥈 2nd'}
                          {score.position === 3 && '🥉 3rd'}
                          {!score.position && '-'}
                        </td>
                        <td style={{ fontWeight: 500 }}>{getGolferName(score.golferId)}</td>
                        <td>
                          {score.scored36Plus ? (
                            <span style={{ color: 'var(--primary-green)', fontWeight: 600 }}>+1</span>
                          ) : (
                            <span style={{ color: '#9ca3af' }}>-</span>
                          )}
                        </td>
                        <td>
                          <strong style={{ color: score.multipliedPoints > 0 ? 'var(--primary-green)' : '#9ca3af' }}>
                            {score.multipliedPoints > 0 ? `${score.multipliedPoints} pts` : '-'}
                          </strong>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={handleCloseDetailsModal}>
                Close
              </button>
              <button
                className="btn btn-primary"
                onClick={() => {
                  handleCloseDetailsModal();
                  handleOpenEditScores(viewingTournament);
                }}
              >
                Edit Scores
              </button>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
};

export default ScoresAdminPage;
