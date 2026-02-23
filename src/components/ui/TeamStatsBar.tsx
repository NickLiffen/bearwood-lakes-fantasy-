import React from 'react';
import './TeamStatsBar.css';

interface TeamStatsBarProps {
  weekPoints: number;
  seasonPoints: number;
  teamValue: number;
  weekRank?: number | null;
  seasonRank?: number | null;
}

const TeamStatsBar: React.FC<TeamStatsBarProps> = ({
  weekPoints,
  seasonPoints,
  teamValue,
  weekRank,
  seasonRank,
}) => {
  const formatPrice = (price: number) => `£${(price / 1_000_000).toFixed(1)}M`;

  return (
    <div className="team-stats-bar">
      <div className="team-stat-card">
        <span className="team-stat-value">{weekPoints}</span>
        <span className="team-stat-label">Week Points</span>
        {weekRank != null && <span className="team-stat-rank">#{weekRank}</span>}
      </div>
      <div className="team-stat-card">
        <span className="team-stat-value">{seasonPoints}</span>
        <span className="team-stat-label">Season Points</span>
        {seasonRank != null && <span className="team-stat-rank">#{seasonRank}</span>}
      </div>
      <div className="team-stat-card">
        <span className="team-stat-value">{formatPrice(teamValue)}</span>
        <span className="team-stat-label">Team Value</span>
      </div>
    </div>
  );
};

export default TeamStatsBar;
