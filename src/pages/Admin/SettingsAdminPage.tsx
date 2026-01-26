// Admin: Settings management page

import React, { useEffect, useState } from 'react';
import AdminLayout from '../../components/AdminLayout/AdminLayout';

interface AppSettings {
  transfersOpen: boolean;
  currentSeason: number;
  registrationOpen: boolean;
  allowNewTeamCreation: boolean;
  seasonStartDate: string;
  seasonEndDate: string;
}

const SettingsAdminPage: React.FC = () => {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [updating, setUpdating] = useState<string | null>(null);

  // Season date editing state
  const [editingSeasonDates, setEditingSeasonDates] = useState(false);
  const [tempStartDate, setTempStartDate] = useState('');
  const [tempEndDate, setTempEndDate] = useState('');

  // Danger zone modal state
  const [showDangerModal, setShowDangerModal] = useState(false);
  const [dangerAction, setDangerAction] = useState<'reset-scores' | 'reset-picks' | 'reset-all' | null>(null);
  const [confirmText, setConfirmText] = useState('');
  const [isResetting, setIsResetting] = useState(false);

  const fetchSettings = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch('/.netlify/functions/settings', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      if (data.success) {
        setSettings(data.data);
      }
    } catch (err) {
      console.error('Failed to fetch settings:', err);
      setError('Failed to load settings');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSettings();
  }, []);

  const updateSetting = async (key: string, value: boolean | number | string) => {
    setUpdating(key);
    setError('');

    try {
      const token = localStorage.getItem('token');
      const response = await fetch('/.netlify/functions/settings', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ key, value }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to update setting');

      setSettings(data.data);
      setSuccess(`Setting updated successfully!`);
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      setTimeout(() => setError(''), 5000);
    } finally {
      setUpdating(null);
    }
  };

  const openDangerModal = (action: 'reset-scores' | 'reset-picks' | 'reset-all') => {
    setDangerAction(action);
    setConfirmText('');
    setShowDangerModal(true);
  };

  const startEditingSeasonDates = () => {
    setTempStartDate(settings?.seasonStartDate || '2026-01-01');
    setTempEndDate(settings?.seasonEndDate || '2026-12-31');
    setEditingSeasonDates(true);
  };

  const cancelEditingSeasonDates = () => {
    setEditingSeasonDates(false);
    setTempStartDate('');
    setTempEndDate('');
  };

  const saveSeasonDates = async () => {
    if (!tempStartDate || !tempEndDate) {
      setError('Please select both start and end dates');
      return;
    }
    
    if (new Date(tempStartDate) >= new Date(tempEndDate)) {
      setError('Start date must be before end date');
      return;
    }

    setUpdating('seasonDates');
    setError('');

    try {
      const token = localStorage.getItem('token');
      
      // Update start date
      let response = await fetch('/.netlify/functions/settings', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ key: 'seasonStartDate', value: tempStartDate }),
      });
      
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to update start date');
      }
      
      // Update end date
      response = await fetch('/.netlify/functions/settings', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ key: 'seasonEndDate', value: tempEndDate }),
      });
      
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to update end date');

      setSettings(data.data);
      setEditingSeasonDates(false);
      setSuccess('Season dates updated successfully!');
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      setTimeout(() => setError(''), 5000);
    } finally {
      setUpdating(null);
    }
  };

  const formatDisplayDate = (dateStr: string) => {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  };

  const handleDangerAction = async () => {
    if (!dangerAction || confirmText !== 'CONFIRM') return;

    setIsResetting(true);
    setError('');

    try {
      const token = localStorage.getItem('token');
      const response = await fetch('/.netlify/functions/settings-reset', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ action: dangerAction, confirm: 'CONFIRM' }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to perform reset');

      setSuccess(data.data.message);
      setShowDangerModal(false);
      setDangerAction(null);
      setConfirmText('');
      setTimeout(() => setSuccess(''), 5000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setIsResetting(false);
    }
  };

  const getDangerActionInfo = () => {
    switch (dangerAction) {
      case 'reset-scores':
        return {
          title: '🗑️ Reset All Scores',
          description: 'This will delete ALL tournament scores from the database. Player stats will reset to zero. This action cannot be undone.',
          warning: 'All player points, positions, and tournament results will be permanently deleted.',
        };
      case 'reset-picks':
        return {
          title: '🗑️ Reset All Picks',
          description: 'This will delete ALL user team picks from the database. Users will need to re-select their teams. This action cannot be undone.',
          warning: 'All user fantasy teams will be cleared.',
        };
      case 'reset-all':
        return {
          title: '⚠️ Full Season Reset',
          description: 'This will delete ALL scores AND ALL user picks. Use this to start a fresh season while keeping players and tournaments.',
          warning: 'This is a complete reset. Both scores and picks will be permanently deleted.',
        };
      default:
        return { title: '', description: '', warning: '' };
    }
  };

  if (loading) {
    return (
      <AdminLayout title="Settings">
        <div className="admin-card">
          <div className="admin-card-body">
            <p>Loading settings...</p>
          </div>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout title="Settings">
      {success && <div className="alert alert-success">{success}</div>}
      {error && <div className="alert alert-error">{error}</div>}

      {/* Transfer Window Control */}
      <div className="admin-card" style={{ marginBottom: '1.5rem' }}>
        <div className="admin-card-header">
          <h2>🔒 Transfer Window</h2>
        </div>
        <div className="admin-card-body">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <div>
              <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.25rem' }}>
                Transfer Window Status
              </h3>
              <p style={{ color: '#6b7280', fontSize: '0.9rem', margin: 0 }}>
                When transfers are locked, users with existing teams cannot change their picks.
              </p>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <span
                className={`badge ${settings?.transfersOpen ? 'badge-success' : 'badge-error'}`}
                style={{ fontSize: '0.9rem', padding: '0.5rem 1rem' }}
              >
                {settings?.transfersOpen ? '✅ OPEN' : '🔒 LOCKED'}
              </span>
              <button
                className={`btn ${settings?.transfersOpen ? 'btn-danger' : 'btn-primary'}`}
                onClick={() => updateSetting('transfersOpen', !settings?.transfersOpen)}
                disabled={updating === 'transfersOpen'}
              >
                {updating === 'transfersOpen'
                  ? 'Updating...'
                  : settings?.transfersOpen
                  ? '🔒 Lock Transfers'
                  : '🔓 Open Transfers'}
              </button>
            </div>
          </div>
          <div style={{ background: '#f3f4f6', padding: '1rem', borderRadius: '8px', fontSize: '0.85rem', color: '#6b7280' }}>
            💡 <strong>Tip:</strong> Lock transfers during tournaments to prevent users from changing their teams while games are in progress.
          </div>
        </div>
      </div>

      {/* Registration Control */}
      <div className="admin-card" style={{ marginBottom: '1.5rem' }}>
        <div className="admin-card-header">
          <h2>👥 Registration</h2>
        </div>
        <div className="admin-card-body">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <div>
              <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.25rem' }}>
                New User Registration
              </h3>
              <p style={{ color: '#6b7280', fontSize: '0.9rem', margin: 0 }}>
                Control whether new users can create accounts.
              </p>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <span
                className={`badge ${settings?.registrationOpen ? 'badge-success' : 'badge-gray'}`}
                style={{ fontSize: '0.9rem', padding: '0.5rem 1rem' }}
              >
                {settings?.registrationOpen ? '✅ OPEN' : '🚫 CLOSED'}
              </span>
              <button
                className={`btn ${settings?.registrationOpen ? 'btn-secondary' : 'btn-primary'}`}
                onClick={() => updateSetting('registrationOpen', !settings?.registrationOpen)}
                disabled={updating === 'registrationOpen'}
              >
                {updating === 'registrationOpen'
                  ? 'Updating...'
                  : settings?.registrationOpen
                  ? '🚫 Close Registration'
                  : '✅ Open Registration'}
              </button>
            </div>
          </div>
          <div style={{ background: '#f3f4f6', padding: '1rem', borderRadius: '8px', fontSize: '0.85rem', color: '#6b7280' }}>
            💡 <strong>Tip:</strong> Close registration once the season has started or when you have enough participants.
          </div>
        </div>
      </div>

      {/* New Team Creation Control */}
      <div className="admin-card" style={{ marginBottom: '1.5rem' }}>
        <div className="admin-card-header">
          <h2>⛳ Team Creation</h2>
        </div>
        <div className="admin-card-body">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <div>
              <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.25rem' }}>
                New Team Creation
              </h3>
              <p style={{ color: '#6b7280', fontSize: '0.9rem', margin: 0 }}>
                Allow registered users who don't have a team yet to create their initial team.
              </p>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <span
                className={`badge ${settings?.allowNewTeamCreation ? 'badge-success' : 'badge-gray'}`}
                style={{ fontSize: '0.9rem', padding: '0.5rem 1rem' }}
              >
                {settings?.allowNewTeamCreation ? '✅ ALLOWED' : '🚫 DISABLED'}
              </span>
              <button
                className={`btn ${settings?.allowNewTeamCreation ? 'btn-secondary' : 'btn-primary'}`}
                onClick={() => updateSetting('allowNewTeamCreation', !settings?.allowNewTeamCreation)}
                disabled={updating === 'allowNewTeamCreation'}
              >
                {updating === 'allowNewTeamCreation'
                  ? 'Updating...'
                  : settings?.allowNewTeamCreation
                  ? '🚫 Disable Creation'
                  : '✅ Allow Creation'}
              </button>
            </div>
          </div>
          <div style={{ background: '#f3f4f6', padding: '1rem', borderRadius: '8px', fontSize: '0.85rem', color: '#6b7280' }}>
            💡 <strong>Tip:</strong> This is separate from transfers. Keep this ON to allow new users to create teams, even when transfers are locked. Turn OFF to prevent any new teams being created (e.g., mid-season).
          </div>
        </div>
      </div>

      {/* Season Info */}
      <div className="admin-card" style={{ marginBottom: '1.5rem' }}>
        <div className="admin-card-header">
          <h2>📅 Season Information</h2>
        </div>
        <div className="admin-card-body">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '1rem' }}>
            <div style={{ background: '#f9fafb', padding: '1rem', borderRadius: '8px' }}>
              <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '0.25rem' }}>Current Season</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--primary-green)' }}>
                {settings?.currentSeason}
              </div>
            </div>
            <div style={{ background: '#f9fafb', padding: '1rem', borderRadius: '8px' }}>
              <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '0.25rem' }}>Budget Cap</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#374151' }}>
                $50M
              </div>
            </div>
            <div style={{ background: '#f9fafb', padding: '1rem', borderRadius: '8px' }}>
              <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '0.25rem' }}>Team Size</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#374151' }}>
                6 Players
              </div>
            </div>
          </div>

          {/* Scoring Rules */}
          <div style={{ background: '#ecfdf5', padding: '1rem', borderRadius: '8px', border: '1px solid #a7f3d0' }}>
            <h4 style={{ fontSize: '0.9rem', fontWeight: 600, color: '#065f46', marginBottom: '0.5rem' }}>
              📊 Scoring Rules
            </h4>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '0.5rem', fontSize: '0.85rem', color: '#065f46' }}>
              <div>🥇 1st Place: <strong>5 pts</strong></div>
              <div>🥈 2nd Place: <strong>2-3 pts</strong> (tier)</div>
              <div>🥉 3rd Place: <strong>1 pt</strong> (20+ tier)</div>
              <div>⭐ 36+ Bonus: <strong>+1 pt</strong></div>
            </div>
            <div style={{ marginTop: '0.5rem', fontSize: '0.8rem', color: '#047857' }}>
              Multipliers: Regular (1x) | Elevated (2x) | Signature (3x)
            </div>
          </div>
        </div>
      </div>

      {/* Season Dates Control */}
      <div className="admin-card" style={{ marginBottom: '1.5rem' }}>
        <div className="admin-card-header">
          <h2>📆 Season Date Range</h2>
        </div>
        <div className="admin-card-body">
          <p style={{ color: '#6b7280', fontSize: '0.9rem', marginBottom: '1rem' }}>
            Define the date range for the season. The leaderboard will only count tournaments within these dates.
          </p>
          
          {!editingSeasonDates ? (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', gap: '2rem' }}>
                <div style={{ background: '#f9fafb', padding: '1rem', borderRadius: '8px' }}>
                  <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '0.25rem' }}>Start Date</div>
                  <div style={{ fontSize: '1.1rem', fontWeight: 600, color: 'var(--primary-green)' }}>
                    {formatDisplayDate(settings?.seasonStartDate || '2026-01-01')}
                  </div>
                </div>
                <div style={{ background: '#f9fafb', padding: '1rem', borderRadius: '8px' }}>
                  <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '0.25rem' }}>End Date</div>
                  <div style={{ fontSize: '1.1rem', fontWeight: 600, color: 'var(--primary-green)' }}>
                    {formatDisplayDate(settings?.seasonEndDate || '2026-12-31')}
                  </div>
                </div>
              </div>
              <button
                className="btn btn-secondary"
                onClick={startEditingSeasonDates}
              >
                ✏️ Edit Dates
              </button>
            </div>
          ) : (
            <div>
              <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
                <div style={{ flex: '1', minWidth: '200px' }}>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 500, marginBottom: '0.5rem', color: '#374151' }}>
                    Season Start Date
                  </label>
                  <input
                    type="date"
                    value={tempStartDate}
                    onChange={(e) => setTempStartDate(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '0.75rem',
                      border: '1px solid #d1d5db',
                      borderRadius: '8px',
                      fontSize: '0.95rem',
                    }}
                  />
                </div>
                <div style={{ flex: '1', minWidth: '200px' }}>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 500, marginBottom: '0.5rem', color: '#374151' }}>
                    Season End Date
                  </label>
                  <input
                    type="date"
                    value={tempEndDate}
                    onChange={(e) => setTempEndDate(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '0.75rem',
                      border: '1px solid #d1d5db',
                      borderRadius: '8px',
                      fontSize: '0.95rem',
                    }}
                  />
                </div>
              </div>
              <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
                <button
                  className="btn btn-secondary"
                  onClick={cancelEditingSeasonDates}
                  disabled={updating === 'seasonDates'}
                >
                  Cancel
                </button>
                <button
                  className="btn btn-primary"
                  onClick={saveSeasonDates}
                  disabled={updating === 'seasonDates'}
                >
                  {updating === 'seasonDates' ? 'Saving...' : '💾 Save Dates'}
                </button>
              </div>
            </div>
          )}

          <div style={{ background: '#f3f4f6', padding: '1rem', borderRadius: '8px', fontSize: '0.85rem', color: '#6b7280', marginTop: '1rem' }}>
            💡 <strong>Tip:</strong> These dates define the leaderboard season boundaries. Weekly and monthly leaderboards will only include tournaments that started within this range.
          </div>
        </div>
      </div>

      {/* Danger Zone */}
      <div className="admin-card" style={{ border: '2px solid #fecaca', background: '#fef2f2' }}>
        <div className="admin-card-header" style={{ borderBottom: '1px solid #fecaca' }}>
          <h2 style={{ color: '#dc2626' }}>⚠️ Danger Zone</h2>
        </div>
        <div className="admin-card-body">
          <p style={{ color: '#991b1b', marginBottom: '1.5rem' }}>
            These actions are destructive and cannot be undone. Please be absolutely sure before proceeding.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {/* Reset Scores */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem', background: 'white', borderRadius: '8px', border: '1px solid #fecaca' }}>
              <div>
                <h4 style={{ fontSize: '0.95rem', fontWeight: 600, color: '#991b1b', marginBottom: '0.25rem' }}>
                  Reset All Scores
                </h4>
                <p style={{ color: '#6b7280', fontSize: '0.85rem', margin: 0 }}>
                  Delete all tournament scores. Player stats will reset to zero.
                </p>
              </div>
              <button
                className="btn"
                style={{ background: '#dc2626', color: 'white', whiteSpace: 'nowrap' }}
                onClick={() => openDangerModal('reset-scores')}
              >
                🗑️ Reset Scores
              </button>
            </div>

            {/* Reset Picks */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem', background: 'white', borderRadius: '8px', border: '1px solid #fecaca' }}>
              <div>
                <h4 style={{ fontSize: '0.95rem', fontWeight: 600, color: '#991b1b', marginBottom: '0.25rem' }}>
                  Reset All Picks
                </h4>
                <p style={{ color: '#6b7280', fontSize: '0.85rem', margin: 0 }}>
                  Delete all user team picks. Users will need to re-select their teams.
                </p>
              </div>
              <button
                className="btn"
                style={{ background: '#dc2626', color: 'white', whiteSpace: 'nowrap' }}
                onClick={() => openDangerModal('reset-picks')}
              >
                🗑️ Reset Picks
              </button>
            </div>

            {/* Full Reset */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem', background: 'white', borderRadius: '8px', border: '2px solid #991b1b' }}>
              <div>
                <h4 style={{ fontSize: '0.95rem', fontWeight: 600, color: '#991b1b', marginBottom: '0.25rem' }}>
                  Full Season Reset
                </h4>
                <p style={{ color: '#6b7280', fontSize: '0.85rem', margin: 0 }}>
                  Delete ALL scores AND picks. Start fresh while keeping players and tournaments.
                </p>
              </div>
              <button
                className="btn"
                style={{ background: '#7f1d1d', color: 'white', whiteSpace: 'nowrap' }}
                onClick={() => openDangerModal('reset-all')}
              >
                ⚠️ Full Reset
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Danger Confirmation Modal */}
      {showDangerModal && dangerAction && (
        <div className="modal-overlay" onClick={() => setShowDangerModal(false)}>
          <div className="modal" style={{ maxWidth: '500px' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header" style={{ background: '#fef2f2', borderBottom: '1px solid #fecaca' }}>
              <h2 style={{ color: '#dc2626' }}>{getDangerActionInfo().title}</h2>
              <button className="modal-close" onClick={() => setShowDangerModal(false)}>
                ×
              </button>
            </div>
            <div className="modal-body">
              <p style={{ marginBottom: '1rem' }}>{getDangerActionInfo().description}</p>
              <div style={{ background: '#fef2f2', padding: '1rem', borderRadius: '8px', borderLeft: '4px solid #dc2626', marginBottom: '1.5rem' }}>
                <strong style={{ color: '#dc2626' }}>⚠️ Warning:</strong>
                <p style={{ color: '#991b1b', margin: '0.5rem 0 0' }}>{getDangerActionInfo().warning}</p>
              </div>
              <p style={{ fontWeight: 500 }}>
                Type <strong>CONFIRM</strong> to proceed:
              </p>
              <input
                type="text"
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder="Type CONFIRM"
                style={{
                  width: '100%',
                  padding: '0.75rem 1rem',
                  border: '2px solid #fecaca',
                  borderRadius: '8px',
                  fontSize: '1rem',
                  marginTop: '0.5rem',
                }}
              />
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowDangerModal(false)}>
                Cancel
              </button>
              <button
                className="btn"
                style={{ background: '#dc2626', color: 'white' }}
                onClick={handleDangerAction}
                disabled={isResetting || confirmText !== 'CONFIRM'}
              >
                {isResetting ? 'Processing...' : 'Yes, proceed'}
              </button>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
};

export default SettingsAdminPage;
