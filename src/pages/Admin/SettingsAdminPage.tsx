// Admin: Settings management page

import React, { useCallback, useEffect, useState } from 'react';
import AdminLayout from '../../components/AdminLayout/AdminLayout';
import { useApiClient } from '../../hooks/useApiClient';

interface AppSettings {
  transfersOpen: boolean;
  registrationOpen: boolean;
  allowNewTeamCreation: boolean;
  maxTransfersPerWeek: number;
  maxPlayersPerTransfer: number;
}

const SettingsAdminPage: React.FC = () => {
  const { get, put, request, isAuthReady } = useApiClient();
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [updating, setUpdating] = useState<string | null>(null);

  // Danger zone modal state
  const [showDangerModal, setShowDangerModal] = useState(false);
  const [dangerAction, setDangerAction] = useState<'reset-scores' | 'reset-picks' | 'reset-all' | null>(null);
  const [confirmText, setConfirmText] = useState('');
  const [isResetting, setIsResetting] = useState(false);

  const fetchSettings = useCallback(async () => {
    try {
      const response = await get<AppSettings>('settings');
      
      // Ignore cancelled requests
      if (response.cancelled) return;
      
      if (response.success && response.data) {
        setSettings(response.data);
      }
    } catch (err) {
      console.error('Failed to fetch settings:', err);
      setError('Failed to load settings');
    } finally {
      setLoading(false);
    }
  }, [get]);

  useEffect(() => {
    if (isAuthReady) {
      fetchSettings();
    }
  }, [isAuthReady, fetchSettings]);

  const updateSetting = async (key: string, value: boolean | number | string) => {
    setUpdating(key);
    setError('');

    try {
      const response = await put<AppSettings>('settings', { key, value });

      if (!response.success) throw new Error(response.error || 'Failed to update setting');

      setSettings(response.data || null);
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

  const handleDangerAction = async () => {
    if (!dangerAction || confirmText !== 'CONFIRM') return;

    setIsResetting(true);
    setError('');

    try {
      const response = await request<{ message: string }>('settings-reset', {
        method: 'DELETE',
        body: JSON.stringify({ action: dangerAction, confirm: 'CONFIRM' }),
      });

      if (!response.success) throw new Error(response.error || 'Failed to perform reset');

      setSuccess(response.data?.message || 'Reset successful');
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
          description: 'This will delete ALL tournament scores from the database. golfer stats will reset to zero. This action cannot be undone.',
          warning: 'All golfer points, positions, and tournament results will be permanently deleted.',
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
          description: 'This will delete ALL scores AND ALL user picks. Use this to start a fresh season while keeping golfers and tournaments.',
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

          {/* Max Transfers Per Week - only show when transfers are open */}
          {settings?.transfersOpen && (
            <div style={{ marginTop: '1.5rem', padding: '1rem', background: '#f9fafb', borderRadius: '8px', border: '1px solid #e5e7eb' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.25rem' }}>
                    Maximum Transfers Per Week
                  </h3>
                  <p style={{ color: '#6b7280', fontSize: '0.9rem', margin: 0 }}>
                    Number of times users can change their team each week (resets Saturday 8am).
                  </p>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <input
                    type="number"
                    min="1"
                    max="10"
                    value={settings?.maxTransfersPerWeek || 1}
                    onChange={(e) => {
                      const val = parseInt(e.target.value);
                      if (val >= 1 && val <= 10) {
                        updateSetting('maxTransfersPerWeek', val);
                      }
                    }}
                    disabled={updating === 'maxTransfersPerWeek'}
                    style={{
                      width: '80px',
                      padding: '0.5rem 0.75rem',
                      fontSize: '1.25rem',
                      fontWeight: 700,
                      textAlign: 'center',
                      border: '2px solid #d1d5db',
                      borderRadius: '8px',
                    }}
                  />
                  <span style={{ color: '#6b7280', fontSize: '0.9rem' }}>
                    {updating === 'maxTransfersPerWeek' ? 'Saving...' : 'per week'}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Max Players Per Transfer - only show when transfers are open */}
          {settings?.transfersOpen && (
            <div style={{ marginTop: '1rem', padding: '1rem', background: '#f9fafb', borderRadius: '8px', border: '1px solid #e5e7eb' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.25rem' }}>
                    Maximum Players Per Transfer
                  </h3>
                  <p style={{ color: '#6b7280', fontSize: '0.9rem', margin: 0 }}>
                    How many golfers can be swapped in a single transfer (1-6).
                  </p>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <input
                    type="number"
                    min="1"
                    max="6"
                    value={settings?.maxPlayersPerTransfer || 6}
                    onChange={(e) => {
                      const val = parseInt(e.target.value);
                      if (val >= 1 && val <= 6) {
                        updateSetting('maxPlayersPerTransfer', val);
                      }
                    }}
                    disabled={updating === 'maxPlayersPerTransfer'}
                    style={{
                      width: '80px',
                      padding: '0.5rem 0.75rem',
                      fontSize: '1.25rem',
                      fontWeight: 700,
                      textAlign: 'center',
                      border: '2px solid #d1d5db',
                      borderRadius: '8px',
                    }}
                  />
                  <span style={{ color: '#6b7280', fontSize: '0.9rem' }}>
                    {updating === 'maxPlayersPerTransfer' ? 'Saving...' : 'golfer(s)'}
                  </span>
                </div>
              </div>
            </div>
          )}
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
              <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '0.25rem' }}>Budget Cap</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#374151' }}>
                $50M
              </div>
            </div>
            <div style={{ background: '#f9fafb', padding: '1rem', borderRadius: '8px' }}>
              <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '0.25rem' }}>Team Size</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#374151' }}>
                6 golfers
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
                  Delete all tournament scores. golfer stats will reset to zero.
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
                  Delete ALL scores AND picks. Start fresh while keeping golfers and tournaments.
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
