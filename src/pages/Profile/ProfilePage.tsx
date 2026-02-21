// Profile page for logged in users

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { validators, sanitizers, getInputClassName } from '../../utils/validation';
import PageLayout from '../../components/layout/PageLayout';
import { useAuth } from '../../hooks/useAuth';
import { useApiClient } from '../../hooks/useApiClient';
import './ProfilePage.css';

interface User {
  id: string;
  firstName: string;
  lastName: string;
  username: string;
  email: string;
  role: 'admin' | 'user';
}

const ProfilePage: React.FC = () => {
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);

  // Profile form
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');

  // Password form
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');

  // UI state
  const [profileSuccess, setProfileSuccess] = useState('');
  const [profileError, setProfileError] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [isUpdatingProfile, setIsUpdatingProfile] = useState(false);
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);

  // Delete account state
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  // Form validation state
  const [profileTouched, setProfileTouched] = useState<Record<string, boolean>>({});
  const [profileFieldErrors, setProfileFieldErrors] = useState<Record<string, string>>({});
  const [passwordTouched, setPasswordTouched] = useState<Record<string, boolean>>({});
  const [passwordFieldErrors, setPasswordFieldErrors] = useState<Record<string, string>>({});

  // Profile field validation
  const validateProfileField = (field: string, value: string): string => {
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
      case 'email': {
        if (!value.trim()) return 'Email is required';
        const emailValidator = validators.email();
        const emailError = emailValidator(value);
        if (emailError) return 'Please enter a valid email address';
        return '';
      }
      default:
        return '';
    }
  };

  // Password field validation
  const validatePasswordField = (field: string, value: string): string => {
    switch (field) {
      case 'currentPassword':
        if (!value) return 'Current password is required';
        return '';
      case 'newPassword':
        if (!value) return 'New password is required';
        if (value.length < 8) return 'Password must be at least 8 characters';
        return '';
      case 'confirmNewPassword':
        if (!value) return 'Please confirm your new password';
        if (value !== newPassword) return 'Passwords do not match';
        return '';
      default:
        return '';
    }
  };

  const handleProfileChange = (field: string, value: string, setter: (v: string) => void) => {
    let sanitizedValue = value;
    if (field === 'firstName' || field === 'lastName') {
      sanitizedValue = sanitizers.trimAndCapitalize(value);
    } else if (field === 'email') {
      sanitizedValue = sanitizers.lowercase(sanitizers.trim(value));
    }
    setter(sanitizedValue);
    
    if (profileTouched[field]) {
      setProfileFieldErrors({ ...profileFieldErrors, [field]: validateProfileField(field, sanitizedValue) });
    }
  };

  const handleProfileBlur = (field: string, value: string) => {
    setProfileTouched({ ...profileTouched, [field]: true });
    setProfileFieldErrors({ ...profileFieldErrors, [field]: validateProfileField(field, value) });
  };

  const handlePasswordChange = (field: string, value: string, setter: (v: string) => void) => {
    setter(value);
    
    if (passwordTouched[field]) {
      setPasswordFieldErrors({ ...passwordFieldErrors, [field]: validatePasswordField(field, value) });
    }
    
    // Re-validate confirmNewPassword when newPassword changes
    if (field === 'newPassword' && passwordTouched.confirmNewPassword) {
      setPasswordFieldErrors(prev => ({ 
        ...prev, 
        confirmNewPassword: confirmNewPassword !== value ? 'Passwords do not match' : '' 
      }));
    }
  };

  const handlePasswordBlur = (field: string, value: string) => {
    setPasswordTouched({ ...passwordTouched, [field]: true });
    setPasswordFieldErrors({ ...passwordFieldErrors, [field]: validatePasswordField(field, value) });
  };

  const getProfileFieldClass = (field: string): string => {
    if (!profileTouched[field]) return '';
    return getInputClassName(profileTouched[field], profileFieldErrors[field]);
  };

  const getPasswordFieldClass = (field: string): string => {
    if (!passwordTouched[field]) return '';
    return getInputClassName(passwordTouched[field], passwordFieldErrors[field]);
  };

  const validateAllProfileFields = (): boolean => {
    const errors: Record<string, string> = {};
    errors.firstName = validateProfileField('firstName', firstName);
    errors.lastName = validateProfileField('lastName', lastName);
    errors.email = validateProfileField('email', email);
    
    setProfileTouched({ firstName: true, lastName: true, email: true });
    setProfileFieldErrors(errors);
    
    return !errors.firstName && !errors.lastName && !errors.email;
  };

  const validateAllPasswordFields = (): boolean => {
    const errors: Record<string, string> = {};
    errors.currentPassword = validatePasswordField('currentPassword', currentPassword);
    errors.newPassword = validatePasswordField('newPassword', newPassword);
    errors.confirmNewPassword = validatePasswordField('confirmNewPassword', confirmNewPassword);
    
    setPasswordTouched({ currentPassword: true, newPassword: true, confirmNewPassword: true });
    setPasswordFieldErrors(errors);
    
    return !errors.currentPassword && !errors.newPassword && !errors.confirmNewPassword;
  };

  const { user: authUser, logout: authLogout } = useAuth();
  const { put, del } = useApiClient();

  useEffect(() => {
    if (authUser) {
      setUser(authUser as User);
      setFirstName(authUser.firstName);
      setLastName(authUser.lastName);
      setEmail(authUser.email);
    } else {
      navigate('/login');
    }
  }, [authUser, navigate]);

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileError('');
    setProfileSuccess('');

    // Validate all fields before submission
    if (!validateAllProfileFields()) {
      setProfileError('Please fix the validation errors before submitting');
      return;
    }

    setIsUpdatingProfile(true);

    try {
      const response = await put<User>('users-update-profile', { 
        firstName: sanitizers.trim(firstName), 
        lastName: sanitizers.trim(lastName), 
        email: sanitizers.lowercase(sanitizers.trim(email)) 
      });

      if (!response.success) throw new Error(response.error || 'Failed to update profile');

      // Update local storage
      const updatedUser = { ...user, firstName, lastName, email };
      localStorage.setItem('user', JSON.stringify(updatedUser));
      setUser(updatedUser as User);

      setProfileSuccess('Profile updated successfully!');
      setTimeout(() => setProfileSuccess(''), 3000);
    } catch (err) {
      setProfileError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setIsUpdatingProfile(false);
    }
  };

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError('');
    setPasswordSuccess('');

    // Validate all fields before submission
    if (!validateAllPasswordFields()) {
      setPasswordError('Please fix the validation errors before submitting');
      return;
    }

    setIsUpdatingPassword(true);

    try {
      const response = await put('users-update-password', { currentPassword, newPassword });

      if (!response.success) throw new Error(response.error || 'Failed to update password');

      setPasswordSuccess('Password updated successfully!');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmNewPassword('');
      setPasswordTouched({});
      setPasswordFieldErrors({});
      setTimeout(() => setPasswordSuccess(''), 3000);
    } catch (err) {
      setPasswordError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setIsUpdatingPassword(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (deleteConfirmText !== 'DELETE') {
      setDeleteError('Please type DELETE to confirm');
      return;
    }

    setIsDeleting(true);
    setDeleteError('');

    try {
      const response = await del('users-delete-account');

      if (!response.success) throw new Error(response.error || 'Failed to delete account');

      // Clear storage and redirect using auth logout
      authLogout();
      navigate('/');
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'An error occurred');
      setIsDeleting(false);
    }
  };

  if (!user) {
    return null;
  }

  return (
    <PageLayout activeNav="profile">
      <div className="profile-content">
        <div className="profile-container">
          <div className="profile-header">
            <div className="profile-avatar">
              {user.firstName[0]}
              {user.lastName[0]}
            </div>
            <div className="profile-info">
              <h1>
                {user.firstName} {user.lastName}
              </h1>
              <p>@{user.username}</p>
              {user.role === 'admin' && <span className="admin-badge">🛡️ Admin</span>}
            </div>
          </div>

          {/* Update Profile Section */}
          <div className="profile-card">
            <div className="profile-card-header">
              <h2>Profile Information</h2>
            </div>
            <form onSubmit={handleUpdateProfile} className="profile-form">
              {profileSuccess && <div className="alert alert-success">{profileSuccess}</div>}
              {profileError && <div className="alert alert-error">{profileError}</div>}

              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="firstName">First Name<span className="required-indicator">*</span></label>
                  <input
                  type="text"
                  id="firstName"
                  className={getProfileFieldClass('firstName')}
                  value={firstName}
                  onChange={(e) => handleProfileChange('firstName', e.target.value, setFirstName)}
                  onBlur={() => handleProfileBlur('firstName', firstName)}
                />
                {profileTouched.firstName && profileFieldErrors.firstName && (
                  <span className="field-error">{profileFieldErrors.firstName}</span>
                )}
              </div>
              <div className="form-group">
                <label htmlFor="lastName">Last Name<span className="required-indicator">*</span></label>
                <input
                  type="text"
                  id="lastName"
                  className={getProfileFieldClass('lastName')}
                  value={lastName}
                  onChange={(e) => handleProfileChange('lastName', e.target.value, setLastName)}
                  onBlur={() => handleProfileBlur('lastName', lastName)}
                />
                {profileTouched.lastName && profileFieldErrors.lastName && (
                  <span className="field-error">{profileFieldErrors.lastName}</span>
                )}
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="email">Email<span className="required-indicator">*</span></label>
              <input
                type="email"
                id="email"
                className={getProfileFieldClass('email')}
                value={email}
                onChange={(e) => handleProfileChange('email', e.target.value, setEmail)}
                onBlur={() => handleProfileBlur('email', email)}
              />
              {profileTouched.email && profileFieldErrors.email && (
                <span className="field-error">{profileFieldErrors.email}</span>
              )}
            </div>

            <div className="form-group">
              <label htmlFor="username">Username</label>
              <input type="text" id="username" value={user.username} disabled className="disabled" />
              <span className="form-hint">Username cannot be changed</span>
            </div>

            <button type="submit" className="btn btn-primary" disabled={isUpdatingProfile}>
              {isUpdatingProfile ? 'Saving...' : 'Save Changes'}
            </button>
          </form>
        </div>

        {/* Change Password Section */}
        <div className="profile-card">
          <div className="profile-card-header">
            <h2>Change Password</h2>
          </div>
          <form onSubmit={handleUpdatePassword} className="profile-form">
            {passwordSuccess && <div className="alert alert-success">{passwordSuccess}</div>}
            {passwordError && <div className="alert alert-error">{passwordError}</div>}

            <div className="form-group">
              <label htmlFor="currentPassword">Current Password<span className="required-indicator">*</span></label>
              <input
                type="password"
                id="currentPassword"
                className={getPasswordFieldClass('currentPassword')}
                value={currentPassword}
                onChange={(e) => handlePasswordChange('currentPassword', e.target.value, setCurrentPassword)}
                onBlur={() => handlePasswordBlur('currentPassword', currentPassword)}
                autoComplete="current-password"
              />
              {passwordTouched.currentPassword && passwordFieldErrors.currentPassword && (
                <span className="field-error">{passwordFieldErrors.currentPassword}</span>
              )}
            </div>

            <div className="form-group">
              <label htmlFor="newPassword">New Password<span className="required-indicator">*</span></label>
              <input
                type="password"
                id="newPassword"
                className={getPasswordFieldClass('newPassword')}
                value={newPassword}
                onChange={(e) => handlePasswordChange('newPassword', e.target.value, setNewPassword)}
                onBlur={() => handlePasswordBlur('newPassword', newPassword)}
                placeholder="At least 8 characters"
                autoComplete="new-password"
              />
              {passwordTouched.newPassword && passwordFieldErrors.newPassword && (
                <span className="field-error">{passwordFieldErrors.newPassword}</span>
              )}
            </div>

            <div className="form-group">
              <label htmlFor="confirmNewPassword">Confirm New Password<span className="required-indicator">*</span></label>
              <input
                type="password"
                id="confirmNewPassword"
                className={getPasswordFieldClass('confirmNewPassword')}
                value={confirmNewPassword}
                onChange={(e) => handlePasswordChange('confirmNewPassword', e.target.value, setConfirmNewPassword)}
                onBlur={() => handlePasswordBlur('confirmNewPassword', confirmNewPassword)}
                autoComplete="new-password"
              />
              {passwordTouched.confirmNewPassword && passwordFieldErrors.confirmNewPassword && (
                <span className="field-error">{passwordFieldErrors.confirmNewPassword}</span>
              )}
            </div>

            <button type="submit" className="btn btn-primary" disabled={isUpdatingPassword}>
              {isUpdatingPassword ? 'Updating...' : 'Update Password'}
            </button>
          </form>
        </div>

        {/* Danger Zone */}
        <div className="profile-card danger-zone">
          <div className="profile-card-header">
            <h2>⚠️ Danger Zone</h2>
          </div>
          <div className="profile-card-body">
            <p>
              Once you delete your account, there is no going back. All your picks and data will be
              permanently removed.
            </p>
            <button className="btn btn-danger" onClick={() => setShowDeleteModal(true)}>
              Delete Account
            </button>
          </div>
          </div>
        </div>

        {/* Delete Confirmation Modal */}
        {showDeleteModal && (
          <div className="modal-overlay" onClick={() => setShowDeleteModal(false)}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h2>⚠️ Delete Account</h2>
                <button className="modal-close" onClick={() => setShowDeleteModal(false)}>
                  ×
                </button>
              </div>
              <div className="modal-body">
                <p className="warning-text">
                  This action <strong>cannot be undone</strong>. This will permanently delete your
                  account and remove all your data from our servers.
                </p>
                <p>
                  Please type <strong>DELETE</strong> to confirm:
                </p>
                {deleteError && <div className="alert alert-error">{deleteError}</div>}
                <input
                  id="confirm-delete-account"
                  name="confirm-delete-account"
                  type="text"
                  value={deleteConfirmText}
                  onChange={(e) => setDeleteConfirmText(e.target.value)}
                  placeholder="Type DELETE to confirm"
                  className="delete-confirm-input"
                />
              </div>
              <div className="modal-footer">
                <button className="btn btn-secondary" onClick={() => setShowDeleteModal(false)}>
                  Cancel
                </button>
                <button
                  className="btn btn-danger"
                  onClick={handleDeleteAccount}
                  disabled={isDeleting || deleteConfirmText !== 'DELETE'}
                >
                  {isDeleting ? 'Deleting...' : 'Delete My Account'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </PageLayout>
  );
};

export default ProfilePage;
