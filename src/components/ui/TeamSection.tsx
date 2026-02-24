import React from 'react';
import './TeamSection.css';

interface TeamSectionProps {
  firstName: string;
  teamValue: number;
  children: React.ReactNode;
}

const TeamSection: React.FC<TeamSectionProps> = ({ firstName, teamValue, children }) => {
  const formattedValue = `£${(teamValue / 1_000_000).toFixed(1)}M`;

  return (
    <div className="team-section-card">
      <div className="team-section-header">
        <h2>🏌️ {firstName}&apos;s Team</h2>
        <span className="team-section-value">{formattedValue} team value</span>
      </div>
      {children}
    </div>
  );
};

export default TeamSection;
