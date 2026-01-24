// Admin: Players management page

import React, { useEffect, useState } from 'react';
import AdminLayout from '../../components/AdminLayout/AdminLayout';
import { validators, sanitizers, getInputClassName } from '../../utils/validation';

interface Player2025Stats {
  timesScored36Plus: number;
  timesFinished1st: number;
  timesFinished2nd: number;
  timesFinished3rd: number;
  timesPlayed: number;
}

type MembershipType = 'men' | 'junior' | 'female' | 'senior';

interface Player {
  id: string;
  firstName: string;
  lastName: string;
  picture: string;
  price: number;
  membershipType: MembershipType;
  isActive: boolean;
  stats2025: Player2025Stats;
}

// Stats loaded from tournament scores
interface PlayerSeasonStats {
  tournamentsPlayed: number;
  totalPoints: number;
  firstPlaceFinishes: number;
  secondPlaceFinishes: number;
  thirdPlaceFinishes: number;
  times36Plus: number;
}

interface PlayerFormData {
  firstName: string;
  lastName: string;
  picture: string;
  price: string;
  membershipType: MembershipType;
  isActive: boolean;
  timesScored36Plus: string;
  timesFinished1st: string;
  timesFinished2nd: string;
  timesFinished3rd: string;
  timesPlayed: string;
}

const initialFormData: PlayerFormData = {
  firstName: '',
  lastName: '',
  picture: '',
  price: '',
  membershipType: 'men',
  isActive: true,
  timesScored36Plus: '0',
  timesFinished1st: '0',
  timesFinished2nd: '0',
  timesFinished3rd: '0',
  timesPlayed: '0',
};

