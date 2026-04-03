import React from 'react';
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

const TeamHistory: React.FC<TeamHistoryProps> = ({ history }) => {
  if (history.length === 0) return null;

  return (
    <div className="team-history">
      <h2>📜 Team History</h2>
      <div className="history-timeline">
        {history.map((entry, index) => (
          <div key={index} className="history-entry">
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
    </div>
  );
};

export default TeamHistory;
export type { HistoryEntry };
