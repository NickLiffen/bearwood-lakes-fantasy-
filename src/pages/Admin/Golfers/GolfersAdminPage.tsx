// Admin: Golfers management page

import React, { useCallback, useEffect, useState } from 'react';
import AdminLayout from '../../../components/AdminLayout/AdminLayout';
import LoadingSpinner from '../../../components/ui/LoadingSpinner';
import { validators, sanitizers, getInputClassName } from '../../../utils/validation';
import { useApiClient } from '../../../hooks/useApiClient';
import { useDocumentTitle } from '../../../hooks/useDocumentTitle';

interface Golfer2025Stats {
  timesBonusScored: number;
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
  isActive: boolean;
  stats2024: Golfer2025Stats;
  stats2025: Golfer2025Stats;
}

// Stats loaded from tournament scores
interface GolferSeasonStats {
  tournamentsPlayed: number;
  totalPoints: number;
  firstPlaceFinishes: number;
  secondPlaceFinishes: number;
  thirdPlaceFinishes: number;
  timesBonusScored: number;
}

interface GolferFormData {
  firstName: string;
  lastName: string;
  picture: string;
  price: string;
  isActive: boolean;
  timesBonusScored: string;
  timesFinished1st: string;
  timesFinished2nd: string;
  timesFinished3rd: string;
  timesPlayed: string;
}

const initialFormData: GolferFormData = {
  firstName: '',
  lastName: '',
  picture: '',
  price: '',
  isActive: true,
  timesBonusScored: '0',
  timesFinished1st: '0',
  timesFinished2nd: '0',
  timesFinished3rd: '0',
  timesPlayed: '0',
};

