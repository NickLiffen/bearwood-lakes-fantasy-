// Reusable Card component

import React from 'react';

interface CardProps {
  children: React.ReactNode;
  title?: string;
}

export const Card: React.FC<CardProps> = ({ children, title }) => {
  // Implementation placeholder
  return (
    <div>
      {title && <h2>{title}</h2>}
      {children}
    </div>
  );
};
