// Login page

import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { useFormValidation, validators, sanitizers, getInputClassName } from '../../utils/validation';
import './LoginPage.css';

interface LoginFormData {
  [key: string]: string;
  username: string;
  password: string;
}

const LoginPage: React.FC = () => {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const { values, setValue, setFieldTouched, validateAll, getFieldState, errors } = useFormValidation<LoginFormData>(
    {
      username: '',
      password: '',
    },
    {
      username: [
        validators.required('Username is required'),
        validators.minLength(3, 'Username must be at least 3 characters'),
      ],
      password: [
        validators.required('Password is required'),
      ],
    }
  );

  const handleChange = (field: keyof LoginFormData) => (e: React.ChangeEvent<HTMLInputElement>) => {
    let value = e.target.value;
    if (field === 'username') {
      value = sanitizers.trim(value);
    }
    setValue(field, value);
  };

  const handleBlur = (field: keyof LoginFormData) => () => {
    setFieldTouched(field);
  };

  const getFieldClassName = (field: keyof LoginFormData): string => {
    const state = getFieldState(field);
    return getInputClassName(state.touched, state.error);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!validateAll()) {
      const firstError = Object.values(errors).find(err => err);
      if (firstError) {
        setError(firstError);
      }
      return;
    }

    setIsLoading(true);

    try {
      await login(sanitizers.trim(values.username), values.password);
      navigate('/dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-container">
        <Link to="/" className="back-link">
          ← Back to Home
        </Link>

        <div className="login-card">
          <div className="login-header">
            <img src="/bearwood_lakes_logo.png" alt="Bearwood Lakes" className="login-logo-img" />
            <h1>Welcome Back</h1>
            <p>Sign in to your Fantasy Golf account</p>
          </div>

          <form onSubmit={handleSubmit} className="login-form">
            {error && <div className="error-message">{error}</div>}

            <div className="form-group">
              <label htmlFor="username">Username<span className="required-indicator">*</span></label>
              <input
                type="text"
                id="username"
                value={values.username}
                onChange={handleChange('username')}
                onBlur={handleBlur('username')}
                placeholder="Enter your username"
                className={getFieldClassName('username')}
                autoComplete="username"
                autoFocus
              />
              {getFieldState('username').touched && getFieldState('username').error && (
                <span className="field-error">{getFieldState('username').error}</span>
              )}
            </div>

            <div className="form-group">
              <label htmlFor="password">Password<span className="required-indicator">*</span></label>
              <input
                type="password"
                id="password"
                value={values.password}
                onChange={handleChange('password')}
                onBlur={handleBlur('password')}
                placeholder="Enter your password"
                className={getFieldClassName('password')}
                autoComplete="current-password"
              />
              {getFieldState('password').touched && getFieldState('password').error && (
                <span className="field-error">{getFieldState('password').error}</span>
              )}
            </div>

            <button type="submit" className="btn btn-primary btn-full" disabled={isLoading}>
              {isLoading ? (
                <span className="btn-loading-spinner">Signing in...</span>
              ) : (
                'Sign In'
              )}
            </button>
          </form>

          <div className="login-footer">
            <p>
              Don't have an account?{' '}
              <Link to="/register" className="link">
                Create one
              </Link>
            </p>
          </div>
        </div>

        <div className="login-decoration">
          <div className="decoration-text">
            🏆 2026 Season Now Open
          </div>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
