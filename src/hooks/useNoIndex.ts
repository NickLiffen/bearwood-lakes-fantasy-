// Hook to keep authenticated routes out of search engine indexes

import { useEffect } from 'react';

const ROBOTS_META_SELECTOR = 'meta[name="robots"][data-noindex-route="true"]';

/**
 * Injects `<meta name="robots" content="noindex,nofollow">` for the lifetime of the calling
 * component, then removes it on unmount.
 *
 * The app is a SPA: every route is served the same static `index.html`, so private routes
 * would otherwise inherit the homepage's indexable metadata. Googlebot renders JavaScript,
 * so a meta tag added at render time is honoured — this is the reliable counterpart to the
 * `X-Robots-Tag` headers in `netlify.toml`, which may not survive the SPA rewrite.
 *
 * Call this from the route guards in `App.tsx` rather than from individual pages, so newly
 * added private routes are covered automatically.
 */
export const useNoIndex = () => {
  useEffect(() => {
    // A nested guard may already have added the tag; reuse it rather than duplicating.
    const existing = document.head.querySelector(ROBOTS_META_SELECTOR);
    if (existing) {
      return;
    }

    const meta = document.createElement('meta');
    meta.setAttribute('name', 'robots');
    meta.setAttribute('content', 'noindex,nofollow');
    meta.setAttribute('data-noindex-route', 'true');
    document.head.appendChild(meta);

    return () => {
      meta.remove();
    };
  }, []);
};
