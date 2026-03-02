// Admin Leagues management page

import React, { useState, useEffect, useCallback } from 'react';
import AdminLayout from '../../../components/AdminLayout/AdminLayout';
import LoadingSpinner from '../../../components/ui/LoadingSpinner';
import { useApiClient } from '../../../hooks/useApiClient';

interface MemberInfo {
  userId: string;
  firstName: string;
  lastName: string;
  username: string;
  isAdmin: boolean;
}

interface AdminLeague {
  id: string;
  name: string;
  description: string;
  inviteCode: string;
  memberCount: number;
  maxMembers: number;
  createdAt: string;
  admin: { userId: string; firstName: string; lastName: string; username: string };
  members: MemberInfo[];
}

const LeaguesAdminPage: React.FC = () => {
  const { get, post, del, isAuthReady } = useApiClient();
  const [leagues, setLeagues] = useState<AdminLeague[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [expandedLeague, setExpandedLeague] = useState<string | null>(null);

  const fetchLeagues = useCallback(async () => {
    try {
      const response = await get<AdminLeague[]>('leagues-admin-list');
      if (response.cancelled) return;
      if (response.success && response.data) {
        setLeagues(response.data);
      }
    } catch {
      setError('Failed to load leagues');
    } finally {
      setLoading(false);
    }
  }, [get]);

  useEffect(() => {
    if (isAuthReady) fetchLeagues();
  }, [isAuthReady, fetchLeagues]);

  const handleTransferAdmin = async (leagueId: string, newAdminId: string) => {
    if (!confirm('Transfer admin ownership to this member?')) return;
    setError('');
    try {
      const response = await post('leagues-transfer-admin', { leagueId, newAdminId });
      if (response.success) {
        setSuccess('Admin transferred successfully');
        fetchLeagues();
        setTimeout(() => setSuccess(''), 3000);
      } else {
        setError(response.error || 'Failed to transfer admin');
      }
    } catch {
      setError('Failed to transfer admin');
    }
  };

  const handleDeleteLeague = async (leagueId: string, leagueName: string) => {
    if (!confirm(`Delete league "${leagueName}"? This cannot be undone.`)) return;
    setError('');
    try {
      const response = await del('leagues-delete', { body: JSON.stringify({ leagueId }) });
      if (response.success) {
        setSuccess('League deleted');
        fetchLeagues();
        setTimeout(() => setSuccess(''), 3000);
      } else {
        setError(response.error || 'Failed to delete league');
      }
    } catch {
      setError('Failed to delete league');
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  };

  return (
    <AdminLayout title="Leagues">
      <div style={{ padding: '1rem' }}>
        <h2>Leagues Management</h2>
        <p style={{ color: '#6b7280', marginBottom: '1.5rem' }}>
          View and manage all custom leagues — {leagues.length} league{leagues.length !== 1 ? 's' : ''} total
        </p>

        {error && (
          <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '0.75rem 1rem', color: '#dc2626', marginBottom: '1rem' }}>
            ⚠️ {error}
          </div>
        )}
        {success && (
          <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '8px', padding: '0.75rem 1rem', color: '#059669', marginBottom: '1rem' }}>
            ✅ {success}
          </div>
        )}

        {loading ? (
          <LoadingSpinner text="Loading leagues..." />
        ) : leagues.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '3rem', color: '#6b7280' }}>
            <div style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>🏆</div>
            <p>No leagues have been created yet.</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {leagues.map((league) => (
              <div
                key={league.id}
                style={{
                  background: 'white',
                  border: '1px solid #e5e7eb',
                  borderRadius: '12px',
                  overflow: 'hidden',
                }}
              >
                {/* League header row */}
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '1rem 1.25rem',
                    cursor: 'pointer',
                    background: expandedLeague === league.id ? '#f9fafb' : 'white',
                  }}
                  onClick={() => setExpandedLeague(expandedLeague === league.id ? null : league.id)}
                >
                  <div>
                    <div style={{ fontWeight: 600, fontSize: '1.05rem' }}>
                      {league.name}
                      <span style={{ fontWeight: 400, color: '#6b7280', fontSize: '0.85rem', marginLeft: '0.75rem' }}>
                        {league.memberCount} member{league.memberCount !== 1 ? 's' : ''}
                      </span>
                    </div>
                    <div style={{ fontSize: '0.85rem', color: '#6b7280', marginTop: '0.25rem' }}>
                      Admin: <strong>{league.admin.firstName} {league.admin.lastName}</strong> (@{league.admin.username})
                      &nbsp;·&nbsp;Code: <code style={{ background: '#f3f4f6', padding: '0.1rem 0.4rem', borderRadius: '4px' }}>{league.inviteCode}</code>
                      &nbsp;·&nbsp;Created: {formatDate(league.createdAt)}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={(e) => { e.stopPropagation(); handleDeleteLeague(league.id, league.name); }}
                      style={{ color: '#dc2626', fontSize: '0.8rem' }}
                    >
                      Delete
                    </button>
                    <span style={{ color: '#9ca3af' }}>{expandedLeague === league.id ? '▲' : '▼'}</span>
                  </div>
                </div>

                {/* Expanded member list */}
                {expandedLeague === league.id && (
                  <div style={{ borderTop: '1px solid #e5e7eb', padding: '1rem 1.25rem' }}>
                    <h4 style={{ marginBottom: '0.75rem' }}>Members</h4>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr style={{ borderBottom: '1px solid #e5e7eb', textAlign: 'left' }}>
                          <th style={{ padding: '0.5rem 0.75rem', fontSize: '0.85rem', color: '#6b7280' }}>Name</th>
                          <th style={{ padding: '0.5rem 0.75rem', fontSize: '0.85rem', color: '#6b7280' }}>Username</th>
                          <th style={{ padding: '0.5rem 0.75rem', fontSize: '0.85rem', color: '#6b7280' }}>Role</th>
                          <th style={{ padding: '0.5rem 0.75rem', fontSize: '0.85rem', color: '#6b7280', textAlign: 'right' }}>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {league.members.map((member) => (
                          <tr key={member.userId} style={{ borderBottom: '1px solid #f3f4f6' }}>
                            <td style={{ padding: '0.5rem 0.75rem' }}>
                              {member.firstName} {member.lastName}
                            </td>
                            <td style={{ padding: '0.5rem 0.75rem', color: '#6b7280' }}>
                              @{member.username}
                            </td>
                            <td style={{ padding: '0.5rem 0.75rem' }}>
                              {member.isAdmin ? (
                                <span style={{ color: 'var(--primary-green, #059669)', fontWeight: 600 }}>Admin</span>
                              ) : (
                                <span style={{ color: '#6b7280' }}>Member</span>
                              )}
                            </td>
                            <td style={{ padding: '0.5rem 0.75rem', textAlign: 'right' }}>
                              {!member.isAdmin && (
                                <button
                                  className="btn btn-secondary btn-sm"
                                  style={{ fontSize: '0.75rem' }}
                                  onClick={() => handleTransferAdmin(league.id, member.userId)}
                                >
                                  Make Admin
                                </button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </AdminLayout>
  );
};

export default LeaguesAdminPage;
