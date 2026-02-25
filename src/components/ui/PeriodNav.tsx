import React from 'react';
import './PeriodNav.css';

export interface PeriodOption {
  value: string;
  label: string;
}

interface PeriodNavProps {
  options: PeriodOption[];
  selectedDate: string;
  hasPrevious: boolean;
  hasNext: boolean;
  onNavigate: (direction: 'prev' | 'next') => void;
  onSelect: (date: string) => void;
}

const PeriodNav: React.FC<PeriodNavProps> = ({
  options,
  selectedDate,
  hasPrevious,
  hasNext,
  onNavigate,
  onSelect,
}) => {
  return (
    <div className="period-nav">
      <button
        className="period-nav-btn"
        onClick={() => onNavigate('prev')}
        disabled={!hasPrevious}
        aria-label="Previous period"
      >
        ← Prev
      </button>
      <select
        id="period-select"
        name="period-select"
        className="period-nav-select"
        value={selectedDate}
        onChange={(e) => onSelect(e.target.value)}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      <button
        className="period-nav-btn"
        onClick={() => onNavigate('next')}
        disabled={!hasNext}
        aria-label="Next period"
      >
        Next →
      </button>
    </div>
  );
};

export default PeriodNav;
