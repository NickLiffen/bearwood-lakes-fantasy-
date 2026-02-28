// Register page

import React, { useState, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import {
  useFormValidation,
  validators,
  sanitizers,
  getInputClassName,
} from '../../utils/validation';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import './LoginPage.css'; // Reuse same styles

interface RegisterFormData {
  [key: string]: string;
  firstName: string;
  lastName: string;
  username: string;
  email: string;
  phoneNumber: string;
  password: string;
  confirmPassword: string;
}

const RegisterPage: React.FC = () => {
  const navigate = useNavigate();
  const { register } = useAuth();
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const passwordRef = useRef('');

  const { values, setValue, setFieldTouched, validateAll, getFieldState, errors } =
    useFormValidation<RegisterFormData>(
      {
        firstName: '',
        lastName: '',
        username: '',
        email: '',
        phoneNumber: '',
        password: '',
        confirmPassword: '',
      },
      {
        firstName: [
          validators.required('First name is required'),
          validators.lettersOnly('First name can only contain letters'),
          validators.minLength(2, 'First name must be at least 2 characters'),
        ],
        lastName: [
          validators.required('Last name is required'),
          validators.lettersOnly('Last name can only contain letters'),
          validators.minLength(2, 'Last name must be at least 2 characters'),
        ],
        username: [
          validators.required('Username is required'),
          validators.alphanumeric('Username can only contain letters and numbers'),
          validators.minLength(3, 'Username must be at least 3 characters'),
          validators.maxLength(20, 'Username must be at most 20 characters'),
        ],
        email: [
          validators.required('Email is required'),
          validators.email('Please enter a valid email address'),
        ],
        phoneNumber: [
          validators.required('Phone number is required'),
          validators.ukPhone('Please enter 9 digits for your UK mobile number'),
        ],
        password: [
          validators.required('Password is required'),
          validators.password(
            'Password must be at least 8 characters with uppercase, lowercase, number, and special character'
          ),
        ],
        confirmPassword: [
          validators.required('Please confirm your password'),
          validators.passwordMatch(() => passwordRef.current, 'Passwords do not match'),
        ],
      }
    );
  useDocumentTitle('Register');

  const handleChange =
    (field: keyof RegisterFormData) => (e: React.ChangeEvent<HTMLInputElement>) => {
      let value = e.target.value;
      // Apply sanitizers
      if (field === 'firstName' || field === 'lastName') {
        value = sanitizers.trimAndCapitalize(value);
      } else if (field === 'email') {
        value = sanitizers.lowercase(sanitizers.trim(value));
      } else if (field === 'username') {
        value = sanitizers.trim(value).toLowerCase();
      } else if (field === 'phoneNumber') {
        value = sanitizers.digitsOnly(value).slice(0, 11);
      }
      // Keep password ref in sync
      if (field === 'password') {
        passwordRef.current = value;
      }
      setValue(field, value);
    };

  const handleBlur = (field: keyof RegisterFormData) => () => {
    setFieldTouched(field);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // Validate all fields
    if (!validateAll()) {
      // Find first error to display
      const firstError = Object.values(errors).find((err) => err);
      if (firstError) {
        setError(firstError);
      }
      return;
    }

    setIsLoading(true);

    try {
      await register({
        firstName: sanitizers.trim(values.firstName),
        lastName: sanitizers.trim(values.lastName),
        username: sanitizers.trim(values.username),
        email: sanitizers.lowercase(sanitizers.trim(values.email)),
        phoneNumber: `+44${sanitizers.digitsOnly(values.phoneNumber).replace(/^0/, '')}`,
        password: values.password,
      });

      navigate('/verify-phone');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed');
    } finally {
      setIsLoading(false);
    }
  };

  const getFieldClassName = (field: keyof RegisterFormData): string => {
    const state = getFieldState(field);
    return getInputClassName(state.touched, state.error);
  };

  return (
    <div className="login-page">
      <div className="login-container">
        <Link to="/" className="back-link">
          ← Back to Home
        </Link>

        <div className="login-card">
          <div className="login-header">
            <img
              src="/bearwood_lakes_logo.png"
              alt="Bearwood Lakes"
              className="login-logo-img"
              width="80"
              height="80"
            />
            <h1>Join the League</h1>
            <p>Create your Fantasy Golf account</p>
          </div>

          <form onSubmit={handleSubmit} className="login-form">
            {error && <div className="error-message">{error}</div>}

            <div className="form-row">
              <div className="form-group">
                <label htmlFor="firstName">
                  First Name<span className="required-indicator">*</span>
                </label>
                <input
                  type="text"
                  id="firstName"
                  value={values.firstName}
                  onChange={handleChange('firstName')}
                  onBlur={handleBlur('firstName')}
                  placeholder="First name"
                  className={getFieldClassName('firstName')}
                />
                {getFieldState('firstName').touched && getFieldState('firstName').error && (
                  <span className="field-error">{getFieldState('firstName').error}</span>
                )}
              </div>

              <div className="form-group">
                <label htmlFor="lastName">
                  Last Name<span className="required-indicator">*</span>
                </label>
                <input
                  type="text"
                  id="lastName"
                  value={values.lastName}
                  onChange={handleChange('lastName')}
                  onBlur={handleBlur('lastName')}
                  placeholder="Last name"
                  className={getFieldClassName('lastName')}
                />
                {getFieldState('lastName').touched && getFieldState('lastName').error && (
                  <span className="field-error">{getFieldState('lastName').error}</span>
                )}
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="username">
                Username<span className="required-indicator">*</span>
              </label>
              <input
                type="text"
                id="username"
                value={values.username}
                onChange={handleChange('username')}
                onBlur={handleBlur('username')}
                placeholder="Choose a username"
                className={getFieldClassName('username')}
                autoComplete="username"
              />
              {getFieldState('username').touched && getFieldState('username').error && (
                <span className="field-error">{getFieldState('username').error}</span>
              )}
            </div>

            <div className="form-group">
              <label htmlFor="email">
                Email<span className="required-indicator">*</span>
              </label>
              <input
                type="email"
                id="email"
                value={values.email}
                onChange={handleChange('email')}
                onBlur={handleBlur('email')}
                placeholder="your@email.com"
                className={getFieldClassName('email')}
                autoComplete="email"
              />
              {getFieldState('email').touched && getFieldState('email').error && (
                <span className="field-error">{getFieldState('email').error}</span>
              )}
            </div>

            <div className="form-group">
              <label htmlFor="phoneNumber">
                UK Mobile Number<span className="required-indicator">*</span>
              </label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span
                  style={{
                    padding: '0.625rem 0.75rem',
                    background: 'var(--bg-tertiary, #2a2a2a)',
                    border: '1px solid var(--border-color, #404040)',
                    borderRadius: '0.5rem',
                    color: 'var(--text-secondary, #a0a0a0)',
                    fontSize: '0.95rem',
                    fontFamily: 'monospace',
                    whiteSpace: 'nowrap',
                  }}
                >
                  +44
                </span>
                <input
                  type="tel"
                  id="phoneNumber"
                  value={values.phoneNumber}
                  onChange={handleChange('phoneNumber')}
                  onBlur={handleBlur('phoneNumber')}
                  placeholder="07900 165650"
                  maxLength={11}
                  inputMode="numeric"
                  pattern="[0-9]*"
                  className={getFieldClassName('phoneNumber')}
                  autoComplete="tel"
                  style={{ flex: 1 }}
                />
              </div>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-tertiary, #888)', marginTop: '0.25rem', display: 'block' }}>
                We&apos;ll send a verification code to this number
              </span>
              {getFieldState('phoneNumber').touched && getFieldState('phoneNumber').error && (
                <span className="field-error">{getFieldState('phoneNumber').error}</span>
              )}
            </div>

            <div className="form-group">
              <label htmlFor="password">
                Password<span className="required-indicator">*</span>
              </label>
              <input
                type="password"
                id="password"
                value={values.password}
                onChange={handleChange('password')}
                onBlur={handleBlur('password')}
                placeholder="At least 8 characters"
                className={getFieldClassName('password')}
                autoComplete="new-password"
              />
              {getFieldState('password').touched && getFieldState('password').error && (
                <span className="field-error">{getFieldState('password').error}</span>
              )}
            </div>

            <div className="form-group">
              <label htmlFor="confirmPassword">
                Confirm Password<span className="required-indicator">*</span>
              </label>
              <input
                type="password"
                id="confirmPassword"
                value={values.confirmPassword}
                onChange={handleChange('confirmPassword')}
                onBlur={handleBlur('confirmPassword')}
                placeholder="Confirm your password"
                className={getFieldClassName('confirmPassword')}
                autoComplete="new-password"
              />
              {getFieldState('confirmPassword').touched &&
                getFieldState('confirmPassword').error && (
                  <span className="field-error">{getFieldState('confirmPassword').error}</span>
                )}
            </div>

            <button type="submit" className="btn btn-primary btn-full" disabled={isLoading}>
              {isLoading ? (
                <span className="btn-loading-spinner">Creating account...</span>
              ) : (
                'Create Account'
              )}
            </button>
          </form>

          <div className="login-footer">
            <p>
              Already have an account?{' '}
              <Link to="/login" className="link">
                Sign in
              </Link>
            </p>
          </div>
        </div>

        <div className="login-decoration">
          <div className="decoration-text">🏆 2026 Season Now Open</div>
        </div>
      </div>
    </div>
  );
};

export default RegisterPage;
