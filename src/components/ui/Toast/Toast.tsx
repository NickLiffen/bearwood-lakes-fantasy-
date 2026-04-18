import React, { useEffect, useRef, useState } from 'react';
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
  const autoDismissRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closedRef = useRef(false);

  const scheduleClose = () => {
    if (closedRef.current) return;
    closedRef.current = true;
    if (autoDismissRef.current) {
      clearTimeout(autoDismissRef.current);
      autoDismissRef.current = null;
    }
    setVisible(false);
    setTimeout(onClose, 300); // Wait for fade-out animation
  };

  useEffect(() => {
    autoDismissRef.current = setTimeout(() => {
      scheduleClose();
    }, duration);
    return () => {
      if (autoDismissRef.current) clearTimeout(autoDismissRef.current);
    };
    // scheduleClose is stable-enough via refs; we deliberately only reset on
    // duration/onClose changes so the timer isn't restarted on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [duration, onClose]);

  const handleActionClick = () => {
    if (!action) return;
    action.onClick();
    scheduleClose();
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