const GolfersAdminPage: React.FC = () => {
  const { get, post, put, request, isAuthReady } = useApiClient();
  useDocumentTitle('Admin: Golfers');
  const [Golfers, setGolfers] = useState<Golfer[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingGolfer, setEditingGolfer] = useState<Golfer | null>(null);
  const [formData, setFormData] = useState<GolferFormData>(initialFormData);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // View mode state
  const [viewingGolfer, setViewingGolfer] = useState<Golfer | null>(null);
  const [showViewModal, setShowViewModal] = useState(false);
  const [GolferSeasonStats, setGolferSeasonStats] = useState<GolferSeasonStats | null>(null);
  const [loadingStats, setLoadingStats] = useState(false);

  // Delete confirmation state
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [GolferToDelete, setGolferToDelete] = useState<Golfer | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Batch upload state
  const [showBatchModal, setShowBatchModal] = useState(false);
  const [batchStep, setBatchStep] = useState<'upload' | 'preview' | 'uploading'>('upload');
  const [batchData, setBatchData] = useState<GolferFormData[]>([]);
  const [batchErrors, setBatchErrors] = useState<string[]>([]);
  const [batchProgress, setBatchProgress] = useState(0);
  const [batchFile, setBatchFile] = useState<File | null>(null);

  // Calculate prices state
  const [calculatingPrices, setCalculatingPrices] = useState(false);
  const [priceResult, setPriceResult] = useState<{
    updated: number;
    minPrice: number;
    maxPrice: number;
    summary: string;
  } | null>(null);

  // Form validation state
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  // Form field validation rules
  const validateField = (field: string, value: string): string => {
    switch (field) {
      case 'firstName': {
        if (!value.trim()) return 'First name is required';
        const firstNameValidator = validators.lettersOnly();
        const firstNameError = firstNameValidator(value);
        if (firstNameError) return 'First name can only contain letters';
        if (value.length < 2) return 'First name must be at least 2 characters';
        return '';
      }
      case 'lastName': {
        if (!value.trim()) return 'Last name is required';
        const lastNameValidator = validators.lettersOnly();
        const lastNameError = lastNameValidator(value);
        if (lastNameError) return 'Last name can only contain letters';
        if (value.length < 2) return 'Last name must be at least 2 characters';
        return '';
      }
      case 'price': {
        if (!value.trim()) return 'Price is required';
        const priceNum = parseFloat(value);
        if (isNaN(priceNum) || priceNum <= 0) return 'Price must be a positive number';
        if (priceNum > 50) return 'Price cannot exceed $50M';
        return '';
      }
      case 'picture': {
        if (value) {
          const urlValidator = validators.url();
          const urlError = urlValidator(value);
          if (urlError) return 'Please enter a valid URL';
        }
        return '';
      }
      default:
        return '';
    }
  };

  const handleFieldChange = (field: string, value: string) => {
    // Apply sanitizers for name fields
    let sanitizedValue = value;
    if (field === 'firstName' || field === 'lastName') {
      sanitizedValue = sanitizers.trimAndCapitalize(value);
    } else if (field === 'picture') {
      sanitizedValue = sanitizers.trim(value);
    }

    setFormData({ ...formData, [field]: sanitizedValue });

    // Validate on change if field was already touched
    if (touched[field]) {
      setFieldErrors({ ...fieldErrors, [field]: validateField(field, sanitizedValue) });
    }
  };

  const handleFieldBlur = (field: string) => {
    setTouched({ ...touched, [field]: true });
    setFieldErrors({
      ...fieldErrors,
      [field]: validateField(field, formData[field as keyof GolferFormData] as string),
    });
  };

  const getFieldClass = (field: string): string => {
    if (!touched[field]) return 'form-input';
    return getInputClassName(touched[field], fieldErrors[field], 'form-input');
  };

  const validateAllFields = (): boolean => {
    const newErrors: Record<string, string> = {};
    const fieldsToValidate = ['firstName', 'lastName', 'price'];

    fieldsToValidate.forEach((field) => {
      const error = validateField(field, formData[field as keyof GolferFormData] as string);
      if (error) newErrors[field] = error;
    });

    // Mark all fields as touched
    const newTouched: Record<string, boolean> = {};
    fieldsToValidate.forEach((field) => {
      newTouched[field] = true;
    });
    setTouched({ ...touched, ...newTouched });
    setFieldErrors(newErrors);

    return Object.keys(newErrors).length === 0;
  };

  const fetchGolfers = useCallback(async () => {
    try {
      const response = await get<Golfer[]>('golfers-list?all=true');

      // Ignore cancelled requests
      if (response.cancelled) return;

      if (response.success && response.data) {
        setGolfers(response.data);
      }
    } catch (err) {
      console.error('Failed to fetch Golfers:', err);
    } finally {
      setLoading(false);
    }
  }, [get]);

  useEffect(() => {
    if (isAuthReady) {
      fetchGolfers();
    }
  }, [isAuthReady, fetchGolfers]);

  const handleCalculatePrices = async () => {
    const pricingSeason = new Date().getFullYear() - 1;
    if (
      !window.confirm(
        `Calculate prices for all golfers based on ${pricingSeason} season performance? This will update all golfer prices.`
      )
    )
      return;
    setCalculatingPrices(true);
    setPriceResult(null);
    try {
      const response = await post<{
        updated: number;
        minPrice: number;
        maxPrice: number;
        summary: string;
      }>('golfers-calculate-prices', { season: pricingSeason });
      if (response.cancelled) return;
      if (response.success && response.data) {
        setPriceResult(response.data);
        fetchGolfers();
      }
    } catch (err) {
      console.error('Failed to calculate prices:', err);
    } finally {
      setCalculatingPrices(false);
    }
  };

  // View Golfer handlers
  const handleViewGolfer = async (Golfer: Golfer) => {
    setViewingGolfer(Golfer);
    setShowViewModal(true);
    setLoadingStats(true);
    setGolferSeasonStats(null);

    try {
      const response = await get<GolferSeasonStats>(`golfers-stats?golferId=${Golfer.id}`);
      if (response.success && response.data) {
        setGolferSeasonStats(response.data);
      }
    } catch (err) {
      console.error('Failed to fetch Golfer stats:', err);
    } finally {
      setLoadingStats(false);
    }
  };

  const handleCloseViewModal = () => {
    setShowViewModal(false);
    setViewingGolfer(null);
    setGolferSeasonStats(null);
  };

  const handleEditFromView = () => {
    if (viewingGolfer) {
      handleCloseViewModal();
      handleOpenModal(viewingGolfer);
    }
  };

  const handleOpenModal = (Golfer?: Golfer) => {
    if (Golfer) {
      setEditingGolfer(Golfer);
      setFormData({
        firstName: Golfer.firstName,
        lastName: Golfer.lastName,
        picture: Golfer.picture,
        price: (Golfer.price / 1_000_000).toString(),
        isActive: Golfer.isActive,
        timesBonusScored: (Golfer.stats2025?.timesBonusScored || 0).toString(),
        timesFinished1st: (Golfer.stats2025?.timesFinished1st || 0).toString(),
        timesFinished2nd: (Golfer.stats2025?.timesFinished2nd || 0).toString(),
        timesFinished3rd: (Golfer.stats2025?.timesFinished3rd || 0).toString(),
        timesPlayed: (Golfer.stats2025?.timesPlayed || 0).toString(),
      });
    } else {
      setEditingGolfer(null);
      setFormData(initialFormData);
    }
    setError('');
    setTouched({});
    setFieldErrors({});
    setShowModal(true);
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setEditingGolfer(null);
    setFormData(initialFormData);
    setError('');
    setTouched({});
    setFieldErrors({});
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // Validate all fields before submission
    if (!validateAllFields()) {
      setError('Please fix the validation errors before submitting');
      return;
    }

    const priceInPounds = parseFloat(formData.price) * 1_000_000;

    const stats2025 = {
      timesBonusScored: parseInt(formData.timesBonusScored) || 0,
      timesFinished1st: parseInt(formData.timesFinished1st) || 0,
      timesFinished2nd: parseInt(formData.timesFinished2nd) || 0,
      timesFinished3rd: parseInt(formData.timesFinished3rd) || 0,
      timesPlayed: parseInt(formData.timesPlayed) || 0,
    };

    try {
      if (editingGolfer) {
        // Update existing Golfer
        const response = await put<Golfer>('golfers-update', {
          id: editingGolfer.id,
          firstName: formData.firstName,
          lastName: formData.lastName,
          picture: formData.picture,
          price: priceInPounds,
          isActive: formData.isActive,
          stats2025,
        });
        if (!response.success) throw new Error(response.error || 'Failed to update Golfer');
        setSuccess('Golfer updated successfully!');
      } else {
        // Create new Golfer
        const response = await post<Golfer>('golfers-create', {
          firstName: formData.firstName,
          lastName: formData.lastName,
          picture: formData.picture,
          price: priceInPounds,
          isActive: formData.isActive,
          stats2025,
        });
        if (!response.success) throw new Error(response.error || 'Failed to create Golfer');
        setSuccess('Golfer created successfully!');
      }

      handleCloseModal();
      fetchGolfers();
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    }
  };

  const formatPrice = (price: number) => {
    return `$${(price / 1_000_000).toFixed(1)}M`;
  };

  // Delete handlers
  const handleOpenDeleteModal = (Golfer: Golfer) => {
    setGolferToDelete(Golfer);
    setShowDeleteModal(true);
  };

  const handleCloseDeleteModal = () => {
    setShowDeleteModal(false);
    setGolferToDelete(null);
  };

  const handleDeleteGolfer = async () => {
    if (!GolferToDelete) return;

    setDeleting(true);
    try {
      const response = await request<void>('golfers-delete', {
        method: 'DELETE',
        body: JSON.stringify({ id: GolferToDelete.id }),
      });

      if (!response.success) throw new Error(response.error || 'Failed to delete Golfer');

      setSuccess(`${GolferToDelete.firstName} ${GolferToDelete.lastName} deleted successfully!`);
      handleCloseDeleteModal();
      fetchGolfers();
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete Golfer');
    } finally {
      setDeleting(false);
    }
  };

  // Batch Upload Functions
  const handleOpenBatchModal = () => {
    setBatchStep('upload');
    setBatchData([]);
    setBatchErrors([]);
    setBatchFile(null);
    setBatchProgress(0);
    setShowBatchModal(true);
  };

  const handleCloseBatchModal = () => {
    setShowBatchModal(false);
    setBatchStep('upload');
    setBatchData([]);
    setBatchErrors([]);
    setBatchFile(null);
  };

  const parseCSV = (text: string): string[][] => {
    const lines = text.trim().split('\n');
    return lines.map((line) => {
      const result: string[] = [];
      let current = '';
      let inQuotes = false;

      for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"') {
          inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
          result.push(current.trim());
          current = '';
        } else {
          current += char;
        }
      }
      result.push(current.trim());
      return result;
    });
  };

  const validateAndParseBatch = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const rows = parseCSV(text);

      if (rows.length < 2) {
        setBatchErrors(['CSV file must have a header row and at least one data row']);
        return;
      }

      const headers = rows[0].map((h) => h.toLowerCase().trim());
      const dataRows = rows.slice(1);

      // Check for required columns
      const requiredColumns = ['firstname', 'lastname', 'price'];
      const missingColumns = requiredColumns.filter((col) => !headers.includes(col));

      if (missingColumns.length > 0) {
        setBatchErrors([`Missing required columns: ${missingColumns.join(', ')}`]);
        return;
      }

      // Limit to 10 rows
      if (dataRows.length > 10) {
        setBatchErrors([`Maximum 10 Golfers per batch upload. Found ${dataRows.length} rows.`]);
        return;
      }

      // Find column indices
      const colIndex = {
        firstName: headers.indexOf('firstname'),
        lastName: headers.indexOf('lastname'),
        picture: headers.indexOf('picture'),
        price: headers.indexOf('price'),
        isActive: headers.indexOf('isactive'),
        timesBonusScored: headers.indexOf('timesbonusscored'),
        timesFinished1st: headers.indexOf('timesfinished1st'),
        timesFinished2nd: headers.indexOf('timesfinished2nd'),
        timesFinished3rd: headers.indexOf('timesfinished3rd'),
        timesPlayed: headers.indexOf('timesplayed'),
      };

      const errors: string[] = [];
      const parsedGolfers: GolferFormData[] = [];

      dataRows.forEach((row, index) => {
        const rowNum = index + 2; // Account for header and 0-indexing

        const firstName = colIndex.firstName >= 0 ? row[colIndex.firstName]?.trim() : '';
        const lastName = colIndex.lastName >= 0 ? row[colIndex.lastName]?.trim() : '';
        const priceStr = colIndex.price >= 0 ? row[colIndex.price]?.trim() : '';

        // Validate required fields
        if (!firstName) {
          errors.push(`Row ${rowNum}: First name is required`);
        }
        if (!lastName) {
          errors.push(`Row ${rowNum}: Last name is required`);
        }
        if (!priceStr) {
          errors.push(`Row ${rowNum}: Price is required`);
        }

        // Validate price is a number
        const price = parseFloat(priceStr);
        if (isNaN(price) || price <= 0) {
          errors.push(`Row ${rowNum}: Price must be a positive number (got "${priceStr}")`);
        }

        // Parse optional fields with defaults
        const picture = colIndex.picture >= 0 ? row[colIndex.picture]?.trim() || '' : '';
        const isActiveStr =
          colIndex.isActive >= 0 ? row[colIndex.isActive]?.trim().toLowerCase() : 'true';
        const isActive = isActiveStr !== 'false' && isActiveStr !== '0' && isActiveStr !== 'no';

        // Parse stats with validation
        const parseStatField = (colName: keyof typeof colIndex, fieldName: string): string => {
          const idx = colIndex[colName];
          if (idx >= 0 && row[idx]) {
            const val = parseInt(row[idx].trim());
            if (isNaN(val) || val < 0) {
              errors.push(`Row ${rowNum}: ${fieldName} must be a non-negative number`);
              return '0';
            }
            return val.toString();
          }
          return '0';
        };

        parsedGolfers.push({
          firstName,
          lastName,
          picture,
          price: price.toString(),
          isActive,
          timesBonusScored: parseStatField('timesBonusScored', 'Times Bonus Scored'),
          timesFinished1st: parseStatField('timesFinished1st', '1st Place Finishes'),
          timesFinished2nd: parseStatField('timesFinished2nd', '2nd Place Finishes'),
          timesFinished3rd: parseStatField('timesFinished3rd', '3rd Place Finishes'),
          timesPlayed: parseStatField('timesPlayed', 'Times Played'),
        });
      });

      if (errors.length > 0) {
        setBatchErrors(errors);
        setBatchData([]);
      } else {
        setBatchErrors([]);
        setBatchData(parsedGolfers);
        setBatchStep('preview');
      }
    };

    reader.onerror = () => {
      setBatchErrors(['Failed to read file']);
    };

    reader.readAsText(file);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!file.name.endsWith('.csv')) {
        setBatchErrors(['Please upload a CSV file']);
        return;
      }
      setBatchFile(file);
      setBatchErrors([]);
      validateAndParseBatch(file);
    }
  };

  const handleBatchUpload = async () => {
    setBatchStep('uploading');
    setBatchProgress(0);
    const errors: string[] = [];
    let successCount = 0;

    for (let i = 0; i < batchData.length; i++) {
      const Golfer = batchData[i];
      const priceInPounds = parseFloat(Golfer.price) * 1_000_000;

      try {
        const response = await post<Golfer>('golfers-create', {
          firstName: Golfer.firstName,
          lastName: Golfer.lastName,
          picture: Golfer.picture,
          price: priceInPounds,
          isActive: Golfer.isActive,
          stats2025: {
            timesBonusScored: parseInt(Golfer.timesBonusScored) || 0,
            timesFinished1st: parseInt(Golfer.timesFinished1st) || 0,
            timesFinished2nd: parseInt(Golfer.timesFinished2nd) || 0,
            timesFinished3rd: parseInt(Golfer.timesFinished3rd) || 0,
            timesPlayed: parseInt(Golfer.timesPlayed) || 0,
          },
        });

        if (!response.success) {
          errors.push(
            `${Golfer.firstName} ${Golfer.lastName}: ${response.error || 'Failed to create'}`
          );
        } else {
          successCount++;
        }
      } catch {
        errors.push(`${Golfer.firstName} ${Golfer.lastName}: Network error`);
      }

      setBatchProgress(Math.round(((i + 1) / batchData.length) * 100));
    }

    if (errors.length > 0) {
      setBatchErrors(errors);
    }

    if (successCount > 0) {
      setSuccess(`Successfully uploaded ${successCount} Golfer${successCount > 1 ? 's' : ''}!`);
      setTimeout(() => setSuccess(''), 5000);
    }

    fetchGolfers();

    if (errors.length === 0) {
      handleCloseBatchModal();
    }
  };

  // Calculate stats
  const activeGolfers = Golfers.filter((p) => p.isActive).length;
  const inactiveGolfers = Golfers.filter((p) => !p.isActive).length;
  const avgPrice =
    Golfers.length > 0
      ? (Golfers.reduce((sum, p) => sum + p.price, 0) / Golfers.length / 1_000_000).toFixed(1)
      : '0';

  return (
    <AdminLayout title="Manage Golfers">
      {success && <div className="alert alert-success">{success}</div>}

      {/* Stats Row */}
      <div className="stats-row" style={{ marginBottom: '1.5rem' }}>
        <div className="stat-box">
          <div className="stat-box-icon">🏌️</div>
          <div className="stat-box-value">{Golfers.length}</div>
          <div className="stat-box-label">Total Golfers</div>
        </div>
        <div className="stat-box">
          <div className="stat-box-icon">✅</div>
          <div className="stat-box-value">{activeGolfers}</div>
          <div className="stat-box-label">Active</div>
        </div>
        <div className="stat-box">
          <div className="stat-box-icon">⏸️</div>
          <div className="stat-box-value">{inactiveGolfers}</div>
          <div className="stat-box-label">Inactive</div>
        </div>
        <div className="stat-box">
          <div className="stat-box-icon">💰</div>
          <div className="stat-box-value">${avgPrice}M</div>
          <div className="stat-box-label">Avg Price</div>
        </div>
      </div>

      <div className="admin-card">
        <div className="admin-card-header">
          <h2>All Golfers ({Golfers.length})</h2>
          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <button
              className="btn btn-primary"
              onClick={handleCalculatePrices}
              disabled={calculatingPrices}
            >
              💰 {calculatingPrices ? 'Calculating...' : 'Calculate Prices'}
            </button>
            <button className="btn btn-secondary" onClick={handleOpenBatchModal}>
              📤 Batch Upload
            </button>
            <button className="btn btn-primary" onClick={() => handleOpenModal()}>
              + Add Golfer
            </button>
          </div>
          {priceResult && (
            <div
              style={{
                marginTop: '0.5rem',
                padding: '0.5rem 1rem',
                background: '#d4edda',
                color: '#155724',
                borderRadius: '6px',
                fontSize: '0.9rem',
              }}
            >
              ✅ Updated {priceResult.updated} golfers. Price range: $
              {Math.round(priceResult.minPrice / 1_000_000)}M – $
              {Math.round(priceResult.maxPrice / 1_000_000)}M
            </div>
          )}
        </div>

        {loading ? (
          <div className="admin-card-body">
            <LoadingSpinner text="Loading golfers..." size="medium" fullPage={false} />
          </div>
        ) : Golfers.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">🏌️</div>
            <h3>No Golfers Yet</h3>
            <p>Add professional golfers that users can select for their fantasy teams.</p>
            <button className="btn btn-primary" onClick={() => handleOpenModal()}>
              Add Your First Golfer
            </button>
          </div>
        ) : (
          <table className="admin-table">
            <thead>
              <tr>
                <th>Golfer</th>
                <th>Price</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {Golfers.map((Golfer) => (
                <tr key={Golfer.id}>
                  <td>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.75rem',
                        cursor: 'pointer',
                      }}
                      onClick={() => handleViewGolfer(Golfer)}
                    >
                      {Golfer.picture ? (
                        <img
                          src={Golfer.picture}
                          alt={`${Golfer.firstName} ${Golfer.lastName}`}
                          loading="lazy"
                          style={{
                            width: '40px',
                            height: '40px',
                            borderRadius: '50%',
                            objectFit: 'cover',
                          }}
                        />
                      ) : (
                        <div
                          style={{
                            width: '40px',
                            height: '40px',
                            borderRadius: '50%',
                            background: '#e5e7eb',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          🏌️
                        </div>
                      )}
                      <span
                        style={{
                          fontWeight: 500,
                          color: 'var(--primary-green)',
                          textDecoration: 'underline',
                        }}
                      >
                        {Golfer.firstName} {Golfer.lastName}
                      </span>
                    </div>
                  </td>
                  <td style={{ fontWeight: 600, color: 'var(--primary-green)' }}>
                    {formatPrice(Golfer.price)}
                  </td>
                  <td>
                    <span className={`badge ${Golfer.isActive ? 'badge-success' : 'badge-gray'}`}>
                      {Golfer.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td>
                    <div className="table-actions">
                      <button
                        className="btn btn-secondary btn-sm"
                        onClick={() => handleOpenModal(Golfer)}
                      >
                        Edit
                      </button>
                      <button
                        className="btn btn-danger btn-sm"
                        onClick={() => handleOpenDeleteModal(Golfer)}
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
              <h2>{editingGolfer ? 'Edit Golfer' : 'Add New Golfer'}</h2>
              <button className="modal-close" onClick={handleCloseModal}>
                ×
              </button>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="modal-body">
                {error && <div className="alert alert-error">{error}</div>}

                <div className="form-row">
                  <div className="form-group">
                    <label htmlFor="firstName">
                      First Name<span className="required-indicator">*</span>
                    </label>
                    <input
                      type="text"
                      id="firstName"
                      className={getFieldClass('firstName')}
                      value={formData.firstName}
                      onChange={(e) => handleFieldChange('firstName', e.target.value)}
                      onBlur={() => handleFieldBlur('firstName')}
                      placeholder="Scottie"
                    />
                    {touched.firstName && fieldErrors.firstName && (
                      <span className="field-error">{fieldErrors.firstName}</span>
                    )}
                  </div>
                  <div className="form-group">
                    <label htmlFor="lastName">
                      Last Name<span className="required-indicator">*</span>
                    </label>
                    <input
                      type="text"
                      id="lastName"
                      className={getFieldClass('lastName')}
                      value={formData.lastName}
                      onChange={(e) => handleFieldChange('lastName', e.target.value)}
                      onBlur={() => handleFieldBlur('lastName')}
                      placeholder="Scheffler"
                    />
                    {touched.lastName && fieldErrors.lastName && (
                      <span className="field-error">{fieldErrors.lastName}</span>
                    )}
                  </div>
                </div>

                <div className="form-group">
                  <label htmlFor="picture">Photo URL</label>
                  <input
                    type="url"
                    id="picture"
                    className={getFieldClass('picture')}
                    value={formData.picture}
                    onChange={(e) => handleFieldChange('picture', e.target.value)}
                    onBlur={() => handleFieldBlur('picture')}
                    placeholder="https://example.com/photo.jpg"
                  />
                  {touched.picture && fieldErrors.picture && (
                    <span className="field-error">{fieldErrors.picture}</span>
                  )}
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label htmlFor="price">
                      Price (in millions $)<span className="required-indicator">*</span>
                    </label>
                    <input
                      type="number"
                      id="price"
                      className={getFieldClass('price')}
                      value={formData.price}
                      onChange={(e) => handleFieldChange('price', e.target.value)}
                      onBlur={() => handleFieldBlur('price')}
                      placeholder="12.5"
                      step="0.1"
                      min="0.1"
                    />
                    {touched.price && fieldErrors.price && (
                      <span className="field-error">{fieldErrors.price}</span>
                    )}
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label htmlFor="isActive">
                      Status<span className="required-indicator">*</span>
                    </label>
                    <select
                      id="isActive"
                      className="form-select"
                      value={formData.isActive ? 'active' : 'inactive'}
                      onChange={(e) =>
                        setFormData({ ...formData, isActive: e.target.value === 'active' })
                      }
                    >
                      <option value="active">Active</option>
                      <option value="inactive">Inactive</option>
                    </select>
                  </div>
                  <div className="form-group" />
                </div>

                {/* 2025 Performance Stats Section */}
                <div
                  style={{
                    marginTop: '1.5rem',
                    paddingTop: '1.5rem',
                    borderTop: '1px solid #e5e7eb',
                  }}
                >
                  <h3
                    style={{
                      fontSize: '1rem',
                      fontWeight: 600,
                      color: 'var(--dark-text)',
                      marginBottom: '1rem',
                    }}
                  >
                    📊 2025 Performance Stats
                  </h3>

                  <div className="form-row">
                    <div className="form-group">
                      <label htmlFor="timesPlayed">Times Played in 2025</label>
                      <input
                        type="number"
                        id="timesPlayed"
                        value={formData.timesPlayed}
                        onChange={(e) => setFormData({ ...formData, timesPlayed: e.target.value })}
                        min="0"
                        placeholder="0"
                      />
                      <span style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                        Roll up, medal, board events
                      </span>
                    </div>
                    <div className="form-group">
                      <label htmlFor="timesBonusScored">Times Bonus Scored</label>
                      <input
                        type="number"
                        id="timesBonusScored"
                        value={formData.timesBonusScored}
                        onChange={(e) =>
                          setFormData({ ...formData, timesBonusScored: e.target.value })
                        }
                        min="0"
                        placeholder="0"
                      />
                    </div>
                  </div>

                  <div className="form-row" style={{ marginTop: '0.75rem' }}>
                    <div className="form-group">
                      <label htmlFor="timesFinished1st">🥇 1st Place Finishes</label>
                      <input
                        type="number"
                        id="timesFinished1st"
                        value={formData.timesFinished1st}
                        onChange={(e) =>
                          setFormData({ ...formData, timesFinished1st: e.target.value })
                        }
                        min="0"
                        placeholder="0"
                      />
                    </div>
                    <div className="form-group">
                      <label htmlFor="timesFinished2nd">🥈 2nd Place Finishes</label>
                      <input
                        type="number"
                        id="timesFinished2nd"
                        value={formData.timesFinished2nd}
                        onChange={(e) =>
                          setFormData({ ...formData, timesFinished2nd: e.target.value })
                        }
                        min="0"
                        placeholder="0"
                      />
                    </div>
                  </div>

                  <div className="form-row" style={{ marginTop: '0.75rem' }}>
                    <div className="form-group">
                      <label htmlFor="timesFinished3rd">🥉 3rd Place Finishes</label>
                      <input
                        type="number"
                        id="timesFinished3rd"
                        value={formData.timesFinished3rd}
                        onChange={(e) =>
                          setFormData({ ...formData, timesFinished3rd: e.target.value })
                        }
                        min="0"
                        placeholder="0"
                      />
                    </div>
                    <div className="form-group" />
                  </div>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={handleCloseModal}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  {editingGolfer ? 'Save Changes' : 'Add Golfer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Batch Upload Modal */}
      {showBatchModal && (
        <div className="modal-overlay" onClick={handleCloseBatchModal}>
          <div className="modal" style={{ maxWidth: '700px' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>📤 Batch Upload Golfers</h2>
              <button className="modal-close" onClick={handleCloseBatchModal}>
                ×
              </button>
            </div>
            <div className="modal-body">
              {batchStep === 'upload' && (
                <>
                  <div style={{ marginBottom: '1.5rem' }}>
                    <p style={{ color: '#374151', marginBottom: '1rem' }}>
                      Upload a CSV file with Golfer data. Maximum <strong>10 Golfers</strong> per
                      batch.
                    </p>
                    <div
                      style={{
                        background: '#f3f4f6',
                        borderRadius: '8px',
                        padding: '1rem',
                        fontSize: '0.85rem',
                      }}
                    >
                      <strong>Required columns:</strong> firstName, lastName, price (in millions)
                      <br />
                      <strong>Optional columns:</strong> picture, isActive, timesBonusScored,
                      timesFinished1st, timesFinished2nd, timesFinished3rd, timesPlayed
                    </div>
                  </div>

                  <div
                    style={{
                      border: '2px dashed #d1d5db',
                      borderRadius: '12px',
                      padding: '2rem',
                      textAlign: 'center',
                      background: batchFile ? '#ecfdf5' : '#f9fafb',
                      transition: 'all 0.2s ease',
                    }}
                  >
                    <input
                      type="file"
                      accept=".csv"
                      onChange={handleFileChange}
                      style={{ display: 'none' }}
                      id="csv-upload"
                    />
                    <label
                      htmlFor="csv-upload"
                      style={{
                        cursor: 'pointer',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: '0.75rem',
                      }}
                    >
                      <span style={{ fontSize: '2.5rem' }}>{batchFile ? '✅' : '📁'}</span>
                      {batchFile ? (
                        <span style={{ color: '#065f46', fontWeight: 500 }}>{batchFile.name}</span>
                      ) : (
                        <>
                          <span style={{ fontWeight: 500, color: '#374151' }}>
                            Click to select CSV file
                          </span>
                          <span style={{ fontSize: '0.85rem', color: '#6b7280' }}>
                            or drag and drop here
                          </span>
                        </>
                      )}
                    </label>
                  </div>

                  {batchErrors.length > 0 && (
                    <div style={{ marginTop: '1rem' }}>
                      <div
                        className="alert alert-error"
                        style={{ maxHeight: '150px', overflow: 'auto' }}
                      >
                        <strong>Validation Errors:</strong>
                        <ul style={{ margin: '0.5rem 0 0 1.25rem', padding: 0 }}>
                          {batchErrors.map((err, i) => (
                            <li key={i}>{err}</li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  )}

                  <div
                    style={{
                      marginTop: '1.5rem',
                      padding: '1rem',
                      background: '#fffbeb',
                      borderRadius: '8px',
                      border: '1px solid #fde68a',
                    }}
                  >
                    <strong style={{ color: '#92400e' }}>📋 Sample CSV Format:</strong>
                    <pre
                      style={{
                        margin: '0.5rem 0 0',
                        fontSize: '0.75rem',
                        color: '#92400e',
                        overflow: 'auto',
                      }}
                    >
                      {`firstName,lastName,price,picture,isActive,timesPlayed,timesBonusScored,timesFinished1st,timesFinished2nd,timesFinished3rd
John,Smith,8.5,,true,12,3,1,2,1
Jane,Doe,7.0,,true,10,2,0,1,0
Tom,Junior,6.0,,true,8,1,0,0,1`}
                    </pre>
                  </div>
                </>
              )}

              {batchStep === 'preview' && (
                <>
                  <div className="alert alert-success" style={{ marginBottom: '1rem' }}>
                    ✅ CSV validated successfully! Review {batchData.length} Golfer
                    {batchData.length > 1 ? 's' : ''} below.
                  </div>

                  <div
                    style={{
                      maxHeight: '350px',
                      overflow: 'auto',
                      border: '1px solid #e5e7eb',
                      borderRadius: '8px',
                    }}
                  >
                    <table className="admin-table" style={{ margin: 0 }}>
                      <thead>
                        <tr>
                          <th>#</th>
                          <th>Name</th>
                          <th>Price</th>
                          <th>Played</th>
                          <th>36+</th>
                          <th>🥇</th>
                          <th>🥈</th>
                          <th>🥉</th>
                        </tr>
                      </thead>
                      <tbody>
                        {batchData.map((Golfer, index) => (
                          <tr key={index}>
                            <td style={{ color: '#6b7280' }}>{index + 1}</td>
                            <td style={{ fontWeight: 500 }}>
                              {Golfer.firstName} {Golfer.lastName}
                              {!Golfer.isActive && (
                                <span className="badge badge-gray" style={{ marginLeft: '0.5rem' }}>
                                  Inactive
                                </span>
                              )}
                            </td>
                            <td style={{ color: 'var(--primary-green)', fontWeight: 600 }}>
                              ${parseFloat(Golfer.price).toFixed(1)}M
                            </td>
                            <td>{Golfer.timesPlayed}</td>
                            <td>{Golfer.timesBonusScored}</td>
                            <td>{Golfer.timesFinished1st}</td>
                            <td>{Golfer.timesFinished2nd}</td>
                            <td>{Golfer.timesFinished3rd}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}

              {batchStep === 'uploading' && (
                <div style={{ textAlign: 'center', padding: '2rem' }}>
                  <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>⏳</div>
                  <h3 style={{ marginBottom: '1rem' }}>Uploading Golfers...</h3>
                  <div
                    style={{
                      background: '#e5e7eb',
                      borderRadius: '9999px',
                      height: '8px',
                      overflow: 'hidden',
                      marginBottom: '0.5rem',
                    }}
                  >
                    <div
                      style={{
                        background: 'var(--primary-green)',
                        height: '100%',
                        width: `${batchProgress}%`,
                        transition: 'width 0.3s ease',
                      }}
                    />
                  </div>
                  <p style={{ color: '#6b7280' }}>{batchProgress}% complete</p>

                  {batchErrors.length > 0 && (
                    <div
                      className="alert alert-error"
                      style={{ marginTop: '1rem', textAlign: 'left' }}
                    >
                      <strong>Some uploads failed:</strong>
                      <ul style={{ margin: '0.5rem 0 0 1.25rem', padding: 0 }}>
                        {batchErrors.map((err, i) => (
                          <li key={i}>{err}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </div>
            <div className="modal-footer">
              {batchStep === 'upload' && (
                <button className="btn btn-secondary" onClick={handleCloseBatchModal}>
                  Cancel
                </button>
              )}
              {batchStep === 'preview' && (
                <>
                  <button className="btn btn-secondary" onClick={() => setBatchStep('upload')}>
                    ← Back
                  </button>
                  <button className="btn btn-primary" onClick={handleBatchUpload}>
                    Upload {batchData.length} Golfer{batchData.length > 1 ? 's' : ''}
                  </button>
                </>
              )}
              {batchStep === 'uploading' && batchProgress === 100 && (
                <button className="btn btn-primary" onClick={handleCloseBatchModal}>
                  Done
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* View Golfer Modal */}
      {showViewModal && viewingGolfer && (
        <div className="modal-overlay" onClick={handleCloseViewModal}>
          <div className="modal" style={{ maxWidth: '700px' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>
                🏌️ {viewingGolfer.firstName} {viewingGolfer.lastName}
              </h2>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <button className="btn btn-primary btn-sm" onClick={handleEditFromView}>
                  ✏️ Edit
                </button>
                <button className="modal-close" onClick={handleCloseViewModal}>
                  ×
                </button>
              </div>
            </div>
            <div className="modal-body">
              {/* Golfer Photo and Basic Info */}
              <div style={{ display: 'flex', gap: '1.5rem', marginBottom: '1.5rem' }}>
                {viewingGolfer.picture ? (
                  <img
                    src={viewingGolfer.picture}
                    alt={`${viewingGolfer.firstName} ${viewingGolfer.lastName}`}
                    loading="lazy"
                    style={{
                      width: '100px',
                      height: '100px',
                      borderRadius: '50%',
                      objectFit: 'cover',
                    }}
                  />
                ) : (
                  <div
                    style={{
                      width: '100px',
                      height: '100px',
                      borderRadius: '50%',
                      background: '#e5e7eb',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '2.5rem',
                    }}
                  >
                    🏌️
                  </div>
                )}
                <div style={{ flex: 1 }}>
                  <h3 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '0.5rem' }}>
                    {viewingGolfer.firstName} {viewingGolfer.lastName}
                  </h3>
                  <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                    <span
                      className={`badge ${viewingGolfer.isActive ? 'badge-success' : 'badge-gray'}`}
                    >
                      {viewingGolfer.isActive ? 'Active' : 'Inactive'}
                    </span>
                    <span style={{ fontWeight: 600, color: 'var(--primary-green)' }}>
                      ${(viewingGolfer.price / 1_000_000).toFixed(1)}M
                    </span>
                  </div>
                </div>
              </div>

              {/* Golfer Info Section */}
              <div style={{ marginBottom: '1.5rem' }}>
                <h4
                  style={{
                    fontSize: '0.9rem',
                    fontWeight: 600,
                    color: '#374151',
                    marginBottom: '0.75rem',
                  }}
                >
                  📋 Golfer Information (Editable)
                </h4>
                <div
                  style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1rem' }}
                >
                  <div style={{ background: '#f9fafb', padding: '1rem', borderRadius: '8px' }}>
                    <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '0.25rem' }}>
                      First Name
                    </div>
                    <div style={{ fontWeight: 500 }}>{viewingGolfer.firstName}</div>
                  </div>
                  <div style={{ background: '#f9fafb', padding: '1rem', borderRadius: '8px' }}>
                    <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '0.25rem' }}>
                      Last Name
                    </div>
                    <div style={{ fontWeight: 500 }}>{viewingGolfer.lastName}</div>
                  </div>
                  <div style={{ background: '#f9fafb', padding: '1rem', borderRadius: '8px' }}>
                    <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '0.25rem' }}>
                      Price
                    </div>
                    <div style={{ fontWeight: 500, color: 'var(--primary-green)' }}>
                      ${(viewingGolfer.price / 1_000_000).toFixed(1)}M
                    </div>
                  </div>
                  <div style={{ background: '#f9fafb', padding: '1rem', borderRadius: '8px' }}>
                    <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '0.25rem' }}>
                      Status
                    </div>
                    <div style={{ fontWeight: 500 }}>
                      {viewingGolfer.isActive ? 'Active' : 'Inactive'}
                    </div>
                  </div>
                  <div style={{ background: '#f9fafb', padding: '1rem', borderRadius: '8px' }}>
                    <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '0.25rem' }}>
                      Photo URL
                    </div>
                    <div
                      style={{
                        fontWeight: 500,
                        fontSize: '0.85rem',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {viewingGolfer.picture || '—'}
                    </div>
                  </div>
                </div>
              </div>

              {/* Current Season Stats (from Scores) */}
              <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: '1.5rem' }}>
                <h4
                  style={{
                    fontSize: '0.9rem',
                    fontWeight: 600,
                    color: '#374151',
                    marginBottom: '0.75rem',
                  }}
                >
                  📊 Current Season Stats (from Tournament Scores)
                </h4>

                {loadingStats ? (
                  <div style={{ textAlign: 'center', padding: '2rem', color: '#6b7280' }}>
                    Loading stats...
                  </div>
                ) : GolferSeasonStats ? (
                  <div
                    style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem' }}
                  >
                    <div
                      style={{
                        background: '#ecfdf5',
                        padding: '1rem',
                        borderRadius: '8px',
                        textAlign: 'center',
                      }}
                    >
                      <div
                        style={{ fontSize: '2rem', fontWeight: 700, color: 'var(--primary-green)' }}
                      >
                        {GolferSeasonStats.totalPoints}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: '#065f46' }}>Total Points</div>
                    </div>
                    <div
                      style={{
                        background: '#f9fafb',
                        padding: '1rem',
                        borderRadius: '8px',
                        textAlign: 'center',
                      }}
                    >
                      <div style={{ fontSize: '2rem', fontWeight: 700, color: '#374151' }}>
                        {GolferSeasonStats.tournamentsPlayed}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                        Tournaments Played
                      </div>
                    </div>
                    <div
                      style={{
                        background: '#fef3c7',
                        padding: '1rem',
                        borderRadius: '8px',
                        textAlign: 'center',
                      }}
                    >
                      <div style={{ fontSize: '2rem', fontWeight: 700, color: '#92400e' }}>
                        {GolferSeasonStats.timesBonusScored}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: '#92400e' }}>Times 36+ Points</div>
                    </div>
                    <div
                      style={{
                        background: '#fef9c3',
                        padding: '1rem',
                        borderRadius: '8px',
                        textAlign: 'center',
                      }}
                    >
                      <div style={{ fontSize: '1.75rem', fontWeight: 700, color: '#713f12' }}>
                        🥇 {GolferSeasonStats.firstPlaceFinishes}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: '#713f12' }}>
                        1st Place Finishes
                      </div>
                    </div>
                    <div
                      style={{
                        background: '#f3f4f6',
                        padding: '1rem',
                        borderRadius: '8px',
                        textAlign: 'center',
                      }}
                    >
                      <div style={{ fontSize: '1.75rem', fontWeight: 700, color: '#374151' }}>
                        🥈 {GolferSeasonStats.secondPlaceFinishes}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                        2nd Place Finishes
                      </div>
                    </div>
                    <div
                      style={{
                        background: '#fed7aa',
                        padding: '1rem',
                        borderRadius: '8px',
                        textAlign: 'center',
                      }}
                    >
                      <div style={{ fontSize: '1.75rem', fontWeight: 700, color: '#9a3412' }}>
                        🥉 {GolferSeasonStats.thirdPlaceFinishes}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: '#9a3412' }}>
                        3rd Place Finishes
                      </div>
                    </div>
                  </div>
                ) : (
                  <div
                    style={{
                      textAlign: 'center',
                      padding: '2rem',
                      background: '#f9fafb',
                      borderRadius: '8px',
                    }}
                  >
                    <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>📭</div>
                    <p style={{ color: '#6b7280' }}>
                      No tournament scores recorded yet for this Golfer.
                    </p>
                  </div>
                )}

                <div
                  style={{
                    marginTop: '1rem',
                    padding: '0.75rem',
                    background: '#f3f4f6',
                    borderRadius: '8px',
                    fontSize: '0.85rem',
                    color: '#6b7280',
                  }}
                >
                  ℹ️ Season stats are automatically calculated from tournament scores. To update
                  these, edit scores in the Scores tab.
                </div>
              </div>

              {/* 2025 Historical Stats (Editable) */}
              <div
                style={{
                  borderTop: '1px solid #e5e7eb',
                  paddingTop: '1.5rem',
                  marginTop: '1.5rem',
                }}
              >
                <h4
                  style={{
                    fontSize: '0.9rem',
                    fontWeight: 600,
                    color: '#374151',
                    marginBottom: '0.75rem',
                  }}
                >
                  📈 Historical 2025 Stats (Editable via Edit Button)
                </h4>
                <div
                  style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '0.75rem' }}
                >
                  <div
                    style={{
                      background: '#f9fafb',
                      padding: '0.75rem',
                      borderRadius: '8px',
                      textAlign: 'center',
                    }}
                  >
                    <div style={{ fontSize: '1.25rem', fontWeight: 600 }}>
                      {viewingGolfer.stats2025?.timesPlayed || 0}
                    </div>
                    <div style={{ fontSize: '0.7rem', color: '#6b7280' }}>Played</div>
                  </div>
                  <div
                    style={{
                      background: '#f9fafb',
                      padding: '0.75rem',
                      borderRadius: '8px',
                      textAlign: 'center',
                    }}
                  >
                    <div style={{ fontSize: '1.25rem', fontWeight: 600 }}>
                      {viewingGolfer.stats2025?.timesBonusScored || 0}
                    </div>
                    <div style={{ fontSize: '0.7rem', color: '#6b7280' }}>Bonus</div>
                  </div>
                  <div
                    style={{
                      background: '#f9fafb',
                      padding: '0.75rem',
                      borderRadius: '8px',
                      textAlign: 'center',
                    }}
                  >
                    <div style={{ fontSize: '1.25rem', fontWeight: 600 }}>
                      🥇 {viewingGolfer.stats2025?.timesFinished1st || 0}
                    </div>
                    <div style={{ fontSize: '0.7rem', color: '#6b7280' }}>1st</div>
                  </div>
                  <div
                    style={{
                      background: '#f9fafb',
                      padding: '0.75rem',
                      borderRadius: '8px',
                      textAlign: 'center',
                    }}
                  >
                    <div style={{ fontSize: '1.25rem', fontWeight: 600 }}>
                      🥈 {viewingGolfer.stats2025?.timesFinished2nd || 0}
                    </div>
                    <div style={{ fontSize: '0.7rem', color: '#6b7280' }}>2nd</div>
                  </div>
                  <div
                    style={{
                      background: '#f9fafb',
                      padding: '0.75rem',
                      borderRadius: '8px',
                      textAlign: 'center',
                    }}
                  >
                    <div style={{ fontSize: '1.25rem', fontWeight: 600 }}>
                      🥉 {viewingGolfer.stats2025?.timesFinished3rd || 0}
                    </div>
                    <div style={{ fontSize: '0.7rem', color: '#6b7280' }}>3rd</div>
                  </div>
                </div>
                <div
                  style={{
                    marginTop: '0.75rem',
                    padding: '0.75rem',
                    background: '#fffbeb',
                    borderRadius: '8px',
                    fontSize: '0.85rem',
                    color: '#92400e',
                  }}
                >
                  ⚠️ These are historical stats you entered when creating the Golfer. They are
                  separate from the live season stats above.
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={handleCloseViewModal}>
                Close
              </button>
              <button className="btn btn-primary" onClick={handleEditFromView}>
                ✏️ Edit Golfer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteModal && GolferToDelete && (
        <div className="modal-overlay" onClick={handleCloseDeleteModal}>
          <div className="modal" style={{ maxWidth: '450px' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>🗑️ Delete Golfer</h2>
              <button className="modal-close" onClick={handleCloseDeleteModal}>
                ×
              </button>
            </div>
            <div className="modal-body">
              {error && <div className="alert alert-error">{error}</div>}
              <p style={{ marginBottom: '1rem' }}>
                Are you sure you want to delete{' '}
                <strong>
                  {GolferToDelete.firstName} {GolferToDelete.lastName}
                </strong>
                ?
              </p>
              <p style={{ color: '#dc2626', fontSize: '0.9rem' }}>
                ⚠️ This action cannot be undone. The Golfer will be permanently removed.
              </p>
            </div>
            <div className="modal-footer">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={handleCloseDeleteModal}
                disabled={deleting}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-danger"
                onClick={handleDeleteGolfer}
                disabled={deleting}
              >
                {deleting ? 'Deleting...' : 'Delete Golfer'}
              </button>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
};

export default GolfersAdminPage;
