// Admin: Users management page

import React, { useCallback, useEffect, useState } from 'react';
import AdminLayout from '../../../components/AdminLayout/AdminLayout';
import LoadingSpinner from '../../../components/ui/LoadingSpinner';
import { useAuth } from '../../../hooks/useAuth';
import { useApiClient } from '../../../hooks/useApiClient';
import { useDocumentTitle } from '../../../hooks/useDocumentTitle';

interface User {
  id: string;
  firstName: string;
  lastName: string;
  username: string;
  email: string;
  role: 'admin' | 'user';
  createdAt: string;
}

const UsersAdminPage: React.FC = () => {
  const { user } = useAuth();
  const { get, put, post, request, isAuthReady } = useApiClient();
  useDocumentTitle('Admin: Users');
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const currentUserId = user?.id || '';

  // View modal state
  const [showViewModal, setShowViewModal] = useState(false);
  const [viewingUser, setViewingUser] = useState<User | null>(null);

  // Reset password modal state
  const [showResetModal, setShowResetModal] = useState(false);
  const [userToReset, setUserToReset] = useState<User | null>(null);
  const [isResetting, setIsResetting] = useState(false);
  const [tempPassword, setTempPassword] = useState<string | null>(null);

  // Delete modal state
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [userToDelete, setUserToDelete] = useState<User | null>(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);

  const fetchUsers = useCallback(async () => {
    try {
      setError(''); // Clear previous errors
      const response = await get<User[]>('users-list');

      // Ignore cancelled requests
      if (response.cancelled) return;

      if (response.success && response.data) {
        setUsers(response.data);
      }
    } catch (err) {
      console.error('Failed to fetch users:', err);
    } finally {
      setLoading(false);
    }
  }, [get]);

  useEffect(() => {
    if (isAuthReady) {
      fetchUsers();
    }
  }, [isAuthReady, fetchUsers]);

  const handleRoleChange = async (user: User, newRole: 'admin' | 'user') => {
    if (user.id === currentUserId) {
      setError('You cannot change your own role');
      setTimeout(() => setError(''), 3000);
      return;
    }

    try {
      const response = await put<User>('users-update-role', {
        userId: user.id,
        role: newRole,
      });

      if (!response.success) throw new Error(response.error || 'Failed to update role');

      setSuccess(`${user.username} is now ${newRole === 'admin' ? 'an Admin' : 'a User'}`);
      fetchUsers();
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      setTimeout(() => setError(''), 3000);
    }
  };

  // View user handlers
  const handleViewUser = (user: User) => {
    setViewingUser(user);
    setShowViewModal(true);
  };

  const handleCloseViewModal = () => {
    setShowViewModal(false);
    setViewingUser(null);
  };

  // Reset password handlers
  const openResetModal = (user: User) => {
    setUserToReset(user);
    setTempPassword(null);
    setShowResetModal(true);
  };

  const handleResetPassword = async () => {
    if (!userToReset) return;

    setIsResetting(true);

    try {
      const response = await post<{ tempPassword: string }>('users-reset-password', {
        userId: userToReset.id,
      });

      if (!response.success) throw new Error(response.error || 'Failed to reset password');

      setTempPassword(response.data?.tempPassword || null);
      setSuccess(`Password reset for ${userToReset.firstName} ${userToReset.lastName}`);
      setTimeout(() => setSuccess(''), 5000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      setTimeout(() => setError(''), 3000);
    } finally {
      setIsResetting(false);
    }
  };

  const handleCloseResetModal = () => {
    setShowResetModal(false);
    setUserToReset(null);
    setTempPassword(null);
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setSuccess('Password copied to clipboard!');
    setTimeout(() => setSuccess(''), 2000);
  };

  const openDeleteModal = (user: User) => {
    setUserToDelete(user);
    setDeleteConfirmText('');
    setShowDeleteModal(true);
  };

  const handleDeleteUser = async () => {
    if (!userToDelete || deleteConfirmText !== 'DELETE') return;

    setIsDeleting(true);

    try {
      const response = await request<void>('users-delete', {
        method: 'DELETE',
        body: JSON.stringify({ userId: userToDelete.id }),
      });

      if (!response.success) throw new Error(response.error || 'Failed to delete user');

      setSuccess(`${userToDelete.username} has been deleted`);
      setShowDeleteModal(false);
      setUserToDelete(null);
      setDeleteConfirmText('');
      fetchUsers();
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      setTimeout(() => setError(''), 3000);
    } finally {
      setIsDeleting(false);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  };

  const adminCount = users.filter((u) => u.role === 'admin').length;
  const userCount = users.filter((u) => u.role === 'user').length;

  return (
    <AdminLayout title="Manage Users">
      {success && <div className="alert alert-success">{success}</div>}
      {error && <div className="alert alert-error">{error}</div>}

      {/* Stats */}
      <div className="stats-row" style={{ marginBottom: '1.5rem' }}>
        <div className="stat-box">
          <div className="stat-box-icon">👥</div>
          <div className="stat-box-value">{users.length}</div>
          <div className="stat-box-label">Total Users</div>
        </div>
        <div className="stat-box">
          <div className="stat-box-icon">👤</div>
          <div className="stat-box-value">{userCount}</div>
          <div className="stat-box-label">Standard Users</div>
        </div>
        <div className="stat-box">
          <div className="stat-box-icon">🛡️</div>
          <div className="stat-box-value">{adminCount}</div>
          <div className="stat-box-label">Administrators</div>
        </div>
      </div>

      <div className="admin-card">
        <div className="admin-card-header">
          <h2>All Users ({users.length})</h2>
        </div>

        {loading ? (
          <div className="admin-card-body">
            <LoadingSpinner text="Loading users..." size="medium" fullPage={false} />
          </div>
        ) : users.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">👥</div>
            <h3>No Users Yet</h3>
            <p>Users will appear here once they register.</p>
          </div>
        ) : (
          <table className="admin-table">
            <thead>
              <tr>
                <th>User</th>
                <th>Email</th>
                <th>Role</th>
                <th>Joined</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id}>
                  <td>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.75rem',
                        cursor: 'pointer',
                      }}
                      onClick={() => handleViewUser(user)}
                    >
                      <div
                        style={{
                          width: '40px',
                          height: '40px',
                          borderRadius: '50%',
                          background:
                            user.role === 'admin'
                              ? 'linear-gradient(135deg, var(--primary-green), var(--secondary-green))'
                              : '#e5e7eb',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: user.role === 'admin' ? 'white' : '#6b7280',
                          fontWeight: 600,
                          fontSize: '0.9rem',
                        }}
                      >
                        {user.firstName[0]}
                        {user.lastName[0]}
                      </div>
                      <div>
                        <div
                          style={{
                            fontWeight: 500,
                            color: 'var(--primary-green)',
                            textDecoration: 'underline',
                          }}
                        >
                          {user.firstName} {user.lastName}
                          {user.id === currentUserId && (
                            <span
                              style={{
                                marginLeft: '0.5rem',
                                fontSize: '0.75rem',
                                color: '#6b7280',
                                textDecoration: 'none',
                              }}
                            >
                              (You)
                            </span>
                          )}
                        </div>
                        <div
                          style={{ fontSize: '0.85rem', color: '#6b7280', textDecoration: 'none' }}
                        >
                          @{user.username}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td style={{ color: '#6b7280' }}>{user.email}</td>
                  <td>
                    <span
                      className={`badge ${user.role === 'admin' ? 'badge-warning' : 'badge-gray'}`}
                    >
                      {user.role === 'admin' ? '🛡️ Admin' : 'User'}
                    </span>
                  </td>
                  <td style={{ color: '#6b7280' }}>{formatDate(user.createdAt)}</td>
                  <td>
                    <div
                      style={{
                        display: 'flex',
                        gap: '0.5rem',
                        alignItems: 'center',
                        flexWrap: 'wrap',
                      }}
                    >
                      {user.id === currentUserId ? (
                        <span style={{ color: '#9ca3af', fontSize: '0.85rem' }}>—</span>
                      ) : (
                        <>
                          <button
                            className="btn btn-secondary btn-sm"
                            onClick={() => openResetModal(user)}
                            title="Reset Password"
                          >
                            🔑 Reset
                          </button>
                          {user.role === 'admin' ? (
                            <button
                              className="btn btn-secondary btn-sm"
                              onClick={() => handleRoleChange(user, 'user')}
                            >
                              Remove Admin
                            </button>
                          ) : (
                            <button
                              className="btn btn-primary btn-sm"
                              onClick={() => handleRoleChange(user, 'admin')}
                            >
                              Make Admin
                            </button>
                          )}
                          <button
                            className="btn btn-sm"
                            style={{ background: '#dc2626', color: 'white' }}
                            onClick={() => openDeleteModal(user)}
                          >
                            Delete
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Info Card */}
      <div
        className="admin-card"
        style={{ marginTop: '1.5rem', background: '#fffbeb', border: '1px solid #fde68a' }}
      >
        <div className="admin-card-body">
          <h3 style={{ fontSize: '1rem', color: '#92400e', marginBottom: '0.5rem' }}>
            ⚠️ Admin Privileges
          </h3>
          <p style={{ color: '#92400e', fontSize: '0.9rem', margin: 0 }}>
            Admins can manage golfers, tournaments, scores, and other users. Only grant admin access
            to trusted members.
          </p>
        </div>
      </div>

      {/* View User Modal */}
      {showViewModal && viewingUser && (
        <div className="modal-overlay" onClick={handleCloseViewModal}>
          <div className="modal" style={{ maxWidth: '550px' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>👤 User Details</h2>
              <button className="modal-close" onClick={handleCloseViewModal}>
                ×
              </button>
            </div>
            <div className="modal-body">
              {/* User Avatar and Name */}
              <div
                style={{
                  display: 'flex',
                  gap: '1.5rem',
                  marginBottom: '1.5rem',
                  alignItems: 'center',
                }}
              >
                <div
                  style={{
                    width: '80px',
                    height: '80px',
                    borderRadius: '50%',
                    background:
                      viewingUser.role === 'admin'
                        ? 'linear-gradient(135deg, var(--primary-green), var(--secondary-green))'
                        : '#e5e7eb',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: viewingUser.role === 'admin' ? 'white' : '#6b7280',
                    fontWeight: 700,
                    fontSize: '1.5rem',
                  }}
                >
                  {viewingUser.firstName[0]}
                  {viewingUser.lastName[0]}
                </div>
                <div>
                  <h3 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '0.25rem' }}>
                    {viewingUser.firstName} {viewingUser.lastName}
                  </h3>
                  <div style={{ color: '#6b7280', marginBottom: '0.5rem' }}>
                    @{viewingUser.username}
                  </div>
                  <span
                    className={`badge ${viewingUser.role === 'admin' ? 'badge-warning' : 'badge-gray'}`}
                  >
                    {viewingUser.role === 'admin' ? '🛡️ Admin' : 'User'}
                  </span>
                </div>
              </div>

              {/* User Info Grid */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1rem' }}>
                <div style={{ background: '#f9fafb', padding: '1rem', borderRadius: '8px' }}>
                  <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '0.25rem' }}>
                    First Name
                  </div>
                  <div style={{ fontWeight: 500 }}>{viewingUser.firstName}</div>
                </div>
                <div style={{ background: '#f9fafb', padding: '1rem', borderRadius: '8px' }}>
                  <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '0.25rem' }}>
                    Last Name
                  </div>
                  <div style={{ fontWeight: 500 }}>{viewingUser.lastName}</div>
                </div>
                <div style={{ background: '#f9fafb', padding: '1rem', borderRadius: '8px' }}>
                  <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '0.25rem' }}>
                    Username
                  </div>
                  <div style={{ fontWeight: 500 }}>@{viewingUser.username}</div>
                </div>
                <div style={{ background: '#f9fafb', padding: '1rem', borderRadius: '8px' }}>
                  <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '0.25rem' }}>
                    Role
                  </div>
                  <div style={{ fontWeight: 500, textTransform: 'capitalize' }}>
                    {viewingUser.role}
                  </div>
                </div>
                <div
                  style={{
                    background: '#f9fafb',
                    padding: '1rem',
                    borderRadius: '8px',
                    gridColumn: 'span 2',
                  }}
                >
                  <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '0.25rem' }}>
                    Email
                  </div>
                  <div style={{ fontWeight: 500 }}>{viewingUser.email}</div>
                </div>
                <div
                  style={{
                    background: '#f9fafb',
                    padding: '1rem',
                    borderRadius: '8px',
                    gridColumn: 'span 2',
                  }}
                >
                  <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '0.25rem' }}>
                    Joined
                  </div>
                  <div style={{ fontWeight: 500 }}>{formatDate(viewingUser.createdAt)}</div>
                </div>
              </div>

              {/* Quick Actions */}
              {viewingUser.id !== currentUserId && (
                <div
                  style={{
                    marginTop: '1.5rem',
                    paddingTop: '1.5rem',
                    borderTop: '1px solid #e5e7eb',
                  }}
                >
                  <h4 style={{ fontSize: '0.9rem', fontWeight: 600, marginBottom: '0.75rem' }}>
                    Quick Actions
                  </h4>
                  <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={() => {
                        handleCloseViewModal();
                        openResetModal(viewingUser);
                      }}
                    >
                      🔑 Reset Password
                    </button>
                    {viewingUser.role === 'admin' ? (
                      <button
                        className="btn btn-secondary btn-sm"
                        onClick={() => {
                          handleCloseViewModal();
                          handleRoleChange(viewingUser, 'user');
                        }}
                      >
                        Remove Admin
                      </button>
                    ) : (
                      <button
                        className="btn btn-primary btn-sm"
                        onClick={() => {
                          handleCloseViewModal();
                          handleRoleChange(viewingUser, 'admin');
                        }}
                      >
                        Make Admin
                      </button>
                    )}
                    <button
                      className="btn btn-sm"
                      style={{ background: '#dc2626', color: 'white' }}
                      onClick={() => {
                        handleCloseViewModal();
                        openDeleteModal(viewingUser);
                      }}
                    >
                      Delete User
                    </button>
                  </div>
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={handleCloseViewModal}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reset Password Modal */}
      {showResetModal && userToReset && (
        <div className="modal-overlay" onClick={handleCloseResetModal}>
          <div className="modal" style={{ maxWidth: '500px' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>🔑 Reset Password</h2>
              <button className="modal-close" onClick={handleCloseResetModal}>
                ×
              </button>
            </div>
            <div className="modal-body">
              {!tempPassword ? (
                <>
                  <p style={{ marginBottom: '1rem' }}>
                    Reset password for{' '}
                    <strong>
                      {userToReset.firstName} {userToReset.lastName}
                    </strong>{' '}
                    (@{userToReset.username})?
                  </p>
                  <div
                    style={{
                      background: '#fffbeb',
                      padding: '1rem',
                      borderRadius: '8px',
                      border: '1px solid #fde68a',
                    }}
                  >
                    <p style={{ color: '#92400e', fontSize: '0.9rem', margin: 0 }}>
                      ℹ️ A temporary password will be generated. You'll need to share this with the
                      user so they can log in and change their password.
                    </p>
                  </div>
                </>
              ) : (
                <>
                  <div className="alert alert-success" style={{ marginBottom: '1rem' }}>
                    ✅ Password reset successfully!
                  </div>
                  <p style={{ marginBottom: '1rem' }}>
                    The temporary password for <strong>{userToReset.firstName}</strong> is:
                  </p>
                  <div
                    style={{
                      background: '#f3f4f6',
                      padding: '1rem',
                      borderRadius: '8px',
                      fontFamily: 'monospace',
                      fontSize: '1.25rem',
                      textAlign: 'center',
                      letterSpacing: '0.1em',
                      marginBottom: '1rem',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '1rem',
                    }}
                  >
                    <span>{tempPassword}</span>
                    <button
                      className="btn btn-primary btn-sm"
                      onClick={() => copyToClipboard(tempPassword)}
                    >
                      📋 Copy
                    </button>
                  </div>
                  <div
                    style={{
                      background: '#fef2f2',
                      padding: '1rem',
                      borderRadius: '8px',
                      border: '1px solid #fecaca',
                    }}
                  >
                    <p style={{ color: '#dc2626', fontSize: '0.9rem', margin: 0 }}>
                      ⚠️ <strong>Important:</strong> Make sure to copy this password now. Once you
                      close this modal, it won't be shown again!
                    </p>
                  </div>
                </>
              )}
            </div>
            <div className="modal-footer">
              {!tempPassword ? (
                <>
                  <button className="btn btn-secondary" onClick={handleCloseResetModal}>
                    Cancel
                  </button>
                  <button
                    className="btn btn-primary"
                    onClick={handleResetPassword}
                    disabled={isResetting}
                  >
                    {isResetting ? 'Resetting...' : 'Reset Password'}
                  </button>
                </>
              ) : (
                <button className="btn btn-primary" onClick={handleCloseResetModal}>
                  Done
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteModal && userToDelete && (
        <div className="modal-overlay" onClick={() => setShowDeleteModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>⚠️ Delete User</h2>
              <button className="modal-close" onClick={() => setShowDeleteModal(false)}>
                ×
              </button>
            </div>
            <div className="modal-body">
              <p style={{ marginBottom: '1rem' }}>
                You are about to delete{' '}
                <strong>
                  {userToDelete.firstName} {userToDelete.lastName}
                </strong>{' '}
                (@{userToDelete.username}).
              </p>
              <p
                style={{
                  background: '#fef2f2',
                  padding: '1rem',
                  borderRadius: '8px',
                  borderLeft: '4px solid #dc2626',
                  marginBottom: '1rem',
                }}
              >
                This action <strong>cannot be undone</strong>. All their picks and data will be
                permanently removed.
              </p>
              <p>
                Type <strong>DELETE</strong> to confirm:
              </p>
              <input
                id="confirm-delete-user"
                name="confirm-delete-user"
                type="text"
                value={deleteConfirmText}
                onChange={(e) => setDeleteConfirmText(e.target.value)}
                placeholder="Type DELETE to confirm"
                style={{
                  width: '100%',
                  padding: '0.75rem 1rem',
                  border: '2px solid #e5e7eb',
                  borderRadius: '8px',
                  fontSize: '1rem',
                  marginTop: '0.5rem',
                }}
              />
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowDeleteModal(false)}>
                Cancel
              </button>
              <button
                className="btn"
                style={{ background: '#dc2626', color: 'white' }}
                onClick={handleDeleteUser}
                disabled={isDeleting || deleteConfirmText !== 'DELETE'}
              >
                {isDeleting ? 'Deleting...' : 'Delete User'}
              </button>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
};

export default UsersAdminPage;
