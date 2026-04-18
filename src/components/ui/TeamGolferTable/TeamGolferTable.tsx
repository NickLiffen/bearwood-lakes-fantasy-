import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import DataTable, { Column } from '../DataTable';
import ScoreBreakdownModal from '../ScoreBreakdownModal';
import type { TournamentScore } from '@shared/types';

interface GolferData {
  golfer: {
    id: string;
    firstName: string;
    lastName: string;
    picture: string;
  };
  weekPoints: number;
  weekScores?: TournamentScore[];
  isCaptain: boolean;
}

interface TeamGolferTableProps {
  golfers: GolferData[];
  weekTotal?: number;
  weekLabel?: string;
  isOwnTeam?: boolean;
  onSetCaptain?: (golferId: string) => void;
}

const TeamGolferTable: React.FC<TeamGolferTableProps> = ({
  golfers,
  weekTotal,
  weekLabel = '',
  isOwnTeam = false,
  onSetCaptain,
}) => {
  const [breakdownGolfer, setBreakdownGolfer] = useState<GolferData | null>(null);
  const columns: Column<GolferData>[] = [
    {
      key: 'captain',
      header: 'C',
      align: 'center',
      render: (data) => {
        if (isOwnTeam && onSetCaptain) {
          const isActive = data.isCaptain;
          return (
            <button
              type="button"
              className={`captain-toggle ${isActive ? 'active' : ''}`}
              onClick={(e) => {
                e.stopPropagation();
                // No-op when clicking the current captain's badge.
                // Captain selection is set-only: to change captain, click the C on another golfer.
                if (isActive) return;
                onSetCaptain(data.golfer.id);
              }}
              title={isActive ? 'Your captain (2× points)' : 'Make captain'}
              aria-pressed={isActive}
            >
              C
            </button>
          );
        }
        return data.isCaptain ? (
          <span className="captain-indicator" title="Captain (2x points)">
            👑
          </span>
        ) : null;
      },
    },
    {
      key: 'golfer',
      header: 'Golfer',
      render: (data) => (
        <div className="dt-info-cell">
          <div className="dt-avatar">
            {data.golfer.picture ? (
              <img
                src={data.golfer.picture}
                alt={`${data.golfer.firstName} ${data.golfer.lastName}`}
                loading="lazy"
              />
            ) : (
              <span className="dt-avatar-placeholder">
                {data.golfer.firstName[0]}
                {data.golfer.lastName[0]}
              </span>
            )}
          </div>
          <Link to={`/golfers/${data.golfer.id}`} className="dt-text-link">
            {data.golfer.firstName} {data.golfer.lastName}
          </Link>
        </div>
      ),
    },
    {
      key: 'week-pts',
      header: 'Week Pts',
      align: 'right',
      render: (data) => {
        const hasBreakdown = data.weekScores && data.weekScores.length > 0;
        return (
          <span
            className={`dt-text-primary ${hasBreakdown ? 'score-clickable' : ''}`}
            onClick={
              hasBreakdown
                ? (e) => {
                    e.stopPropagation();
                    setBreakdownGolfer(data);
                  }
                : undefined
            }
            role={hasBreakdown ? 'button' : undefined}
            tabIndex={hasBreakdown ? 0 : undefined}
            onKeyDown={
              hasBreakdown
                ? (e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setBreakdownGolfer(data);
                    }
                  }
                : undefined
            }
            title={hasBreakdown ? 'Click to see score breakdown' : undefined}
          >
            {data.weekPoints}
            {data.isCaptain && <span className="captain-multiplier"> (2x)</span>}
          </span>
        );
      },
    },
  ];

  return (
    <>
      {weekTotal != null && (
        <div className="week-total-bar">
          <span className="week-total-label">Week Total:</span>
          <span className="week-total-value">{weekTotal} pts</span>
        </div>
      )}
      <DataTable
        data={golfers}
        columns={columns}
        rowKey={(data) => data.golfer.id}
        emptyMessage="No golfers in this team."
      />
      {breakdownGolfer && breakdownGolfer.weekScores && (
        <ScoreBreakdownModal
          golferName={`${breakdownGolfer.golfer.firstName} ${breakdownGolfer.golfer.lastName}`}
          isCaptain={breakdownGolfer.isCaptain}
          weekScores={breakdownGolfer.weekScores}
          weekLabel={weekLabel}
          weekPoints={breakdownGolfer.weekPoints}
          onClose={() => setBreakdownGolfer(null)}
        />
      )}
    </>
  );
};

export default TeamGolferTable;
export type { GolferData };
