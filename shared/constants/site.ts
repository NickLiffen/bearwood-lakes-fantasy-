// Canonical site origin

/**
 * The single canonical origin for the site.
 *
 * Google treats a page as a duplicate ("Alternate page with proper canonical tag") when the
 * canonical tag points at a different host than the one being crawled, so every absolute URL
 * the site emits — canonical links, Open Graph tags, structured data, and the sitemap — must
 * use this origin and nothing else.
 *
 * The old `bearwoodlakes.netlify.app` host 301s here via `netlify.toml`.
 *
 * Note: `index.html`, `public/robots.txt` and `public/sitemap.xml` are static assets served
 * outside the bundler, so they repeat this value literally. `site.test.ts` asserts they stay
 * in sync with this constant.
 */
export const SITE_URL = 'https://bearwoodfantasy.com';

/** Human-readable site name, used in page titles and Open Graph tags. */
export const SITE_NAME = 'Bearwood Lakes Fantasy';
