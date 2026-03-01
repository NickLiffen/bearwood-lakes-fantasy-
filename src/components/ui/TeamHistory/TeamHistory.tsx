import React, { useState } from 'react';
import './TeamHistory.css';

interface HistoryEntry {
  changedAt: string;
  reason: string;
  totalSpent: number;
  golferCount: number;
  addedGolfers: Array<{ id: string; name: string }>;
  removedGolfers: Array<{ id: string; name: string }>;
}

interface TeamHistoryProps {
  history: HistoryEntry[];
  pageSize?: number;
}

const formatDateTime = (dateStr: string): string => {
  return new Date(dateStr).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const TeamHistory: React.FC<TeamHistoryProps> = ({ history, pageSize = 10 }) => {
  const [page, setPage] = useState(1);

  if (history.length === 0) return null;

  const totalPages = Math.ceil(history.length / pageSize);
  const startIdx = (page - 1) * pageSize;
  const pageEntries = history.slice(startIdx, startIdx + pageSize);

  return (
    <div className="team-history">
      <h2>📜 Team History</h2>
      <div className="history-timeline">
        {pageEntries.map((entry, index) => (
          <div key={startIdx + index} className="history-entry">
            <div className="history-date">{formatDateTime(entry.changedAt)}</div>
            <div className="history-content">
              <span className="history-reason">{entry.reason}</span>
              <div className="history-changes">
                {entry.addedGolfers.length > 0 && (
                  <div className="golfers-added">
                    {entry.addedGolfers.map((p) => (
                      <span key={p.id} className="golfer-change added">
                        + {p.name}
                      </span>
                    ))}
                  </div>
                )}
                {entry.removedGolfers.length > 0 && (
                  <div className="golfers-removed">
                    {entry.removedGolfers.map((p) => (
                      <span key={p.id} className="golfer-change removed">
                        - {p.name}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
      {totalPages > 1 && (
        <div className="history-pagination">
          <button
            className="history-page-btn"
            disabled={page <= 1}
            onClick={() => setPage(page - 1)}
          >
            ← Prev
          </button>
          <span className="history-page-info">
            Page {page} of {totalPages}
          </span>
          <button
            className="history-page-btn"
            disabled={page >= totalPages}
            onClick={() => setPage(page + 1)}
          >
            Next →
          </button>
        </div>
      )}
    </div>
  );
};

export default TeamHistory;
export type { HistoryEntry };
