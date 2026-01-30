// Admin: Tournaments management page

import React, { useEffect, useState } from 'react';
import AdminLayout from '../../components/AdminLayout/AdminLayout';
import { validators, sanitizers, getInputClassName } from '../../utils/validation';
import { useApiClient } from '../../hooks/useApiClient';

interface Tournament {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  tournamentType: 'regular' | 'elevated' | 'signature';
  multiplier: number;
  season: number;
  status: 'draft' | 'published' | 'complete';
  participatingGolferIds: string[];
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

interface Golfer {
  id: string;
  firstName: string;
  lastName: string;
}

interface ScoreWithGolfer extends Score {
  golferName: string;
}

interface TournamentFormData {
  name: string;
  startDate: string;
  endDate: string;
  tournamentType: 'regular' | 'elevated' | 'signature';
}

const initialFormData: TournamentFormData = {
  name: '',
  startDate: '',
  endDate: '',
  tournamentType: 'regular',
};

const TournamentsAdminPage: React.FC = () => {
  const { get, post, put, request, isAuthReady } = useApiClient();
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingTournament, setEditingTournament] = useState<Tournament | null>(null);
  const [formData, setFormData] = useState<TournamentFormData>(initialFormData);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Tournament details modal state
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [viewingTournament, setViewingTournament] = useState<Tournament | null>(null);
  const [tournamentScores, setTournamentScores] = useState<ScoreWithGolfer[]>([]);
  const [loadingScores, setLoadingScores] = useState(false);
  const [golfers, setGolfers] = useState<Golfer[]>([]);

  // Form validation state
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  // Form field validation rules
  const validateField = (field: string, value: string): string => {
    switch (field) {
      case 'name':
        if (!value.trim()) return 'Tournament name is required';
        if (value.length < 3) return 'Name must be at least 3 characters';
        if (value.length > 100) return 'Name cannot exceed 100 characters';
        return '';
      case 'startDate': {
        if (!value) return 'Start date is required';
        const startDateValidator = validators.date();
        const startDateError = startDateValidator(value);
        if (startDateError) return startDateError;
        return '';
      }
      case 'endDate': {
        if (!value) return 'End date is required';
        const endDateValidator = validators.date();
        const endDateError = endDateValidator(value);
        if (endDateError) return endDateError;
        if (formData.startDate && value < formData.startDate) {
          return 'End date must be after start date';
        }
        return '';
      }
      default:
        return '';
    }
  };

  const handleFieldChange = (field: string, value: string) => {
    let sanitizedValue = value;
    if (field === 'name') {
      sanitizedValue = sanitizers.removeExtraSpaces(value);
    }
    
    setFormData({ ...formData, [field]: sanitizedValue });
    
    if (touched[field]) {
      setFieldErrors({ ...fieldErrors, [field]: validateField(field, sanitizedValue) });
    }
    
    // Re-validate endDate when startDate changes
    if (field === 'startDate' && touched.endDate) {
      setFieldErrors(prev => ({ ...prev, endDate: validateField('endDate', formData.endDate) }));
    }
  };

  const handleFieldBlur = (field: string) => {
    setTouched({ ...touched, [field]: true });
    setFieldErrors({ ...fieldErrors, [field]: validateField(field, formData[field as keyof TournamentFormData]) });
  };

  const getFieldClass = (field: string): string => {
    if (!touched[field]) return 'form-input';
    return getInputClassName(touched[field], fieldErrors[field], 'form-input');
  };

  const validateAllFields = (): boolean => {
    const newErrors: Record<string, string> = {};
    const fieldsToValidate = ['name', 'startDate', 'endDate'];
    
    fieldsToValidate.forEach(field => {
      const error = validateField(field, formData[field as keyof TournamentFormData]);
      if (error) newErrors[field] = error;
    });
    
    const newTouched: Record<string, boolean> = {};
    fieldsToValidate.forEach(field => { newTouched[field] = true; });
    setTouched({ ...touched, ...newTouched });
    setFieldErrors(newErrors);
    
    return Object.keys(newErrors).length === 0;
  };

