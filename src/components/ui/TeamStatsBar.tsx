import React from 'react';
import './TeamStatsBar.css';

interface TeamStatsBarProps {
  weekPoints: number;
  monthPoints: number;
  seasonPoints: number;
  weekRank?: number | null;
  monthRank?: number | null;
  seasonRank?: number | null;
}

const TeamStatsBar: React.FC<TeamStatsBarProps> = ({
  weekPoints,
  monthPoints,
  seasonPoints,
  weekRank,
  monthRank,
  seasonRank,
}) => {
  return (
    <div className="team-stats-bar">
      <div className="team-stat-card">
        <span className="team-stat-value">{weekPoints}</span>
        <span className="team-stat-label">Week Points</span>
        {weekRank != null && <span className="team-stat-rank">#{weekRank}</span>}
      </div>
      <div className="team-stat-card">
        <span className="team-stat-value">{monthPoints}</span>
        <span className="team-stat-label">Month Points</span>
        {monthRank != null && <span className="team-stat-rank">#{monthRank}</span>}
      </div>
      <div className="team-stat-card">
        <span className="team-stat-value">{seasonPoints}</span>
        <span className="team-stat-label">Season Points</span>
        {seasonRank != null && <span className="team-stat-rank">#{seasonRank}</span>}
      </div>
    </div>
  );
};

export default TeamStatsBar;
