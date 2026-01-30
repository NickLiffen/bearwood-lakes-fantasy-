// Reusable loading spinner component with animated rings

import React from 'react';
import './LoadingSpinner.css';

interface LoadingSpinnerProps {
  /** Text to display below the spinner */
  text?: string;
  /** Size variant */
  size?: 'small' | 'medium' | 'large';
  /** Whether to show in full page mode (centered with min-height) */
  fullPage?: boolean;
}

const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({
  text = 'Loading...',
  size = 'large',
  fullPage = true,
}) => {
  const sizeClass = `spinner-${size}`;
  const containerClass = fullPage ? 'loading-container loading-container-fullpage' : 'loading-container';

  return (
    <div className={containerClass}>
      <div className={`loading-spinner-rings ${sizeClass}`}>
        <div className="spinner-ring"></div>
        <div className="spinner-ring"></div>
        <div className="spinner-ring"></div>
      </div>
      {text && <p className="loading-text">{text}</p>}
    </div>
  );
};

export default LoadingSpinner;
