// Admin: Seasons management page

import React, { useCallback, useEffect, useState } from 'react';
import AdminLayout from '../../components/AdminLayout/AdminLayout';
import { validators, sanitizers, getInputClassName } from '../../utils/validation';
import { useApiClient } from '../../hooks/useApiClient';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';

interface Season {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  isActive: boolean;
  status: 'setup' | 'active' | 'complete';
}

interface SeasonFormData {
  name: string;
  startDate: string;
  endDate: string;
}

const initialFormData: SeasonFormData = {
  name: '',
  startDate: '',
  endDate: '',
};

const SeasonsAdminPage: React.FC = () => {
  const { get, post, put, del, isAuthReady } = useApiClient();
  useDocumentTitle('Admin: Seasons');
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingSeason, setEditingSeason] = useState<Season | null>(null);
  const [formData, setFormData] = useState<SeasonFormData>(initialFormData);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Form validation state
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const validateField = (field: string, value: string): string => {
    switch (field) {
      case 'name':
        if (!value.trim()) return 'Season name is required';
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

    if (field === 'startDate' && touched.endDate) {
      setFieldErrors((prev) => ({ ...prev, endDate: validateField('endDate', formData.endDate) }));
    }
  };

  const handleFieldBlur = (field: string) => {
    setTouched({ ...touched, [field]: true });
    setFieldErrors({
      ...fieldErrors,
      [field]: validateField(field, formData[field as keyof SeasonFormData]),
    });
  };

  const getFieldClass = (field: string): string => {
    if (!touched[field]) return 'form-input';
    return getInputClassName(touched[field], fieldErrors[field], 'form-input');
  };

  const validateAllFields = (): boolean => {
    const newErrors: Record<string, string> = {};
    const fieldsToValidate = ['name', 'startDate', 'endDate'];

    fieldsToValidate.forEach((field) => {
      const error = validateField(field, formData[field as keyof SeasonFormData]);
      if (error) newErrors[field] = error;
    });

    const newTouched: Record<string, boolean> = {};
    fieldsToValidate.forEach((field) => {
      newTouched[field] = true;
    });
    setTouched({ ...touched, ...newTouched });
    setFieldErrors(newErrors);

    return Object.keys(newErrors).length === 0;
  };

  const fetchSeasons = useCallback(async () => {
    try {
      const response = await get<Season[]>('seasons-list');

      if (response.cancelled) return;

      if (response.success && response.data) {
        setSeasons(response.data);
      }
    } catch (err) {
      console.error('Failed to fetch seasons:', err);
    } finally {
      setLoading(false);
    }
  }, [get]);

  useEffect(() => {
    if (isAuthReady) {
      fetchSeasons();
    }
  }, [isAuthReady, fetchSeasons]);

  const handleOpenModal = (season?: Season) => {
    if (season) {
      setEditingSeason(season);
      setFormData({
        name: season.name,
        startDate: season.startDate.split('T')[0],
        endDate: season.endDate.split('T')[0],
      });
    } else {
      setEditingSeason(null);
      setFormData(initialFormData);
    }
    setError('');
    setTouched({});
    setFieldErrors({});
    setShowModal(true);
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setEditingSeason(null);
    setFormData(initialFormData);
    setError('');
    setTouched({});
    setFieldErrors({});
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!validateAllFields()) {
      setError('Please fix the validation errors before submitting');
      return;
    }

    try {
      if (editingSeason) {
        const response = await put<Season>('seasons-update', {
          id: editingSeason.id,
          name: formData.name,
          startDate: formData.startDate,
          endDate: formData.endDate,
        });
        if (!response.success) throw new Error(response.error || 'Failed to update season');
        setSuccess('Season updated successfully!');
      } else {
        const response = await post<Season>('seasons-create', {
          name: formData.name,
          startDate: formData.startDate,
          endDate: formData.endDate,
        });
        if (!response.success) throw new Error(response.error || 'Failed to create season');
        setSuccess('Season created successfully!');
      }

      handleCloseModal();
      fetchSeasons();
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    }
  };

  const handleSetActive = async (season: Season) => {
    if (
      !window.confirm(
        `Are you sure you want to set "${season.name}" as the active season? This will deactivate any other active season.`
      )
    ) {
      return;
    }

    try {
      const response = await post<Season>('seasons-set-active', { id: season.id });
      if (!response.success) throw new Error(response.error || 'Failed to set active season');
      setSuccess(`"${season.name}" is now the active season!`);
      fetchSeasons();
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    }
  };

  const handleDeleteSeason = async (season: Season) => {
    if (
      !window.confirm(
        `Are you sure you want to delete "${season.name}"? This action cannot be undone.`
      )
    ) {
      return;
    }

    try {
      const response = await del<void>(`seasons-delete?id=${season.id}`);
      if (!response.success) throw new Error(response.error || 'Failed to delete season');
      setSuccess('Season deleted successfully!');
      fetchSeasons();
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

  const getStatusBadge = (status: string, isActive: boolean) => {
    if (isActive) {
      return <span className="badge badge-success">Active</span>;
    }
    switch (status) {
      case 'setup':
        return <span className="badge badge-gray">Setup</span>;
      case 'active':
        return <span className="badge badge-success">Active</span>;
      case 'complete':
        return <span className="badge badge-info">Complete</span>;
      default:
        return <span className="badge badge-gray">{status}</span>;
    }
  };

  // Calculate stats
  const setupCount = seasons.filter((s) => s.status === 'setup').length;
  const activeCount = seasons.filter((s) => s.isActive).length;
  const completeCount = seasons.filter((s) => s.status === 'complete').length;

  return (
    <AdminLayout title="Seasons">
      {success && <div className="alert alert-success">{success}</div>}
      {error && <div className="alert alert-error">{error}</div>}

      {/* Stats Row */}
      <div className="stats-row" style={{ marginBottom: '1.5rem' }}>
        <div className="stat-box">
          <div className="stat-box-icon">📅</div>
          <div className="stat-box-value">{seasons.length}</div>
          <div className="stat-box-label">Total Seasons</div>
        </div>
        <div className="stat-box">
          <div className="stat-box-icon">🔧</div>
          <div className="stat-box-value">{setupCount}</div>
          <div className="stat-box-label">Setup</div>
        </div>
        <div className="stat-box">
          <div className="stat-box-icon">🟢</div>
          <div className="stat-box-value">{activeCount}</div>
          <div className="stat-box-label">Active</div>
        </div>
        <div className="stat-box">
          <div className="stat-box-icon">✅</div>
          <div className="stat-box-value">{completeCount}</div>
          <div className="stat-box-label">Complete</div>
        </div>
      </div>

      <div className="admin-card">
        <div className="admin-card-header">
          <h2>All Seasons ({seasons.length})</h2>
          <button className="btn btn-primary" onClick={() => handleOpenModal()}>
            + Create Season
          </button>
        </div>

        {loading ? (
          <div className="admin-card-body">
            <p>Loading seasons...</p>
          </div>
        ) : seasons.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">📅</div>
            <h3>No Seasons Yet</h3>
            <p>Create a season to organize tournaments and track standings.</p>
            <button className="btn btn-primary" onClick={() => handleOpenModal()}>
              Create Your First Season
            </button>
          </div>
        ) : (
          <table className="admin-table">
            <thead>
              <tr>
                <th>Season</th>
                <th>Dates</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {seasons.map((season) => (
                <tr
                  key={season.id}
                  style={season.isActive ? { background: 'rgba(22, 163, 74, 0.05)' } : undefined}
                >
                  <td style={{ fontWeight: 500 }}>
                    {season.name}
                    {season.isActive && (
                      <span
                        className="badge badge-success"
                        style={{ marginLeft: '0.5rem', fontSize: '0.75rem' }}
                      >
                        Active
                      </span>
                    )}
                  </td>
                  <td>
                    {formatDate(season.startDate)} – {formatDate(season.endDate)}
                  </td>
                  <td>{getStatusBadge(season.status, season.isActive)}</td>
                  <td>
                    <div className="table-actions">
                      {!season.isActive && (
                        <button
                          className="btn btn-primary btn-sm"
                          onClick={() => handleSetActive(season)}
                        >
                          Set Active
                        </button>
                      )}
                      <button
                        className="btn btn-secondary btn-sm"
                        onClick={() => handleOpenModal(season)}
                      >
                        Edit
                      </button>
                      <button
                        className="btn btn-danger btn-sm"
                        onClick={() => handleDeleteSeason(season)}
                        disabled={season.isActive}
                        style={{
                          background: season.isActive ? '#9ca3af' : '#dc2626',
                          color: 'white',
                          cursor: season.isActive ? 'not-allowed' : 'pointer',
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
              <h2>{editingSeason ? 'Edit Season' : 'Create New Season'}</h2>
              <button className="modal-close" onClick={handleCloseModal}>
                ×
              </button>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="modal-body">
                {error && <div className="alert alert-error">{error}</div>}

                <div className="form-group">
                  <label htmlFor="name">
                    Season Name<span className="required-indicator">*</span>
                  </label>
                  <input
                    type="text"
                    id="name"
                    className={getFieldClass('name')}
                    value={formData.name}
                    onChange={(e) => handleFieldChange('name', e.target.value)}
                    onBlur={() => handleFieldBlur('name')}
                    placeholder="2025/26 Season"
                  />
                  {touched.name && fieldErrors.name && (
                    <span className="field-error">{fieldErrors.name}</span>
                  )}
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label htmlFor="startDate">
                      Start Date<span className="required-indicator">*</span>
                    </label>
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
                    <label htmlFor="endDate">
                      End Date<span className="required-indicator">*</span>
                    </label>
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
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={handleCloseModal}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  {editingSeason ? 'Save Changes' : 'Create Season'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </AdminLayout>
  );
};

export default SeasonsAdminPage;
