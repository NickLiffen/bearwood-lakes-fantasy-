import { readFileSync } from 'fs';
import path from 'path';
import { SITE_URL } from './site';

const REPO_ROOT = path.resolve(__dirname, '../..');
const LEGACY_HOST = 'bearwoodlakes.netlify.app';

const read = (relativePath: string) => readFileSync(path.join(REPO_ROOT, relativePath), 'utf-8');

// Routes wrapped in a guard in src/App.tsx. They client-side redirect anonymous crawlers to
// /login, so listing them in the sitemap produces "Page with redirect" in Search Console.
const AUTH_WALLED_PATHS = [
  '/dashboard',
  '/profile',
  '/my-team',
  '/team-builder',
  '/scoring',
  '/verify-phone',
  '/golfers',
  '/leaderboard',
  '/users',
  '/tournaments',
  '/leagues',
  '/admin',
];

describe('SITE_URL', () => {
  it('is an https origin with no trailing slash', () => {
    expect(SITE_URL).toBe('https://bearwoodfantasy.com');
    expect(SITE_URL.endsWith('/')).toBe(false);
  });
});

describe('SEO metadata stays on the canonical origin', () => {
  const indexHtml = read('index.html');
  const robotsTxt = read('public/robots.txt');
  const sitemapXml = read('public/sitemap.xml');

  it.each([
    ['index.html', () => indexHtml],
    ['public/robots.txt', () => robotsTxt],
    ['public/sitemap.xml', () => sitemapXml],
  ])('%s does not reference the legacy Netlify host', (_name, getContent) => {
    expect(getContent()).not.toContain(LEGACY_HOST);
  });

  describe('index.html', () => {
    it('declares exactly one self-referencing canonical link', () => {
      const canonicals = [...indexHtml.matchAll(/<link\s+rel="canonical"\s+href="([^"]+)"/g)];
      expect(canonicals).toHaveLength(1);
      expect(canonicals[0][1]).toBe(`${SITE_URL}/`);
    });

    it('points every absolute URL at the canonical origin', () => {
      const absoluteSiteUrls = [...indexHtml.matchAll(/https:\/\/bearwood[^"\s]*/g)].map(
        (match) => match[0]
      );
      expect(absoluteSiteUrls.length).toBeGreaterThan(0);
      for (const url of absoluteSiteUrls) {
        expect(url.startsWith(SITE_URL)).toBe(true);
      }
    });

    it('has no page-level noindex on the homepage shell', () => {
      expect(indexHtml).not.toMatch(/<meta\s+name="robots"/);
    });
  });

  describe('public/robots.txt', () => {
    it('advertises the sitemap on the canonical origin', () => {
      expect(robotsTxt).toContain(`Sitemap: ${SITE_URL}/sitemap.xml`);
    });

    it('still blocks function and API paths', () => {
      expect(robotsTxt).toContain('Disallow: /.netlify/');
      expect(robotsTxt).toContain('Disallow: /api/');
    });

    it('does not disallow auth-walled routes, which would hide their noindex signal', () => {
      const disallowed = [...robotsTxt.matchAll(/^Disallow:\s*(\S+)/gm)].map((match) => match[1]);
      expect(disallowed).toEqual(['/.netlify/', '/api/']);
    });
  });

  describe('public/sitemap.xml', () => {
    const locations = [...sitemapXml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);

    it('lists only the homepage', () => {
      expect(locations).toEqual([`${SITE_URL}/`]);
    });

    it('lists no auth-walled routes', () => {
      for (const authWalledPath of AUTH_WALLED_PATHS) {
        expect(locations).not.toContain(`${SITE_URL}${authWalledPath}`);
      }
    });
  });
});

describe('netlify.toml redirects the legacy host', () => {
  const netlifyToml = read('netlify.toml');

  it('301s the legacy Netlify subdomain to the canonical origin', () => {
    expect(netlifyToml).toContain(`from = "https://${LEGACY_HOST}/*"`);
    expect(netlifyToml).toContain(`to = "${SITE_URL}/:splat"`);
    expect(netlifyToml).toContain('status = 301');
  });

  it('orders the legacy host redirect ahead of the SPA fallback', () => {
    const legacyHostIndex = netlifyToml.indexOf(`from = "https://${LEGACY_HOST}/*"`);
    const spaFallbackIndex = netlifyToml.indexOf('from = "/*"');
    expect(legacyHostIndex).toBeGreaterThan(-1);
    expect(spaFallbackIndex).toBeGreaterThan(-1);
    expect(legacyHostIndex).toBeLessThan(spaFallbackIndex);
  });

  it('marks auth-walled routes noindex', () => {
    for (const authWalledPath of AUTH_WALLED_PATHS) {
      expect(netlifyToml).toContain(`for = "${authWalledPath}"`);
    }
    expect(netlifyToml).toContain('X-Robots-Tag = "noindex"');
  });
});
