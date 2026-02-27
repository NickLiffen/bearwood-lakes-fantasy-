// Verify phone page — OTP code entry after registration

import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import './LoginPage.css';

const RESEND_COOLDOWN_SECONDS = 30;

function maskPhoneNumber(phone: string | null): string {
  if (!phone || phone.length < 6) return '••••••••••';
  return phone.slice(0, 4) + '•••••' + phone.slice(-2);
}

const VerifyPhonePage: React.FC = () => {
  const navigate = useNavigate();
  const { user, token, logout, loading } = useAuth();
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  useDocumentTitle('Verify Phone');

  // If user is already verified, redirect to dashboard
  useEffect(() => {
    if (!loading && user?.phoneVerified) {
      navigate('/dashboard', { replace: true });
    }
  }, [user, loading, navigate]);

  // Cooldown timer
  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  const handleCodeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.replace(/\D/g, '').slice(0, 6);
    setCode(value);
    setError('');
  };

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setError('');
      setSuccess('');

      if (code.length !== 6) {
        setError('Please enter a 6-digit code');
        return;
      }

      setIsSubmitting(true);

      try {
        const response = await fetch('/.netlify/functions/verify-phone-check', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          credentials: 'include',
          body: JSON.stringify({ code }),
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || 'Verification failed');
        }

        // Update stored auth with new verified token/user
        localStorage.setItem('token', data.data.token);
        localStorage.setItem('user', JSON.stringify(data.data.user));

        setSuccess('Phone verified! Redirecting...');
        setTimeout(() => {
          // Force page reload to pick up new auth state
          window.location.href = '/dashboard';
        }, 1000);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Verification failed');
      } finally {
        setIsSubmitting(false);
      }
    },
    [code, token]
  );

  const handleResend = useCallback(async () => {
    if (cooldown > 0 || isResending) return;

    setIsResending(true);
    setError('');
    setSuccess('');

    try {
      const response = await fetch('/.netlify/functions/verify-phone-send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        credentials: 'include',
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to resend code');
      }

      setSuccess('New code sent! Check your messages.');
      setCooldown(RESEND_COOLDOWN_SECONDS);
      setCode('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to resend code');
    } finally {
      setIsResending(false);
    }
  }, [token, cooldown, isResending]);

  if (loading) {
    return (
      <div className="login-page">
        <div className="login-container">
          <div className="login-card">
            <p>Loading...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="login-page">
      <div className="login-container">
        <div className="login-card">
          <div className="login-header">
            <img
              src="/bearwood_lakes_logo.png"
              alt="Bearwood Lakes"
              className="login-logo-img"
              width="80"
              height="80"
            />
            <h1>Verify Your Phone</h1>
            <p>
              We sent a 6-digit code to{' '}
              <strong>{maskPhoneNumber(user?.phoneNumber ?? null)}</strong>
            </p>
          </div>

          <form onSubmit={handleSubmit} className="login-form">
            {error && <div className="error-message">{error}</div>}
            {success && (
              <div className="error-message" style={{ background: 'var(--success-bg, #1a3a1a)', borderColor: 'var(--success-color, #4caf50)', color: 'var(--success-color, #4caf50)' }}>
                {success}
              </div>
            )}

            <div className="form-group">
              <label htmlFor="verificationCode">Verification Code</label>
              <input
                type="text"
                id="verificationCode"
                value={code}
                onChange={handleCodeChange}
                placeholder="123456"
                maxLength={6}
                inputMode="numeric"
                pattern="[0-9]*"
                autoComplete="one-time-code"
                autoFocus
                style={{
                  textAlign: 'center',
                  fontSize: '1.5rem',
                  letterSpacing: '0.5rem',
                  fontFamily: 'monospace',
                }}
              />
            </div>

            <button
              type="submit"
              className="btn btn-primary btn-full"
              disabled={isSubmitting || code.length !== 6}
            >
              {isSubmitting ? (
                <span className="btn-loading-spinner">Verifying...</span>
              ) : (
                'Verify Code'
              )}
            </button>
          </form>

          <div style={{ textAlign: 'center', marginTop: '1.5rem' }}>
            <p style={{ color: 'var(--text-secondary, #a0a0a0)', fontSize: '0.9rem', marginBottom: '0.75rem' }}>
              Didn&apos;t receive a code?
            </p>
            <button
              onClick={handleResend}
              disabled={cooldown > 0 || isResending}
              className="btn"
              style={{
                background: 'transparent',
                border: '1px solid var(--border-color, #404040)',
                color: cooldown > 0 ? 'var(--text-tertiary, #666)' : 'var(--text-primary, #fff)',
                cursor: cooldown > 0 ? 'not-allowed' : 'pointer',
                padding: '0.5rem 1.5rem',
                borderRadius: '0.5rem',
                fontSize: '0.9rem',
              }}
            >
              {isResending
                ? 'Sending...'
                : cooldown > 0
                  ? `Resend in ${cooldown}s`
                  : 'Resend Code'}
            </button>
          </div>

          <div className="login-footer" style={{ marginTop: '1.5rem' }}>
            <p>
              <button
                onClick={logout}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-secondary, #a0a0a0)',
                  cursor: 'pointer',
                  textDecoration: 'underline',
                  fontSize: '0.9rem',
                }}
              >
                Log out
              </button>
            </p>
          </div>
        </div>

        <div className="login-decoration">
          <div className="decoration-text">📱 One more step to join!</div>
        </div>
      </div>
    </div>
  );
};

export default VerifyPhonePage;
