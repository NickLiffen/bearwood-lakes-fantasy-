// Reusable info tooltip component - click-to-toggle popover with ⓘ icon
// Mobile-friendly: uses click (not hover), 44px tap target, click-outside dismisses

import { useState, useRef, useEffect, useCallback } from 'react';
import './InfoTooltip.css';

interface InfoTooltipProps {
  /** The tooltip content text */
  text: string;
  /** Optional aria-label for accessibility */
  label?: string;
}

const InfoTooltip: React.FC<InfoTooltipProps> = ({ text, label = 'More info' }) => {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLSpanElement>(null);

  const close = useCallback(() => setOpen(false), []);

  // Close on click outside
  useEffect(() => {
    if (!open) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        close();
      }
    };

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [open, close]);

  return (
    <span className="info-tooltip-container" ref={containerRef}>
      <button
        type="button"
        className="info-tooltip-trigger"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((prev) => !prev);
        }}
        aria-label={label}
        aria-expanded={open}
      >
        ⓘ
      </button>
      {open && (
        <span className="info-tooltip-popover" role="tooltip">
          {text}
        </span>
      )}
    </span>
  );
};

export default InfoTooltip;
