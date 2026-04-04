// League join page — auto-joins via invite code from URL

import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import PageLayout from '../../components/layout/PageLayout';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import { useApiClient } from '../../hooks/useApiClient';
import type { League } from '@shared/types';

const LeagueJoinPage: React.FC = () => {
  const { code } = useParams<{ code: string }>();
  const navigate = useNavigate();
  const { post, isAuthReady } = useApiClient();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isAuthReady || !code) return;
    let cancelled = false;

    const joinLeague = async () => {
      try {
        const response = await post<League>('leagues-join', { inviteCode: code.toUpperCase() });
        if (cancelled || response.cancelled) return;

        if (response.success && response.data) {
          navigate(`/leagues/${response.data.id}`, { replace: true });
        } else {
          setError(response.error || 'Failed to join league');
        }
      } catch {
        if (!cancelled) setError('Something went wrong. Please try again.');
      }
    };

    joinLeague();
    return () => {
      cancelled = true;
    };
  }, [isAuthReady, code, post, navigate]);

  if (error) {
    return (
      <PageLayout activeNav="leagues">
        <div className="leagues-content">
          <div className="leagues-container" style={{ textAlign: 'center', padding: '3rem 1rem' }}>
            <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>😕</div>
            <h2>Couldn't Join League</h2>
            <p style={{ color: '#6b7280', marginBottom: '1.5rem' }}>{error}</p>
            <button
              className="btn btn-primary"
              onClick={() => navigate('/leagues', { replace: true })}
            >
              Go to Leagues
            </button>
          </div>
        </div>
      </PageLayout>
    );
  }

  return (
    <PageLayout activeNav="leagues">
      <div className="leagues-content">
        <div className="leagues-container">
          <LoadingSpinner text="Joining league..." />
        </div>
      </div>
    </PageLayout>
  );
};

export default LeagueJoinPage;