const PlayersAdminPage: React.FC = () => {
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingPlayer, setEditingPlayer] = useState<Player | null>(null);
  const [formData, setFormData] = useState<PlayerFormData>(initialFormData);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // View mode state
  const [viewingPlayer, setViewingPlayer] = useState<Player | null>(null);
  const [showViewModal, setShowViewModal] = useState(false);
  const [playerSeasonStats, setPlayerSeasonStats] = useState<PlayerSeasonStats | null>(null);
  const [loadingStats, setLoadingStats] = useState(false);

  // Delete confirmation state
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [playerToDelete, setPlayerToDelete] = useState<Player | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Batch upload state
  const [showBatchModal, setShowBatchModal] = useState(false);
  const [batchStep, setBatchStep] = useState<'upload' | 'preview' | 'uploading'>('upload');
  const [batchData, setBatchData] = useState<PlayerFormData[]>([]);
  const [batchErrors, setBatchErrors] = useState<string[]>([]);
  const [batchProgress, setBatchProgress] = useState(0);
  const [batchFile, setBatchFile] = useState<File | null>(null);

  // Form validation state
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  // Form field validation rules
  const validateField = (field: string, value: string): string => {
    switch (field) {
      case 'firstName':
        if (!value.trim()) return 'First name is required';
        const firstNameValidator = validators.lettersOnly();
        const firstNameError = firstNameValidator(value);
        if (firstNameError) return 'First name can only contain letters';
        if (value.length < 2) return 'First name must be at least 2 characters';
        return '';
      case 'lastName':
        if (!value.trim()) return 'Last name is required';
        const lastNameValidator = validators.lettersOnly();
        const lastNameError = lastNameValidator(value);
        if (lastNameError) return 'Last name can only contain letters';
        if (value.length < 2) return 'Last name must be at least 2 characters';
        return '';
      case 'price':
        if (!value.trim()) return 'Price is required';
        const priceNum = parseFloat(value);
        if (isNaN(priceNum) || priceNum <= 0) return 'Price must be a positive number';
        if (priceNum > 50) return 'Price cannot exceed $50M';
        return '';
      case 'picture':
        if (value) {
          const urlValidator = validators.url();
          const urlError = urlValidator(value);
          if (urlError) return 'Please enter a valid URL';
        }
        return '';
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
    setFieldErrors({ ...fieldErrors, [field]: validateField(field, formData[field as keyof PlayerFormData] as string) });
  };

  const getFieldClass = (field: string): string => {
    if (!touched[field]) return 'form-input';
    return getInputClassName(touched[field], fieldErrors[field], 'form-input');
  };

  const validateAllFields = (): boolean => {
    const newErrors: Record<string, string> = {};
    const fieldsToValidate = ['firstName', 'lastName', 'price'];
    
    fieldsToValidate.forEach(field => {
      const error = validateField(field, formData[field as keyof PlayerFormData] as string);
      if (error) newErrors[field] = error;
    });
    
    // Mark all fields as touched
    const newTouched: Record<string, boolean> = {};
    fieldsToValidate.forEach(field => { newTouched[field] = true; });
    setTouched({ ...touched, ...newTouched });
    setFieldErrors(newErrors);
    
    return Object.keys(newErrors).length === 0;
  };

  const fetchPlayers = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch('/.netlify/functions/players-list', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      if (data.success) {
        setPlayers(data.data);
      }
    } catch (err) {
      console.error('Failed to fetch players:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPlayers();
  }, []);

  // View player handlers
  const handleViewPlayer = async (player: Player) => {
    setViewingPlayer(player);
    setShowViewModal(true);
    setLoadingStats(true);
    setPlayerSeasonStats(null);

    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`/.netlify/functions/players-stats?playerId=${player.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      if (data.success) {
        setPlayerSeasonStats(data.data);
      }
    } catch (err) {
      console.error('Failed to fetch player stats:', err);
    } finally {
      setLoadingStats(false);
    }
  };

  const handleCloseViewModal = () => {
    setShowViewModal(false);
    setViewingPlayer(null);
    setPlayerSeasonStats(null);
  };

  const handleEditFromView = () => {
    if (viewingPlayer) {
      handleCloseViewModal();
      handleOpenModal(viewingPlayer);
    }
  };

  const handleOpenModal = (player?: Player) => {
    if (player) {
      setEditingPlayer(player);
      setFormData({
        firstName: player.firstName,
        lastName: player.lastName,
        picture: player.picture,
        price: (player.price / 1_000_000).toString(),
        membershipType: player.membershipType || 'men',
        isActive: player.isActive,
        timesScored36Plus: (player.stats2025?.timesScored36Plus || 0).toString(),
        timesFinished1st: (player.stats2025?.timesFinished1st || 0).toString(),
        timesFinished2nd: (player.stats2025?.timesFinished2nd || 0).toString(),
        timesFinished3rd: (player.stats2025?.timesFinished3rd || 0).toString(),
        timesPlayed: (player.stats2025?.timesPlayed || 0).toString(),
      });
    } else {
      setEditingPlayer(null);
      setFormData(initialFormData);
    }
    setError('');
    setTouched({});
    setFieldErrors({});
    setShowModal(true);
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setEditingPlayer(null);
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

    const token = localStorage.getItem('token');
    const priceInPounds = parseFloat(formData.price) * 1_000_000;

    const stats2025 = {
      timesScored36Plus: parseInt(formData.timesScored36Plus) || 0,
      timesFinished1st: parseInt(formData.timesFinished1st) || 0,
      timesFinished2nd: parseInt(formData.timesFinished2nd) || 0,
      timesFinished3rd: parseInt(formData.timesFinished3rd) || 0,
      timesPlayed: parseInt(formData.timesPlayed) || 0,
    };

    try {
      if (editingPlayer) {
        // Update existing player
        const response = await fetch('/.netlify/functions/players-update', {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            id: editingPlayer.id,
            firstName: formData.firstName,
            lastName: formData.lastName,
            picture: formData.picture,
            price: priceInPounds,
            membershipType: formData.membershipType,
            isActive: formData.isActive,
            stats2025,
          }),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Failed to update player');
        setSuccess('Player updated successfully!');
      } else {
        // Create new player
        const response = await fetch('/.netlify/functions/players-create', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            firstName: formData.firstName,
            lastName: formData.lastName,
            picture: formData.picture,
            price: priceInPounds,
            membershipType: formData.membershipType,
            isActive: formData.isActive,
            stats2025,
          }),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Failed to create player');
        setSuccess('Player created successfully!');
      }

      handleCloseModal();
      fetchPlayers();
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    }
  };

  const formatPrice = (price: number) => {
    return `$${(price / 1_000_000).toFixed(1)}M`;
  };

  // Delete handlers
  const handleOpenDeleteModal = (player: Player) => {
    setPlayerToDelete(player);
    setShowDeleteModal(true);
  };

  const handleCloseDeleteModal = () => {
    setShowDeleteModal(false);
    setPlayerToDelete(null);
  };

  const handleDeletePlayer = async () => {
    if (!playerToDelete) return;

    setDeleting(true);
    try {
      const token = localStorage.getItem('token');
      const response = await fetch('/.netlify/functions/players-delete', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ id: playerToDelete.id }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to delete player');

      setSuccess(`${playerToDelete.firstName} ${playerToDelete.lastName} deleted successfully!`);
      handleCloseDeleteModal();
      fetchPlayers();
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete player');
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
    return lines.map(line => {
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

      const headers = rows[0].map(h => h.toLowerCase().trim());
      const dataRows = rows.slice(1);
      
      // Check for required columns
      const requiredColumns = ['firstname', 'lastname', 'price'];
      const missingColumns = requiredColumns.filter(col => !headers.includes(col));
      
      if (missingColumns.length > 0) {
        setBatchErrors([`Missing required columns: ${missingColumns.join(', ')}`]);
        return;
      }

      // Limit to 10 rows
      if (dataRows.length > 10) {
        setBatchErrors([`Maximum 10 players per batch upload. Found ${dataRows.length} rows.`]);
        return;
      }

      // Find column indices
      const colIndex = {
        firstName: headers.indexOf('firstname'),
        lastName: headers.indexOf('lastname'),
        picture: headers.indexOf('picture'),
        price: headers.indexOf('price'),
        membershipType: headers.indexOf('membershiptype'),
        isActive: headers.indexOf('isactive'),
        timesScored36Plus: headers.indexOf('timesscored36plus'),
        timesFinished1st: headers.indexOf('timesfinished1st'),
        timesFinished2nd: headers.indexOf('timesfinished2nd'),
        timesFinished3rd: headers.indexOf('timesfinished3rd'),
        timesPlayed: headers.indexOf('timesplayed'),
      };

      const errors: string[] = [];
      const parsedPlayers: PlayerFormData[] = [];

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
        const isActiveStr = colIndex.isActive >= 0 ? row[colIndex.isActive]?.trim().toLowerCase() : 'true';
        const isActive = isActiveStr !== 'false' && isActiveStr !== '0' && isActiveStr !== 'no';

        // Parse membershipType with validation
        const validMembershipTypes = ['men', 'junior', 'female', 'senior'];
        let membershipType: MembershipType = 'men';
        if (colIndex.membershipType >= 0 && row[colIndex.membershipType]) {
          const rawType = row[colIndex.membershipType].trim().toLowerCase();
          if (validMembershipTypes.includes(rawType)) {
            membershipType = rawType as MembershipType;
          } else if (rawType) {
            errors.push(`Row ${rowNum}: Invalid membershipType "${rawType}" (must be men, junior, female, or senior)`);
          }
        }

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

        parsedPlayers.push({
          firstName,
          lastName,
          picture,
          price: price.toString(),
          membershipType,
          isActive,
          timesScored36Plus: parseStatField('timesScored36Plus', 'Times Scored 36+'),
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
        setBatchData(parsedPlayers);
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
    const token = localStorage.getItem('token');
    const errors: string[] = [];
    let successCount = 0;

    for (let i = 0; i < batchData.length; i++) {
      const player = batchData[i];
      const priceInPounds = parseFloat(player.price) * 1_000_000;
      
      try {
        const response = await fetch('/.netlify/functions/players-create', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            firstName: player.firstName,
            lastName: player.lastName,
            picture: player.picture,
            price: priceInPounds,
            membershipType: player.membershipType,
            isActive: player.isActive,
            stats2025: {
              timesScored36Plus: parseInt(player.timesScored36Plus) || 0,
              timesFinished1st: parseInt(player.timesFinished1st) || 0,
              timesFinished2nd: parseInt(player.timesFinished2nd) || 0,
              timesFinished3rd: parseInt(player.timesFinished3rd) || 0,
              timesPlayed: parseInt(player.timesPlayed) || 0,
            },
          }),
        });

        if (!response.ok) {
          const data = await response.json();
          errors.push(`${player.firstName} ${player.lastName}: ${data.error || 'Failed to create'}`);
        } else {
          successCount++;
        }
      } catch (err) {
        errors.push(`${player.firstName} ${player.lastName}: Network error`);
      }

      setBatchProgress(Math.round(((i + 1) / batchData.length) * 100));
    }

    if (errors.length > 0) {
      setBatchErrors(errors);
    }
    
    if (successCount > 0) {
      setSuccess(`Successfully uploaded ${successCount} player${successCount > 1 ? 's' : ''}!`);
      setTimeout(() => setSuccess(''), 5000);
    }

    fetchPlayers();
    
    if (errors.length === 0) {
      handleCloseBatchModal();
    }
  };

  // Calculate stats
  const activePlayers = players.filter(p => p.isActive).length;
  const inactivePlayers = players.filter(p => !p.isActive).length;
  const avgPrice = players.length > 0 
    ? (players.reduce((sum, p) => sum + p.price, 0) / players.length / 1_000_000).toFixed(1)
    : '0';

  return (
    <AdminLayout title="Manage Players">
      {success && <div className="alert alert-success">{success}</div>}

      {/* Stats Row */}
      <div className="stats-row" style={{ marginBottom: '1.5rem' }}>
        <div className="stat-box">
          <div className="stat-box-icon">🏌️</div>
          <div className="stat-box-value">{players.length}</div>
          <div className="stat-box-label">Total Players</div>
        </div>
        <div className="stat-box">
          <div className="stat-box-icon">✅</div>
          <div className="stat-box-value">{activePlayers}</div>
          <div className="stat-box-label">Active</div>
        </div>
        <div className="stat-box">
          <div className="stat-box-icon">⏸️</div>
          <div className="stat-box-value">{inactivePlayers}</div>
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
          <h2>All Players ({players.length})</h2>
          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <button className="btn btn-secondary" onClick={handleOpenBatchModal}>
              📤 Batch Upload
            </button>
            <button className="btn btn-primary" onClick={() => handleOpenModal()}>
              + Add Player
            </button>
          </div>
        </div>

        {loading ? (
          <div className="admin-card-body">
            <p>Loading players...</p>
          </div>
        ) : players.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">🏌️</div>
            <h3>No Players Yet</h3>
            <p>Add professional golfers that users can select for their fantasy teams.</p>
            <button className="btn btn-primary" onClick={() => handleOpenModal()}>
              Add Your First Player
            </button>
          </div>
        ) : (
          <table className="admin-table">
            <thead>
              <tr>
                <th>Player</th>
                <th>Price</th>
                <th>Type</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {players.map((player) => (
                <tr key={player.id}>
                  <td>
                    <div 
                      style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', cursor: 'pointer' }}
                      onClick={() => handleViewPlayer(player)}
                    >
                      {player.picture ? (
                        <img
                          src={player.picture}
                          alt={`${player.firstName} ${player.lastName}`}
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
                      <span style={{ fontWeight: 500, color: 'var(--primary-green)', textDecoration: 'underline' }}>
                        {player.firstName} {player.lastName}
                      </span>
                    </div>
                  </td>
                  <td style={{ fontWeight: 600, color: 'var(--primary-green)' }}>
                    {formatPrice(player.price)}
                  </td>
                  <td>
                    <span className="badge badge-secondary" style={{ textTransform: 'capitalize' }}>
                      {player.membershipType || 'men'}
                    </span>
                  </td>
                  <td>
                    <span className={`badge ${player.isActive ? 'badge-success' : 'badge-gray'}`}>
                      {player.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td>
                    <div className="table-actions">
                      <button
                        className="btn btn-secondary btn-sm"
                        onClick={() => handleOpenModal(player)}
                      >
                        Edit
                      </button>
                      <button
                        className="btn btn-danger btn-sm"
                        onClick={() => handleOpenDeleteModal(player)}
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
              <h2>{editingPlayer ? 'Edit Player' : 'Add New Player'}</h2>
              <button className="modal-close" onClick={handleCloseModal}>
                ×
              </button>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="modal-body">
                {error && <div className="alert alert-error">{error}</div>}

                <div className="form-row">
                  <div className="form-group">
                    <label htmlFor="firstName">First Name<span className="required-indicator">*</span></label>
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
                    <label htmlFor="lastName">Last Name<span className="required-indicator">*</span></label>
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
                    <label htmlFor="price">Price (in millions $)<span className="required-indicator">*</span></label>
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
                  <div className="form-group">
                    <label htmlFor="membershipType">Membership Type<span className="required-indicator">*</span></label>
                    <select
                      id="membershipType"
                      className="form-select"
                      value={formData.membershipType}
                      onChange={(e) =>
                        setFormData({ ...formData, membershipType: e.target.value as MembershipType })
                      }
                    >
                      <option value="men">Men</option>
                      <option value="junior">Junior</option>
                      <option value="female">Female</option>
                      <option value="senior">Senior</option>
                    </select>
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label htmlFor="isActive">Status<span className="required-indicator">*</span></label>
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
                <div style={{ marginTop: '1.5rem', paddingTop: '1.5rem', borderTop: '1px solid #e5e7eb' }}>
                  <h3 style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--dark-text)', marginBottom: '1rem' }}>
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
                      <span style={{ fontSize: '0.75rem', color: '#6b7280' }}>Roll up, medal, board events</span>
                    </div>
                    <div className="form-group">
                      <label htmlFor="timesScored36Plus">Times Scored 36+ Points</label>
                      <input
                        type="number"
                        id="timesScored36Plus"
                        value={formData.timesScored36Plus}
                        onChange={(e) => setFormData({ ...formData, timesScored36Plus: e.target.value })}
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
                        onChange={(e) => setFormData({ ...formData, timesFinished1st: e.target.value })}
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
                        onChange={(e) => setFormData({ ...formData, timesFinished2nd: e.target.value })}
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
                        onChange={(e) => setFormData({ ...formData, timesFinished3rd: e.target.value })}
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
                  {editingPlayer ? 'Save Changes' : 'Add Player'}
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
              <h2>📤 Batch Upload Players</h2>
              <button className="modal-close" onClick={handleCloseBatchModal}>
                ×
              </button>
            </div>
            <div className="modal-body">
              {batchStep === 'upload' && (
                <>
                  <div style={{ marginBottom: '1.5rem' }}>
                    <p style={{ color: '#374151', marginBottom: '1rem' }}>
                      Upload a CSV file with player data. Maximum <strong>10 players</strong> per batch.
                    </p>
                    <div style={{ background: '#f3f4f6', borderRadius: '8px', padding: '1rem', fontSize: '0.85rem' }}>
                      <strong>Required columns:</strong> firstName, lastName, price (in millions)<br />
                      <strong>Optional columns:</strong> picture, membershipType (men/junior/female/senior), isActive, timesScored36Plus, timesFinished1st, timesFinished2nd, timesFinished3rd, timesPlayed
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
                      <div className="alert alert-error" style={{ maxHeight: '150px', overflow: 'auto' }}>
                        <strong>Validation Errors:</strong>
                        <ul style={{ margin: '0.5rem 0 0 1.25rem', padding: 0 }}>
                          {batchErrors.map((err, i) => (
                            <li key={i}>{err}</li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  )}

                  <div style={{ marginTop: '1.5rem', padding: '1rem', background: '#fffbeb', borderRadius: '8px', border: '1px solid #fde68a' }}>
                    <strong style={{ color: '#92400e' }}>📋 Sample CSV Format:</strong>
                    <pre style={{ margin: '0.5rem 0 0', fontSize: '0.75rem', color: '#92400e', overflow: 'auto' }}>
{`firstName,lastName,price,membershipType,picture,isActive,timesPlayed,timesScored36Plus,timesFinished1st,timesFinished2nd,timesFinished3rd
John,Smith,8.5,men,,true,12,3,1,2,1
Jane,Doe,7.0,female,,true,10,2,0,1,0
Tom,Junior,6.0,junior,,true,8,1,0,0,1`}
                    </pre>
                  </div>
                </>
              )}

              {batchStep === 'preview' && (
                <>
                  <div className="alert alert-success" style={{ marginBottom: '1rem' }}>
                    ✅ CSV validated successfully! Review {batchData.length} player{batchData.length > 1 ? 's' : ''} below.
                  </div>

                  <div style={{ maxHeight: '350px', overflow: 'auto', border: '1px solid #e5e7eb', borderRadius: '8px' }}>
                    <table className="admin-table" style={{ margin: 0 }}>
                      <thead>
                        <tr>
                          <th>#</th>
                          <th>Name</th>
                          <th>Price</th>
                          <th>Type</th>
                          <th>Played</th>
                          <th>36+</th>
                          <th>🥇</th>
                          <th>🥈</th>
                          <th>🥉</th>
                        </tr>
                      </thead>
                      <tbody>
                        {batchData.map((player, index) => (
                          <tr key={index}>
                            <td style={{ color: '#6b7280' }}>{index + 1}</td>
                            <td style={{ fontWeight: 500 }}>
                              {player.firstName} {player.lastName}
                              {!player.isActive && (
                                <span className="badge badge-gray" style={{ marginLeft: '0.5rem' }}>Inactive</span>
                              )}
                            </td>
                            <td style={{ color: 'var(--primary-green)', fontWeight: 600 }}>
                              ${parseFloat(player.price).toFixed(1)}M
                            </td>
                            <td>
                              <span className="badge badge-secondary" style={{ textTransform: 'capitalize' }}>
                                {player.membershipType}
                              </span>
                            </td>
                            <td>{player.timesPlayed}</td>
                            <td>{player.timesScored36Plus}</td>
                            <td>{player.timesFinished1st}</td>
                            <td>{player.timesFinished2nd}</td>
                            <td>{player.timesFinished3rd}</td>
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
                  <h3 style={{ marginBottom: '1rem' }}>Uploading Players...</h3>
                  <div style={{ 
                    background: '#e5e7eb', 
                    borderRadius: '9999px', 
                    height: '8px', 
                    overflow: 'hidden',
                    marginBottom: '0.5rem'
                  }}>
                    <div 
                      style={{ 
                        background: 'var(--primary-green)', 
                        height: '100%', 
                        width: `${batchProgress}%`,
                        transition: 'width 0.3s ease'
                      }} 
                    />
                  </div>
                  <p style={{ color: '#6b7280' }}>{batchProgress}% complete</p>

                  {batchErrors.length > 0 && (
                    <div className="alert alert-error" style={{ marginTop: '1rem', textAlign: 'left' }}>
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
                    Upload {batchData.length} Player{batchData.length > 1 ? 's' : ''}
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

      {/* View Player Modal */}
      {showViewModal && viewingPlayer && (
        <div className="modal-overlay" onClick={handleCloseViewModal}>
          <div className="modal" style={{ maxWidth: '700px' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>🏌️ {viewingPlayer.firstName} {viewingPlayer.lastName}</h2>
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
              {/* Player Photo and Basic Info */}
              <div style={{ display: 'flex', gap: '1.5rem', marginBottom: '1.5rem' }}>
                {viewingPlayer.picture ? (
                  <img
                    src={viewingPlayer.picture}
                    alt={`${viewingPlayer.firstName} ${viewingPlayer.lastName}`}
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
                    {viewingPlayer.firstName} {viewingPlayer.lastName}
                  </h3>
                  <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                    <span className={`badge ${viewingPlayer.isActive ? 'badge-success' : 'badge-gray'}`}>
                      {viewingPlayer.isActive ? 'Active' : 'Inactive'}
                    </span>
                    <span className="badge badge-secondary" style={{ textTransform: 'capitalize' }}>
                      {viewingPlayer.membershipType || 'Men'}
                    </span>
                    <span style={{ fontWeight: 600, color: 'var(--primary-green)' }}>
                      ${(viewingPlayer.price / 1_000_000).toFixed(1)}M
                    </span>
                  </div>
                </div>
              </div>

              {/* Player Info Section */}
              <div style={{ marginBottom: '1.5rem' }}>
                <h4 style={{ fontSize: '0.9rem', fontWeight: 600, color: '#374151', marginBottom: '0.75rem' }}>
                  📋 Player Information (Editable)
                </h4>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1rem' }}>
                  <div style={{ background: '#f9fafb', padding: '1rem', borderRadius: '8px' }}>
                    <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '0.25rem' }}>First Name</div>
                    <div style={{ fontWeight: 500 }}>{viewingPlayer.firstName}</div>
                  </div>
                  <div style={{ background: '#f9fafb', padding: '1rem', borderRadius: '8px' }}>
                    <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '0.25rem' }}>Last Name</div>
                    <div style={{ fontWeight: 500 }}>{viewingPlayer.lastName}</div>
                  </div>
                  <div style={{ background: '#f9fafb', padding: '1rem', borderRadius: '8px' }}>
                    <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '0.25rem' }}>Price</div>
                    <div style={{ fontWeight: 500, color: 'var(--primary-green)' }}>
                      ${(viewingPlayer.price / 1_000_000).toFixed(1)}M
                    </div>
                  </div>
                  <div style={{ background: '#f9fafb', padding: '1rem', borderRadius: '8px' }}>
                    <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '0.25rem' }}>Membership Type</div>
                    <div style={{ fontWeight: 500, textTransform: 'capitalize' }}>{viewingPlayer.membershipType || 'Men'}</div>
                  </div>
                  <div style={{ background: '#f9fafb', padding: '1rem', borderRadius: '8px' }}>
                    <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '0.25rem' }}>Status</div>
                    <div style={{ fontWeight: 500 }}>{viewingPlayer.isActive ? 'Active' : 'Inactive'}</div>
                  </div>
                  <div style={{ background: '#f9fafb', padding: '1rem', borderRadius: '8px' }}>
                    <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '0.25rem' }}>Photo URL</div>
                    <div style={{ fontWeight: 500, fontSize: '0.85rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {viewingPlayer.picture || '—'}
                    </div>
                  </div>
                </div>
              </div>

              {/* Current Season Stats (from Scores) */}
              <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: '1.5rem' }}>
                <h4 style={{ fontSize: '0.9rem', fontWeight: 600, color: '#374151', marginBottom: '0.75rem' }}>
                  📊 Current Season Stats (from Tournament Scores)
                </h4>
                
                {loadingStats ? (
                  <div style={{ textAlign: 'center', padding: '2rem', color: '#6b7280' }}>
                    Loading stats...
                  </div>
                ) : playerSeasonStats ? (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem' }}>
                    <div style={{ background: '#ecfdf5', padding: '1rem', borderRadius: '8px', textAlign: 'center' }}>
                      <div style={{ fontSize: '2rem', fontWeight: 700, color: 'var(--primary-green)' }}>
                        {playerSeasonStats.totalPoints}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: '#065f46' }}>Total Points</div>
                    </div>
                    <div style={{ background: '#f9fafb', padding: '1rem', borderRadius: '8px', textAlign: 'center' }}>
                      <div style={{ fontSize: '2rem', fontWeight: 700, color: '#374151' }}>
                        {playerSeasonStats.tournamentsPlayed}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>Tournaments Played</div>
                    </div>
                    <div style={{ background: '#fef3c7', padding: '1rem', borderRadius: '8px', textAlign: 'center' }}>
                      <div style={{ fontSize: '2rem', fontWeight: 700, color: '#92400e' }}>
                        {playerSeasonStats.times36Plus}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: '#92400e' }}>Times 36+ Points</div>
                    </div>
                    <div style={{ background: '#fef9c3', padding: '1rem', borderRadius: '8px', textAlign: 'center' }}>
                      <div style={{ fontSize: '1.75rem', fontWeight: 700, color: '#713f12' }}>
                        🥇 {playerSeasonStats.firstPlaceFinishes}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: '#713f12' }}>1st Place Finishes</div>
                    </div>
                    <div style={{ background: '#f3f4f6', padding: '1rem', borderRadius: '8px', textAlign: 'center' }}>
                      <div style={{ fontSize: '1.75rem', fontWeight: 700, color: '#374151' }}>
                        🥈 {playerSeasonStats.secondPlaceFinishes}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>2nd Place Finishes</div>
                    </div>
                    <div style={{ background: '#fed7aa', padding: '1rem', borderRadius: '8px', textAlign: 'center' }}>
                      <div style={{ fontSize: '1.75rem', fontWeight: 700, color: '#9a3412' }}>
                        🥉 {playerSeasonStats.thirdPlaceFinishes}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: '#9a3412' }}>3rd Place Finishes</div>
                    </div>
                  </div>
                ) : (
                  <div style={{ textAlign: 'center', padding: '2rem', background: '#f9fafb', borderRadius: '8px' }}>
                    <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>📭</div>
                    <p style={{ color: '#6b7280' }}>No tournament scores recorded yet for this player.</p>
                  </div>
                )}
                
                <div style={{ marginTop: '1rem', padding: '0.75rem', background: '#f3f4f6', borderRadius: '8px', fontSize: '0.85rem', color: '#6b7280' }}>
                  ℹ️ Season stats are automatically calculated from tournament scores. To update these, edit scores in the Scores tab.
                </div>
              </div>

              {/* 2025 Historical Stats (Editable) */}
              <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: '1.5rem', marginTop: '1.5rem' }}>
                <h4 style={{ fontSize: '0.9rem', fontWeight: 600, color: '#374151', marginBottom: '0.75rem' }}>
                  📈 Historical 2025 Stats (Editable via Edit Button)
                </h4>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '0.75rem' }}>
                  <div style={{ background: '#f9fafb', padding: '0.75rem', borderRadius: '8px', textAlign: 'center' }}>
                    <div style={{ fontSize: '1.25rem', fontWeight: 600 }}>{viewingPlayer.stats2025?.timesPlayed || 0}</div>
                    <div style={{ fontSize: '0.7rem', color: '#6b7280' }}>Played</div>
                  </div>
                  <div style={{ background: '#f9fafb', padding: '0.75rem', borderRadius: '8px', textAlign: 'center' }}>
                    <div style={{ fontSize: '1.25rem', fontWeight: 600 }}>{viewingPlayer.stats2025?.timesScored36Plus || 0}</div>
                    <div style={{ fontSize: '0.7rem', color: '#6b7280' }}>36+ Pts</div>
                  </div>
                  <div style={{ background: '#f9fafb', padding: '0.75rem', borderRadius: '8px', textAlign: 'center' }}>
                    <div style={{ fontSize: '1.25rem', fontWeight: 600 }}>🥇 {viewingPlayer.stats2025?.timesFinished1st || 0}</div>
                    <div style={{ fontSize: '0.7rem', color: '#6b7280' }}>1st</div>
                  </div>
                  <div style={{ background: '#f9fafb', padding: '0.75rem', borderRadius: '8px', textAlign: 'center' }}>
                    <div style={{ fontSize: '1.25rem', fontWeight: 600 }}>🥈 {viewingPlayer.stats2025?.timesFinished2nd || 0}</div>
                    <div style={{ fontSize: '0.7rem', color: '#6b7280' }}>2nd</div>
                  </div>
                  <div style={{ background: '#f9fafb', padding: '0.75rem', borderRadius: '8px', textAlign: 'center' }}>
                    <div style={{ fontSize: '1.25rem', fontWeight: 600 }}>🥉 {viewingPlayer.stats2025?.timesFinished3rd || 0}</div>
                    <div style={{ fontSize: '0.7rem', color: '#6b7280' }}>3rd</div>
                  </div>
                </div>
                <div style={{ marginTop: '0.75rem', padding: '0.75rem', background: '#fffbeb', borderRadius: '8px', fontSize: '0.85rem', color: '#92400e' }}>
                  ⚠️ These are historical stats you entered when creating the player. They are separate from the live season stats above.
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={handleCloseViewModal}>
                Close
              </button>
              <button className="btn btn-primary" onClick={handleEditFromView}>
                ✏️ Edit Player
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteModal && playerToDelete && (
        <div className="modal-overlay" onClick={handleCloseDeleteModal}>
          <div className="modal" style={{ maxWidth: '450px' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>🗑️ Delete Player</h2>
              <button className="modal-close" onClick={handleCloseDeleteModal}>
                ×
              </button>
            </div>
            <div className="modal-body">
              {error && <div className="alert alert-error">{error}</div>}
              <p style={{ marginBottom: '1rem' }}>
                Are you sure you want to delete <strong>{playerToDelete.firstName} {playerToDelete.lastName}</strong>?
              </p>
              <p style={{ color: '#dc2626', fontSize: '0.9rem' }}>
                ⚠️ This action cannot be undone. The player will be permanently removed.
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
                onClick={handleDeletePlayer}
                disabled={deleting}
              >
                {deleting ? 'Deleting...' : 'Delete Player'}
              </button>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
};

export default PlayersAdminPage;
