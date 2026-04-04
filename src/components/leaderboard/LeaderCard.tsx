// LeaderCard — displays the leader of a time period (weekly/monthly/season)

import React from 'react';
import type { LeaderboardEntry } from './types';

interface LeaderCardProps {
  leader: LeaderboardEntry | null;
  title: string;
  emoji: string;
  isCurrentUser: (userId: string) => boolean;
}

const LeaderCard: React.FC<LeaderCardProps> = ({ leader, title, emoji, isCurrentUser }) => {
  if (!leader) {
    return (
      <div className="leader-card empty">
        <div className="leader-title">
          {emoji} {title}
        </div>
        <div className="leader-empty">No leader yet</div>
      </div>
    );
  }

  return (
    <div className={`leader-card ${isCurrentUser(leader.userId) ? 'is-you' : ''}`}>
      <div className="leader-title">
        {emoji} {title}
      </div>
      <div className="leader-avatar">
        {leader.firstName[0]}
        {leader.lastName[0]}
      </div>
      <div className="leader-name">
        {leader.firstName} {leader.lastName}
        {isCurrentUser(leader.userId) && <span className="dt-you-badge">You</span>}
      </div>
      <div className="leader-points">{leader.points} pts</div>
    </div>
  );
};

export default LeaderCard;
