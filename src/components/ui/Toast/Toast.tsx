import React, { useEffect, useState } from 'react';
import './Toast.css';

interface ToastAction {
  label: string;
  onClick: () => void;
}

interface ToastProps {
  message: string;
  type?: 'success' | 'warning' | 'error' | 'info';
  duration?: number;
  onClose: () => void;
  action?: ToastAction;
}

const Toast: React.FC<ToastProps> = ({
  message,
  type = 'success',
  duration = 2500,
  onClose,
  action,
}) => {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setVisible(false);
      setTimeout(onClose, 300); // Wait for fade-out animation
    }, duration);
    return () => clearTimeout(timer);
  }, [duration, onClose]);

  const handleActionClick = () => {
    if (!action) return;
    action.onClick();
    setVisible(false);
    setTimeout(onClose, 300);
  };

  return (
    <div className={`toast toast-${type} ${visible ? 'toast-enter' : 'toast-exit'}`} role="alert">
      <span className="toast-message">{message}</span>
      {action && (
        <button
          type="button"
          className="toast-action"
          onClick={handleActionClick}
          aria-label={action.label}
        >
          {action.label}
        </button>
      )}
    </div>
  );
};

export default Toast;
