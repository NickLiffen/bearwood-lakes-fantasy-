// Hook to keep authenticated routes out of search engine indexes

import { useEffect } from 'react';

const ROBOTS_META_SELECTOR = 'meta[name="robots"][data-noindex-route="true"]';

/**
 * Injects `<meta name="robots" content="noindex,nofollow">` for the lifetime of the calling
 * component, then removes it once the last caller unmounts.
 *
 * The app is a SPA: every route is served the same static `index.html`, so private routes
 * would otherwise inherit the homepage's indexable metadata. Googlebot renders JavaScript, so
 * a meta tag added at render time is honoured. It complements the `X-Robots-Tag` headers in
 * `netlify.toml`, which may not survive the SPA rewrite to `/index.html`.
 *
 * Note this signal is only durable for routes a crawler can actually stay on. The guards in
 * `App.tsx` redirect anonymous visitors to `/login`, which unmounts the guard and takes the
 * tag with it — deliberately, so the public `/login` page is not left carrying a stale
 * noindex. For those routes the `X-Robots-Tag` header is the lasting signal.
 *
 * Call this from the route guards in `App.tsx` rather than from individual pages, so newly
 * added private routes are covered automatically.
 */
export const useNoIndex = () => {
  useEffect(() => {
    // Guards can overlap — nested guards, or a route transition that mounts the incoming
    // guard before unmounting the outgoing one. Reference-count callers on the element
    // itself so the first unmount can't strip the tag while another caller still needs it,
    // and so the count resets naturally whenever the element goes away.
    const existing = document.head.querySelector<HTMLMetaElement>(ROBOTS_META_SELECTOR);
    const meta = existing ?? document.createElement('meta');

    if (!existing) {
      meta.setAttribute('name', 'robots');
      meta.setAttribute('content', 'noindex,nofollow');
      meta.setAttribute('data-noindex-route', 'true');
    }

    meta.dataset.noindexRefs = String(Number(meta.dataset.noindexRefs ?? '0') + 1);

    if (!existing) {
      document.head.appendChild(meta);
    }

    return () => {
      const remaining = Number(meta.dataset.noindexRefs ?? '1') - 1;
      if (remaining > 0) {
        meta.dataset.noindexRefs = String(remaining);
      } else {
        meta.remove();
      }
    };
  }, []);
};
