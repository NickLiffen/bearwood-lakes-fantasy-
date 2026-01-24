// Reusable Modal component

import React from 'react';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
}

export const Modal: React.FC<ModalProps> = ({ isOpen, onClose, title, children }) => {
  // Implementation placeholder
  if (!isOpen) return null;

  return (
    <div>
      {title && <h2>{title}</h2>}
      {children}
      <button onClick={onClose}>Close</button>
    </div>
  );
};
