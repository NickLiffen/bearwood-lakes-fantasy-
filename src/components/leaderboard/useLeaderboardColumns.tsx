// useLeaderboardColumns — shared column definitions for leaderboard tables

import { useMemo } from 'react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { Column } from '../ui/DataTable';
import { formatPrice } from '../../utils/formatters';
import type { LeaderboardEntry } from './types';

interface UseLeaderboardColumnsOptions {
  isCurrentUser: (userId: string) => boolean;
  /** Show the "Events" column (default: false) */
  showEvents?: boolean;
  /** Render function for an extra action column (e.g., Compare button) */
  renderAction?: (entry: LeaderboardEntry) => ReactNode | null;
}

export function useLeaderboardColumns({
  isCurrentUser,
  showEvents = false,
  renderAction,
}: UseLeaderboardColumnsOptions): Column<LeaderboardEntry>[] {
  return useMemo(() => {
    const cols: Column<LeaderboardEntry>[] = [
      {
        key: 'rank',
        header: 'Rank',
        width: '80px',
        align: 'center',
        render: (entry) => {
          if (entry.rank <= 3) {
            return (
              <span className={`dt-rank dt-rank-${entry.rank}`}>
                {entry.rank === 1 && '🥇 '}
                {entry.rank === 2 && '🥈 '}
                {entry.rank === 3 && '🥉 '}
                {entry.rank}
              </span>
            );
          }
          return <span className="dt-rank">{entry.rank}</span>;
        },
      },
      {
        key: 'movement',
        header: 'Move',
        width: '70px',
        align: 'center',
        render: (entry) => {
          if (entry.movement === 'new') {
            return <span className="dt-badge dt-badge-warning">NEW</span>;
          }
          if (entry.movement === 'up') {
            return <span className="movement-up">↑{entry.movementAmount}</span>;
          }
          if (entry.movement === 'down') {
            return <span className="movement-down">↓{entry.movementAmount}</span>;
          }
          return <span className="dt-text-muted">-</span>;
        },
      },
      {
        key: 'user',
        header: 'Player',
        render: (entry) => (
          <Link to={`/users/${entry.userId}`} className="dt-text-link">
            <div className="dt-info-cell">
              <div className="dt-avatar">
                {entry.firstName[0]}
                {entry.lastName[0]}
              </div>
              <div className="dt-info-details">
                <span className="dt-info-name">
                  {entry.firstName} {entry.lastName}
                  {isCurrentUser(entry.userId) && <span className="dt-you-badge">You</span>}
                </span>
                <span className="dt-info-subtitle">@{entry.username}</span>
              </div>
            </div>
          </Link>
        ),
      },
      {
        key: 'points',
        header: 'Points',
        width: '100px',
        align: 'center',
        render: (entry) => <span className="dt-text-price">{entry.points}</span>,
      },
      {
        key: 'teamValue',
        header: 'Team Value',
        width: '120px',
        align: 'center',
        headerClassName: 'hide-on-mobile',
        cellClassName: 'hide-on-mobile',
        render: (entry) => formatPrice(entry.teamValue),
      },
    ];

    if (showEvents) {
      cols.push({
        key: 'events',
        header: 'Events',
        width: '80px',
        align: 'center',
        headerClassName: 'hide-on-small',
        cellClassName: 'hide-on-small',
        render: (entry) => entry.eventsPlayed,
      });
    }

    if (renderAction) {
      cols.push({
        key: 'action',
        header: 'Action',
        width: '90px',
        align: 'center',
        render: renderAction,
      });
    }

    return cols;
  }, [isCurrentUser, showEvents, renderAction]);
}
