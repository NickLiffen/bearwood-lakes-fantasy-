// Reusable Spinner component

import React from 'react';

interface SpinnerProps {
  size?: 'small' | 'medium' | 'large';
}

export const Spinner: React.FC<SpinnerProps> = ({ size: _size = 'medium' }) => {
  // Implementation placeholder
  return <div>Loading...</div>;
};
