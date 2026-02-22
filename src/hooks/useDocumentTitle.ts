// Hook to set document title per page for SEO

import { useEffect } from 'react';

const SITE_NAME = 'Bearwood Lakes Fantasy';

/**
 * Sets the document title. Resets to default on unmount.
 * @param title - Page-specific title (e.g., "Leaderboard"). Appended with site name.
 */
export const useDocumentTitle = (title: string) => {
  useEffect(() => {
    const prev = document.title;
    document.title = title ? `${title} | ${SITE_NAME}` : SITE_NAME;
    return () => {
      document.title = prev;
    };
  }, [title]);
};
