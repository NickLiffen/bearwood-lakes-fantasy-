// Leagues list page — shows leagues the user belongs to

import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import PageLayout from '../../components/layout/PageLayout';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import { useApiClient } from '../../hooks/useApiClient';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import type { League } from '@shared/types';
import './LeaguesPage.css';

const LeaguesPage: React.FC = () => {
  const { get, isAuthReady } = useApiClient();
  const [leagues, setLeagues] = useState<League[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  useDocumentTitle('Leagues');

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
    return () => { cancelled = true; };
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
              <Link to="/leagues/create" className="btn btn-primary">
                + Create League
              </Link>
            </div>
            <p className="leagues-page-subtitle">
              Compete against friends in private leagues
            </p>
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
                <Link
                  key={league.id}
                  to={`/leagues/${league.id}`}
                  className="league-card"
                >
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
    </PageLayout>
  );
};

export default LeaguesPage;
