// Leagues list page — shows leagues the user belongs to

import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import PageLayout from '../../components/layout/PageLayout';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import { useApiClient } from '../../hooks/useApiClient';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import type { League } from '@shared/types';
import './LeaguesPage.css';

const LeaguesPage: React.FC = () => {
  const navigate = useNavigate();
  const { get, post, isAuthReady } = useApiClient();
  const [leagues, setLeagues] = useState<League[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [joinCode, setJoinCode] = useState('');
  const [joinError, setJoinError] = useState('');
  const [joining, setJoining] = useState(false);
  useDocumentTitle('Leagues');

  const handleJoinLeague = async () => {
    const code = joinCode.trim().toUpperCase();
    if (code.length !== 6) {
      setJoinError('Invite code must be 6 characters');
      return;
    }

    setJoining(true);
    setJoinError('');
    try {
      const response = await post<League>('leagues-join', { inviteCode: code });
      if (response.success && response.data) {
        setShowJoinModal(false);
        setJoinCode('');
        navigate(`/leagues/${response.data.id}`);
      } else {
        setJoinError(response.error || 'Failed to join league');
      }
    } catch {
      setJoinError('Something went wrong. Please try again.');
    } finally {
      setJoining(false);
    }
  };

  useEffect(() => {
    if (!isAuthReady) return;
    let cancelled = false;

    const fetchLeagues = async () => {
      setLoading(true);
      try {
        const response = await get<League[]>('leagues-list');
        if (cancelled || response.cancelled) return;
        if (response.success && response.data) {
          setLeagues(response.data);
        } else {
          setError(response.error || 'Failed to load leagues');
        }
      } catch {
        if (!cancelled) setError('Failed to load leagues');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchLeagues();
    return () => {
      cancelled = true;
    };
  }, [get, isAuthReady]);

  if ((loading || leagues === null) && !error) {
    return (
      <PageLayout activeNav="leagues">
        <div className="leagues-content">
          <div className="leagues-container">
            <LoadingSpinner text="Loading leagues..." />
          </div>
        </div>
      </PageLayout>
    );
  }

  return (
    <PageLayout activeNav="leagues">
      <div className="leagues-content">
        <div className="leagues-container">
          <div className="leagues-page-header">
            <div className="page-header-row">
              <h1>🏆 Leagues</h1>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button
                  className="btn btn-secondary"
                  onClick={() => {
                    setShowJoinModal(true);
                    setJoinCode('');
                    setJoinError('');
                  }}
                >
                  Join League
                </button>
                <Link to="/leagues/create" className="btn btn-primary">
                  + Create League
                </Link>
              </div>
            </div>
            <p className="leagues-page-subtitle">Compete against friends in private leagues</p>
          </div>

          {error && <div className="error-message">{error}</div>}

          {leagues && leagues.length === 0 && (
            <div className="empty-state">
              <div className="empty-icon">🏆</div>
              <h3>No leagues yet</h3>
              <p>Create a league or ask a friend for an invite link to get started!</p>
              <Link to="/leagues/create" className="btn btn-primary">
                Create Your First League
              </Link>
            </div>
          )}

          {leagues && leagues.length > 0 && (
            <div className="leagues-grid">
              {leagues.map((league) => (
                <Link key={league.id} to={`/leagues/${league.id}`} className="league-card">
                  <div className="league-card-header">
                    <h3>{league.name}</h3>
                    <span className="league-member-count">
                      {league.memberCount} member{league.memberCount !== 1 ? 's' : ''}
                    </span>
                  </div>
                  {league.description && (
                    <p className="league-card-description">{league.description}</p>
                  )}
                  <div className="league-card-footer">
                    <span className="league-card-view">View Standings →</span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Join League Modal */}
      {showJoinModal && (
        <div
          className="modal-overlay"
          onClick={() => setShowJoinModal(false)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '1rem',
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: 'white',
              borderRadius: '16px',
              padding: '1.5rem',
              width: '100%',
              maxWidth: '400px',
              boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
            }}
          >
            <h2 style={{ margin: '0 0 0.5rem', fontSize: '1.25rem' }}>Join a League</h2>
            <p style={{ color: '#6b7280', margin: '0 0 1.25rem', fontSize: '0.9rem' }}>
              Enter the 6-character invite code shared by the league admin.
            </p>

            {joinError && (
              <div
                style={{
                  background: '#fef2f2',
                  border: '1px solid #fecaca',
                  borderRadius: '8px',
                  padding: '0.6rem 0.75rem',
                  color: '#dc2626',
                  fontSize: '0.85rem',
                  marginBottom: '1rem',
                }}
              >
                {joinError}
              </div>
            )}

            <input
              type="text"
              value={joinCode}
              onChange={(e) => {
                const val = e.target.value
                  .toUpperCase()
                  .replace(/[^A-Z0-9]/g, '')
                  .slice(0, 6);
                setJoinCode(val);
                setJoinError('');
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && joinCode.length === 6 && !joining) handleJoinLeague();
              }}
              placeholder="ABC123"
              maxLength={6}
              autoFocus
              style={{
                width: '100%',
                padding: '0.875rem',
                fontSize: '1.5rem',
                fontFamily: 'monospace',
                fontWeight: 700,
                textAlign: 'center',
                letterSpacing: '0.3rem',
                border: '2px solid #d1d5db',
                borderRadius: '12px',
                outline: 'none',
                boxSizing: 'border-box',
              }}
            />

            <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.25rem' }}>
              <button
                className="btn btn-secondary"
                onClick={() => setShowJoinModal(false)}
                style={{ flex: 1 }}
              >
                Cancel
              </button>
              <button
                className="btn btn-primary"
                onClick={handleJoinLeague}
                disabled={joinCode.length !== 6 || joining}
                style={{ flex: 1 }}
              >
                {joining ? 'Joining...' : 'Join League'}
              </button>
            </div>
          </div>
        </div>
      )}
    </PageLayout>
  );
};

export default LeaguesPage;
