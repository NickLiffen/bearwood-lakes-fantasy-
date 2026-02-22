// Google Analytics page view tracking for React Router SPA navigation

import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
  }
}

const GA_MEASUREMENT_ID = 'G-MBTHTLZ65J';

/**
 * Sends a page_view event to GA4 on every route change.
 * Must be used inside a <BrowserRouter>.
 */
export const usePageTracking = () => {
  const location = useLocation();

  useEffect(() => {
    if (window.gtag) {
      window.gtag('event', 'page_view', {
        page_path: location.pathname + location.search,
        page_title: document.title,
        send_to: GA_MEASUREMENT_ID,
      });
    }
  }, [location]);
};
