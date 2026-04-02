// Team of the Week Modal — shows the dream team for a completed gameweek

import React, { useEffect, useState } from 'react';
import { useApiClient } from '../../../hooks/useApiClient';
import TeamGolferTable from '../TeamGolferTable';
import type { TeamOfTheWeekResponse } from '@shared/types';
import './TeamOfTheWeekModal.css';

interface TeamOfTheWeekModalProps {
  date: string;
  season: string;
  onClose: () => void;
}

const TeamOfTheWeekModal: React.FC<TeamOfTheWeekModalProps> = ({ date, season, onClose }) => {
  const [data, setData] = useState<TeamOfTheWeekResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { get } = useApiClient();

  useEffect(() => {
    const fetchTeamOfTheWeek = async () => {
      try {
        setLoading(true);
        setError(null);

        const response = await get<TeamOfTheWeekResponse>(
          `team-of-week?date=${date}&season=${season}`
        );

        if (response.success && response.data) {
          setData(response.data);
        } else {
          setError(response.error || 'Failed to load Team of the Week');
        }
      } catch {
        setError('Failed to load Team of the Week. Please try again.');
      } finally {
        setLoading(false);
      }
    };

    fetchTeamOfTheWeek();
  }, [date, season, get]);

  const golferTableData = data?.golfers.map((g) => ({
    golfer: {
      id: g.golfer.id,
      firstName: g.golfer.firstName,
      lastName: g.golfer.lastName,
      picture: g.golfer.picture,
    },
    weekPoints: g.weekPoints,
    isCaptain: g.isCaptain,
  })) || [];

  return (
    <div className="modal-overlay totw-overlay" onClick={onClose}>
      <div className="totw-modal" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="modal-header totw-header">
          <div>
            <h2>⭐ Team of the Week</h2>
            {data?.period && (
              <span className="totw-subtitle">{data.period.label}</span>
            )}
          </div>
          <button className="modal-close" onClick={onClose}>
            ×
          </button>
        </div>

        {/* Content */}
        <div className="modal-body">
          {loading && (
            <div className="loading-state">
              <div className="loading-spinner"></div>
              <p>Loading dream team...</p>
            </div>
          )}

          {error && (
            <div className="error-state">
              <p>{error}</p>
            </div>
          )}

          {!loading && !error && data && (
            <>
              {data.golfers.length === 0 ? (
                <div className="totw-empty">
                  <div className="totw-empty-icon">⛳</div>
                  <h3>No tournaments this week</h3>
                  <p>There were no scored tournaments during this gameweek.</p>
                </div>
              ) : (
                <>
                  {/* Summary banner */}
                  <div className="totw-summary">
                    <div className="totw-stat">
                      <span className="totw-stat-value">{data.totalPoints}</span>
                      <span className="totw-stat-label">Dream Team Total</span>
                    </div>
                    <div className="totw-stat">
                      <span className="totw-stat-value">{data.golfers.length}</span>
                      <span className="totw-stat-label">Golfers</span>
                    </div>
                    <div className="totw-stat">
                      <span className="totw-stat-value">{data.tournamentCount}</span>
                      <span className="totw-stat-label">
                        {data.tournamentCount === 1 ? 'Tournament' : 'Tournaments'}
                      </span>
                    </div>
                  </div>

                  {/* Dream team table */}
                  <div className="totw-table">
                    <TeamGolferTable golfers={golferTableData} weekTotal={data.totalPoints} />
                  </div>

                  <p className="totw-caption">
                    👑 The highest scorer is auto-assigned as captain with 2× points.
                  </p>
                </>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="modal-footer">
          <button className="btn-secondary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default TeamOfTheWeekModal;
