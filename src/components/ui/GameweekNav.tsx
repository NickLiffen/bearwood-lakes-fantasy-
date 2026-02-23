import React from 'react';
import './GameweekNav.css';

interface WeekOption {
  value: string;
  label: string;
}

interface GameweekNavProps {
  weekOptions: WeekOption[];
  selectedDate: string;
  hasPrevious: boolean;
  hasNext: boolean;
  onNavigate: (direction: 'prev' | 'next') => void;
  onSelect: (date: string) => void;
}

const GameweekNav: React.FC<GameweekNavProps> = ({
  weekOptions,
  selectedDate,
  hasPrevious,
  hasNext,
  onNavigate,
  onSelect,
}) => {
  return (
    <div className="gameweek-nav">
      <button
        className="gameweek-nav-btn"
        onClick={() => onNavigate('prev')}
        disabled={!hasPrevious}
        aria-label="Previous gameweek"
      >
        ← Prev
      </button>
      <select
        id="gameweek-select"
        name="gameweek-select"
        className="gameweek-select"
        value={selectedDate}
        onChange={(e) => onSelect(e.target.value)}
      >
        {weekOptions.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      <button
        className="gameweek-nav-btn"
        onClick={() => onNavigate('next')}
        disabled={!hasNext}
        aria-label="Next gameweek"
      >
        Next →
      </button>
    </div>
  );
};

export default GameweekNav;
export type { WeekOption };
