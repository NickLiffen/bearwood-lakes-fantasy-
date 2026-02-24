import React from 'react';
import { Link } from 'react-router-dom';
import DataTable, { Column } from './DataTable';

interface GolferData {
  golfer: {
    id: string;
    firstName: string;
    lastName: string;
    picture: string;
  };
  weekPoints: number;
  isCaptain: boolean;
}

interface TeamGolferTableProps {
  golfers: GolferData[];
  weekTotal?: number;
  isOwnTeam?: boolean;
  onSetCaptain?: (golferId: string) => void;
}

const TeamGolferTable: React.FC<TeamGolferTableProps> = ({
  golfers,
  weekTotal,
  isOwnTeam = false,
  onSetCaptain,
}) => {
  const columns: Column<GolferData>[] = [
    {
      key: 'captain',
      header: 'C',
      align: 'center',
      render: (data) =>
        data.isCaptain ? (
          <span className="captain-indicator" title="Captain (2x points)">
            👑
          </span>
        ) : isOwnTeam && onSetCaptain ? (
          <button
            className="captain-btn"
            onClick={(e) => {
              e.stopPropagation();
              onSetCaptain(data.golfer.id);
            }}
            title="Make captain"
          >
            ○
          </button>
        ) : null,
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
      render: (data) => (
        <span className="dt-text-primary">
          {data.weekPoints}
          {data.isCaptain && <span className="captain-multiplier"> (2x)</span>}
        </span>
      ),
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
    </>
  );
};

export default TeamGolferTable;
export type { GolferData };
