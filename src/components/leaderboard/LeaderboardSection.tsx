// LeaderboardSection — reusable standings table with optional period navigation and pagination

import React from 'react';
import DataTable, { Column } from '../ui/DataTable';
import PeriodNav from '../ui/PeriodNav';
import type { PeriodOption } from '../../utils/gameweek';
import type { LeaderboardEntry } from './types';

const ITEMS_PER_PAGE = 10;

interface PeriodNavConfig {
  id: string;
  options: PeriodOption[];
  selectedDate: string;
  hasPrevious: boolean;
  hasNext: boolean;
  onNavigate: (direction: 'prev' | 'next') => void;
  onSelect: (date: string) => void;
}

interface LeaderboardSectionProps {
  title: string;
  entries: LeaderboardEntry[];
  columns: Column<LeaderboardEntry>[];
  currentPage: number;
  onPageChange: (page: number) => void;
  isCurrentUser: (userId: string) => boolean;
  periodNav?: PeriodNavConfig;
  /** Extra content rendered after the title/meta row (e.g., Team of the Week button) */
  titleExtra?: React.ReactNode;
  /** Custom meta text (defaults to "${count} participants") */
  metaText?: string;
  emptyMessage?: string;
}

const LeaderboardSection: React.FC<LeaderboardSectionProps> = ({
  title,
  entries,
  columns,
  currentPage,
  onPageChange,
  isCurrentUser,
  periodNav,
  titleExtra,
  metaText,
  emptyMessage = 'No data for this period yet.',
}) => {
  const totalPages = Math.ceil(entries.length / ITEMS_PER_PAGE);
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const paginatedEntries = entries.slice(startIndex, startIndex + ITEMS_PER_PAGE);

  return (
    <div className="leaderboard-section">
      <div className="section-header">
        <div className="section-title-row">
          <h2>{title}</h2>
          <span className="section-meta">{metaText ?? `${entries.length} participants`}</span>
          {titleExtra}
        </div>
        {periodNav && (
          <PeriodNav
            id={periodNav.id}
            options={periodNav.options}
            selectedDate={periodNav.selectedDate}
            hasPrevious={periodNav.hasPrevious}
            hasNext={periodNav.hasNext}
            onNavigate={periodNav.onNavigate}
            onSelect={periodNav.onSelect}
          />
        )}
      </div>

      <DataTable
        data={paginatedEntries}
        columns={columns}
        rowKey={(entry) => entry.userId}
        rowClassName={(entry) => (isCurrentUser(entry.userId) ? 'dt-row-highlighted' : '')}
        emptyMessage={emptyMessage}
      />

      {totalPages > 1 && (
        <div className="pagination-controls">
          <button
            className="pagination-btn"
            onClick={() => onPageChange(currentPage - 1)}
            disabled={currentPage === 1}
          >
            ← Previous
          </button>
          <span className="page-info">
            Page {currentPage} of {totalPages}
          </span>
          <button
            className="pagination-btn"
            onClick={() => onPageChange(currentPage + 1)}
            disabled={currentPage === totalPages}
          >
            Next →
          </button>
        </div>
      )}
    </div>
  );
};

export default LeaderboardSection;