  const fetchTournaments = async () => {
    try {
      const response = await get<Tournament[]>('tournaments-list');
      
      // Ignore cancelled requests
      if (response.cancelled) return;
      
      if (response.success && response.data) {
        setTournaments(response.data);
      }
    } catch (err) {
      console.error('Failed to fetch tournaments:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchGolfers = async () => {
    try {
      const response = await get<Golfer[]>('golfers-list');
      
      // Ignore cancelled requests
      if (response.cancelled) return;
      
      if (response.success && response.data) {
        setGolfers(response.data);
      }
    } catch (err) {
      console.error('Failed to fetch golfers:', err);
    }
  };

  useEffect(() => {
    if (isAuthReady) {
      fetchTournaments();
      fetchGolfers();
    }
  }, [isAuthReady]);

  const handleOpenModal = (tournament?: Tournament) => {
    if (tournament) {
      setEditingTournament(tournament);
      setFormData({
        name: tournament.name,
        startDate: tournament.startDate.split('T')[0],
        endDate: tournament.endDate.split('T')[0],
        tournamentType: tournament.tournamentType || 'regular',
      });
    } else {
      setEditingTournament(null);
      setFormData(initialFormData);
    }
    setError('');
    setTouched({});
    setFieldErrors({});
    setShowModal(true);
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setEditingTournament(null);
    setFormData(initialFormData);
    setError('');
    setTouched({});
    setFieldErrors({});
  };

  const handleViewTournament = async (tournament: Tournament) => {
    setViewingTournament(tournament);
    setShowDetailsModal(true);
    setLoadingScores(true);
    setTournamentScores([]);


    try {
      const response = await get<Score[]>(`scores-list?tournamentId=${tournament.id}`);
      if (response.success && response.data) {
        // Map scores to include golfer names
        const scoresWithNames: ScoreWithGolfer[] = response.data.map((score: Score) => {
          const golfer = golfers.find(g => g.id === score.golferId);
          return {
            ...score,
            golferName: golfer ? `${golfer.firstName} ${golfer.lastName}` : 'Unknown Golfer',
          };
        });
        // Sort by position (nulls last) then by points
        scoresWithNames.sort((a, b) => {
          if (a.position !== null && b.position !== null) return a.position - b.position;
          if (a.position !== null) return -1;
          if (b.position !== null) return 1;
          return b.multipliedPoints - a.multipliedPoints;
        });
        setTournamentScores(scoresWithNames);
      }
    } catch (err) {
      console.error('Failed to fetch scores:', err);
    } finally {
      setLoadingScores(false);
    }
  };

  const handleCloseDetailsModal = () => {
    setShowDetailsModal(false);
    setViewingTournament(null);
    setTournamentScores([]);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // Validate all fields before submission
    if (!validateAllFields()) {
      setError('Please fix the validation errors before submitting');
      return;
    }

    try {
      if (editingTournament) {
        // Update existing tournament
        const response = await put<Tournament>('tournaments-update', {
          id: editingTournament.id,
          name: formData.name,
          startDate: formData.startDate,
          endDate: formData.endDate,
          tournamentType: formData.tournamentType,
        });
        if (!response.success) throw new Error(response.error || 'Failed to update tournament');
        setSuccess('Tournament updated successfully!');
      } else {
        // Create new tournament
        const response = await post<Tournament>('tournaments-create', {
          name: formData.name,
          startDate: formData.startDate,
          endDate: formData.endDate,
          tournamentType: formData.tournamentType,
        });
        if (!response.success) throw new Error(response.error || 'Failed to create tournament');
        setSuccess('Tournament created successfully!');
      }

      handleCloseModal();
      fetchTournaments();
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    }
  };

  const handleStatusChange = async (tournament: Tournament, newStatus: string) => {
    try {
      const response = await put<Tournament>('tournaments-update', {
        id: tournament.id,
        status: newStatus,
      });
      if (!response.success) throw new Error(response.error || 'Failed to update status');
      setSuccess(`Tournament ${newStatus === 'published' ? 'published' : 'marked as complete'}!`);
      fetchTournaments();
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    }
  };

  const handleDeleteTournament = async (tournament: Tournament) => {
    if (!window.confirm(`Are you sure you want to delete "${tournament.name}"? This action cannot be undone.`)) {
      return;
    }

    try {
      const response = await request<void>('tournaments-delete', {
        method: 'DELETE',
        body: JSON.stringify({ id: tournament.id }),
      });
      if (!response.success) throw new Error(response.error || 'Failed to delete tournament');
      setSuccess('Tournament deleted successfully!');
      fetchTournaments();
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'draft':
        return <span className="badge badge-gray">Draft</span>;
      case 'published':
        return <span className="badge badge-success">Published</span>;
      case 'complete':
        return <span className="badge badge-info">Complete</span>;
      default:
        return <span className="badge badge-gray">{status}</span>;
    }
  };

  // Calculate stats
  const draftCount = tournaments.filter(t => t.status === 'draft').length;
  const publishedCount = tournaments.filter(t => t.status === 'published').length;
  const completeCount = tournaments.filter(t => t.status === 'complete').length;

  return (
    <AdminLayout title="Manage Tournaments">
      {success && <div className="alert alert-success">{success}</div>}
      {error && <div className="alert alert-error">{error}</div>}

      {/* Stats Row */}
      <div className="stats-row" style={{ marginBottom: '1.5rem' }}>
        <div className="stat-box">
          <div className="stat-box-icon">🏆</div>
          <div className="stat-box-value">{tournaments.length}</div>
          <div className="stat-box-label">Total Tournaments</div>
        </div>
        <div className="stat-box">
          <div className="stat-box-icon">📝</div>
          <div className="stat-box-value">{draftCount}</div>
          <div className="stat-box-label">Draft</div>
        </div>
        <div className="stat-box">
          <div className="stat-box-icon">📢</div>
          <div className="stat-box-value">{publishedCount}</div>
          <div className="stat-box-label">Published</div>
        </div>
        <div className="stat-box">
          <div className="stat-box-icon">✅</div>
          <div className="stat-box-value">{completeCount}</div>
          <div className="stat-box-label">Complete</div>
        </div>
      </div>

      <div className="admin-card">
        <div className="admin-card-header">
          <h2>All Tournaments ({tournaments.length})</h2>
          <button className="btn btn-primary" onClick={() => handleOpenModal()}>
            + Create Tournament
          </button>
        </div>

        {loading ? (
          <div className="admin-card-body">
            <p>Loading tournaments...</p>
          </div>
        ) : tournaments.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">🏆</div>
            <h3>No Tournaments Yet</h3>
            <p>Create tournaments like The Masters, US Open, PGA Championship, etc.</p>
            <button className="btn btn-primary" onClick={() => handleOpenModal()}>
              Create Your First Tournament
            </button>
          </div>
        ) : (
          <table className="admin-table">
            <thead>
              <tr>
                <th>Tournament</th>
                <th>Dates</th>
                <th>Type</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {tournaments.map((tournament) => (
                <tr key={tournament.id}>
                  <td>
                    <button
                      onClick={() => handleViewTournament(tournament)}
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
                      {tournament.name}
                    </button>
                  </td>
                  <td>
                    {formatDate(tournament.startDate)} – {formatDate(tournament.endDate)}
                  </td>
                  <td>
                    {tournament.tournamentType === 'signature' ? (
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
                    ) : tournament.tournamentType === 'elevated' ? (
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
                    ) : (
                      <span style={{ color: '#6b7280' }}>1x Regular</span>
                    )}
                  </td>
                  <td>{getStatusBadge(tournament.status)}</td>
                  <td>
                    <div className="table-actions">
                      <button
                        className="btn btn-secondary btn-sm"
                        onClick={() => handleOpenModal(tournament)}
                      >
                        Edit
                      </button>
                      {tournament.status === 'draft' && (
                        <button
                          className="btn btn-primary btn-sm"
                          onClick={() => handleStatusChange(tournament, 'published')}
                        >
                          Publish
                        </button>
                      )}
                      {tournament.status === 'published' && (
                        <button
                          className="btn btn-primary btn-sm"
                          onClick={() => handleStatusChange(tournament, 'complete')}
                        >
                          Mark Complete
                        </button>
                      )}
                      <button
                        className="btn btn-danger btn-sm"
                        onClick={() => handleDeleteTournament(tournament)}
                        style={{
                          background: '#dc2626',
                          color: 'white',
                        }}
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

      {/* Add/Edit Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={handleCloseModal}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{editingTournament ? 'Edit Tournament' : 'Create New Tournament'}</h2>
              <button className="modal-close" onClick={handleCloseModal}>
                ×
              </button>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="modal-body">
                {error && <div className="alert alert-error">{error}</div>}

                <div className="form-group">
                  <label htmlFor="name">Tournament Name<span className="required-indicator">*</span></label>
                  <input
                    type="text"
                    id="name"
                    className={getFieldClass('name')}
                    value={formData.name}
                    onChange={(e) => handleFieldChange('name', e.target.value)}
                    onBlur={() => handleFieldBlur('name')}
                    placeholder="The Masters 2026"
                  />
                  {touched.name && fieldErrors.name && (
                    <span className="field-error">{fieldErrors.name}</span>
                  )}
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label htmlFor="startDate">Start Date<span className="required-indicator">*</span></label>
                    <input
                      type="date"
                      id="startDate"
                      className={getFieldClass('startDate')}
                      value={formData.startDate}
                      onChange={(e) => handleFieldChange('startDate', e.target.value)}
                      onBlur={() => handleFieldBlur('startDate')}
                    />
                    {touched.startDate && fieldErrors.startDate && (
                      <span className="field-error">{fieldErrors.startDate}</span>
                    )}
                  </div>
                  <div className="form-group">
                    <label htmlFor="endDate">End Date<span className="required-indicator">*</span></label>
                    <input
                      type="date"
                      id="endDate"
                      className={getFieldClass('endDate')}
                      value={formData.endDate}
                      onChange={(e) => handleFieldChange('endDate', e.target.value)}
                      onBlur={() => handleFieldBlur('endDate')}
                    />
                    {touched.endDate && fieldErrors.endDate && (
                      <span className="field-error">{fieldErrors.endDate}</span>
                    )}
                  </div>
                </div>

                <div className="form-group">
                  <label htmlFor="tournamentType">Tournament Type<span className="required-indicator">*</span></label>
                  <select
                    id="tournamentType"
                    className="form-select"
                    value={formData.tournamentType}
                    onChange={(e) => setFormData({ ...formData, tournamentType: e.target.value as 'regular' | 'elevated' | 'signature' })}
                  >
                    <option value="regular">1x - Regular Tournament</option>
                    <option value="elevated">2x - Elevated Tournament</option>
                    <option value="signature">3x - Signature Event</option>
                  </select>
                  <small style={{ color: '#6b7280', fontSize: '0.8rem', marginTop: '0.25rem', display: 'block' }}>
                    Regular = 1x, Elevated = 2x, Signature = 3x points multiplier
                  </small>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={handleCloseModal}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  {editingTournament ? 'Save Changes' : 'Create Tournament'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Tournament Details Modal */}
      {showDetailsModal && viewingTournament && (
        <div className="modal-overlay" onClick={handleCloseDetailsModal}>
          <div className="modal" style={{ maxWidth: '700px' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>🏆 {viewingTournament.name}</h2>
              <button className="modal-close" onClick={handleCloseDetailsModal}>
                ×
              </button>
            </div>
            <div className="modal-body">
              {/* Tournament Info */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem', marginBottom: '1.5rem' }}>
                <div style={{ background: '#f9fafb', padding: '1rem', borderRadius: '8px' }}>
                  <div style={{ fontSize: '0.8rem', color: '#6b7280', marginBottom: '0.25rem' }}>📅 Dates</div>
                  <div style={{ fontWeight: 500 }}>
                    {formatDate(viewingTournament.startDate)} – {formatDate(viewingTournament.endDate)}
                  </div>
                </div>
                <div style={{ background: '#f9fafb', padding: '1rem', borderRadius: '8px' }}>
                  <div style={{ fontSize: '0.8rem', color: '#6b7280', marginBottom: '0.25rem' }}>⚡ Type</div>
                  <div style={{ fontWeight: 500 }}>
                    {viewingTournament.tournamentType === 'signature' ? (
                      <span style={{ color: '#7c3aed' }}>{viewingTournament.multiplier}x Signature</span>
                    ) : viewingTournament.tournamentType === 'elevated' ? (
                      <span style={{ color: 'var(--accent-gold)' }}>{viewingTournament.multiplier}x Elevated</span>
                    ) : (
                      '1x Regular'
                    )}
                  </div>
                </div>
                <div style={{ background: '#f9fafb', padding: '1rem', borderRadius: '8px' }}>
                  <div style={{ fontSize: '0.8rem', color: '#6b7280', marginBottom: '0.25rem' }}>📊 Status</div>
                  <div>{getStatusBadge(viewingTournament.status)}</div>
                </div>
              </div>

              {/* Points Info Box - Dynamic based on participants */}
              {(() => {
                const participantCount = tournamentScores.filter(s => s.participated).length;
                const tier = participantCount <= 10 ? '0-10' : participantCount < 20 ? '10-20' : '20+';
                return (
                  <div style={{ background: '#fffbeb', padding: '1rem', borderRadius: '8px', marginBottom: '1.5rem', border: '1px solid #fde68a' }}>
                    <div style={{ fontSize: '0.85rem', color: '#92400e' }}>
                      <strong>golfers:</strong> {participantCount} ({tier} tier){' | '}
                      <strong>Points:</strong>{' '}
                      {tier === '0-10' && '1st = 5pts'}
                      {tier === '10-20' && '1st = 5pts, 2nd = 2pts'}
                      {tier === '20+' && '1st = 5pts, 2nd = 3pts, 3rd = 1pt'}
                      {' | '}36+ bonus = +1pt{' | '}
                      Multiplier = {viewingTournament.multiplier}x
                    </div>
                  </div>
                );
              })()}

              {/* Scores Section */}
              <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: '1.5rem' }}>
                <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '1rem' }}>
                  📋 Submitted Scores ({tournamentScores.filter(s => s.participated).length} participants)
                </h3>

                {loadingScores ? (
                  <div style={{ textAlign: 'center', padding: '2rem', color: '#6b7280' }}>
                    Loading scores...
                  </div>
                ) : tournamentScores.filter(s => s.participated).length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '2rem', background: '#f9fafb', borderRadius: '8px' }}>
                    <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>📭</div>
                    <p style={{ color: '#6b7280' }}>No scores have been submitted for this tournament yet.</p>
                  </div>
                ) : (
                  <div style={{ maxHeight: '300px', overflow: 'auto', border: '1px solid #e5e7eb', borderRadius: '8px' }}>
                    <table className="admin-table" style={{ margin: 0 }}>
                      <thead>
                        <tr>
                          <th>Pos</th>
                          <th>golfer</th>
                          <th>36+</th>
                          <th>Base</th>
                          <th>Final</th>
                        </tr>
                      </thead>
                      <tbody>
                        {tournamentScores.filter(s => s.participated).map((score) => (
                          <tr key={score.id}>
                            <td>
                              {score.position === 1 && <span style={{ fontSize: '1.1rem' }}>🥇</span>}
                              {score.position === 2 && <span style={{ fontSize: '1.1rem' }}>🥈</span>}
                              {score.position === 3 && <span style={{ fontSize: '1.1rem' }}>🥉</span>}
                              {score.position !== null && score.position > 3 && (
                                <span style={{ color: '#6b7280' }}>{score.position}</span>
                              )}
                              {score.position === null && <span style={{ color: '#9ca3af' }}>—</span>}
                            </td>
                            <td style={{ fontWeight: 500 }}>{score.golferName}</td>
                            <td>
                              {score.scored36Plus ? (
                                <span style={{ color: 'var(--primary-green)' }}>✓</span>
                              ) : (
                                <span style={{ color: '#9ca3af' }}>—</span>
                              )}
                            </td>
                            <td style={{ color: '#6b7280' }}>
                              {score.basePoints}
                              {score.bonusPoints > 0 && <span style={{ color: 'var(--primary-green)' }}> +{score.bonusPoints}</span>}
                            </td>
                            <td style={{ fontWeight: 600, color: 'var(--primary-green)' }}>
                              {score.multipliedPoints}
                              {viewingTournament.multiplier > 1 && (
                                <span style={{ fontSize: '0.75rem', color: 'var(--accent-gold)', marginLeft: '0.25rem' }}>
                                  ({viewingTournament.multiplier}x)
                                </span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={handleCloseDetailsModal}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
};

export default TournamentsAdminPage;
