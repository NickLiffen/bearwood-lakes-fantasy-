// Reusable search bar component

import React from 'react';
import './SearchBar.css';

interface SearchBarProps {
  /** Current search value */
  value: string;
  /** Handler called when value changes */
  onChange: (value: string) => void;
  /** Placeholder text */
  placeholder?: string;
  /** Optional handler for clear button - if not provided, onChange('') is called */
  onClear?: () => void;
  /** Additional CSS class name */
  className?: string;
}

const SearchBar: React.FC<SearchBarProps> = ({
  value,
  onChange,
  placeholder = 'Search...',
  onClear,
  className = '',
}) => {
  const handleClear = () => {
    if (onClear) {
      onClear();
    } else {
      onChange('');
    }
  };

  return (
    <div className={`search-bar ${className}`}>
      <span className="search-bar-icon">🔍</span>
      <input
        type="text"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="search-bar-input"
      />
      {value && (
        <button 
          className="search-bar-clear" 
          onClick={handleClear}
          type="button"
          aria-label="Clear search"
        >
          ×
        </button>
      )}
    </div>
  );
};

export default SearchBar;
