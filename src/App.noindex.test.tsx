import { render, screen } from '@testing-library/react';
import React from 'react';

// Stub every page so rendering the real <App /> doesn't pull in services, contexts or network.
vi.mock('./pages/Home/HomePage', () => ({ default: () => <div>HomePage</div> }));
vi.mock('./pages/Auth/Login', () => ({ default: () => <div>LoginPage</div> }));
vi.mock('./pages/Auth/Register', () => ({ default: () => <div>RegisterPage</div> }));
vi.mock('./pages/Auth/VerifyPhone', () => ({ default: () => <div>VerifyPhonePage</div> }));
vi.mock('./pages/Scoring/ScoringPage', () => ({ default: () => <div>ScoringPage</div> }));
vi.mock('./pages/Dashboard/DashboardPage', () => ({ default: () => <div>DashboardPage</div> }));
vi.mock('./pages/Profile/ProfilePage', () => ({ default: () => <div>ProfilePage</div> }));
vi.mock('./pages/TeamBuilder/TeamBuilderPage', () => ({
  default: () => <div>TeamBuilderPage</div>,
}));
vi.mock('./pages/MyTeam/MyTeamPage', () => ({ default: () => <div>MyTeamPage</div> }));
vi.mock('./pages/Golfers/GolfersPage', () => ({ default: () => <div>GolfersPage</div> }));
vi.mock('./pages/GolferProfile/GolferProfilePage', () => ({
  default: () => <div>GolferProfilePage</div>,
}));
vi.mock('./pages/Leaderboard/LeaderboardPage', () => ({
  default: () => <div>LeaderboardPage</div>,
}));
vi.mock('./pages/Users/UsersPage', () => ({ default: () => <div>UsersPage</div> }));
vi.mock('./pages/Users/UserProfilePage', () => ({ default: () => <div>UserProfilePage</div> }));
vi.mock('./pages/Tournaments/TournamentsPage', () => ({
  default: () => <div>TournamentsPage</div>,
}));
vi.mock('./pages/Tournaments/TournamentDetailPage', () => ({
  default: () => <div>TournamentDetailPage</div>,
}));
vi.mock('./pages/Leagues/LeaguesPage', () => ({ default: () => <div>LeaguesPage</div> }));
vi.mock('./pages/Leagues/CreateLeaguePage', () => ({
  default: () => <div>CreateLeaguePage</div>,
}));
vi.mock('./pages/Leagues/LeagueDetailPage', () => ({
  default: () => <div>LeagueDetailPage</div>,
}));
vi.mock('./pages/Leagues/LeagueJoinPage', () => ({ default: () => <div>LeagueJoinPage</div> }));
vi.mock('./pages/Admin/Overview', () => ({ default: () => <div>AdminOverviewPage</div> }));
vi.mock('./pages/Admin/Golfers', () => ({ default: () => <div>GolfersAdminPage</div> }));
vi.mock('./pages/Admin/Tournaments', () => ({ default: () => <div>TournamentsAdminPage</div> }));
vi.mock('./pages/Admin/Scores', () => ({ default: () => <div>ScoresAdminPage</div> }));
vi.mock('./pages/Admin/Users', () => ({ default: () => <div>UsersAdminPage</div> }));
vi.mock('./pages/Admin/Settings', () => ({ default: () => <div>SettingsAdminPage</div> }));
vi.mock('./pages/Admin/Seasons', () => ({ default: () => <div>SeasonsAdminPage</div> }));
vi.mock('./pages/Admin/SeasonUpload', () => ({ default: () => <div>SeasonUploadPage</div> }));
vi.mock('./pages/Admin/TournamentUpload', () => ({
  default: () => <div>TournamentUploadPage</div>,
}));
vi.mock('./pages/Admin/Leagues', () => ({ default: () => <div>LeaguesAdminPage</div> }));
vi.mock('./components/ui/LoadingSpinner', () => ({ default: () => <div>Loading...</div> }));
vi.mock('./hooks/usePageTracking', () => ({ usePageTracking: () => {} }));

const mockAuth = {
  user: null as Record<string, unknown> | null,
  token: null as string | null,
  isAuthenticated: false,
  isAdmin: false,
  canAccessAdmin: false,
  loading: false,
  login: vi.fn(),
  register: vi.fn(),
  logout: vi.fn(),
  refreshToken: vi.fn(),
};

vi.mock('./hooks/useAuth', () => ({ useAuth: () => mockAuth }));

// Import after the mocks so App picks up the stubs.
import App from './App';

const robotsMeta = () => document.head.querySelector('meta[name="robots"]');

const signInVerifiedUser = ({ admin = false } = {}) => {
  mockAuth.isAuthenticated = true;
  mockAuth.isAdmin = admin;
  mockAuth.canAccessAdmin = admin;
  mockAuth.token = 'token';
  mockAuth.user = { id: '1', firstName: 'Test', lastName: 'User', phoneVerified: true };
};

const renderAt = (path: string) => {
  window.history.pushState({}, '', path);
  return render(<App />);
};

describe('App marks private routes noindex', () => {
  beforeEach(() => {
    mockAuth.user = null;
    mockAuth.token = null;
    mockAuth.isAuthenticated = false;
    mockAuth.isAdmin = false;
    mockAuth.canAccessAdmin = false;
    mockAuth.loading = false;
    document.head.querySelectorAll('meta[name="robots"]').forEach((meta) => meta.remove());
  });

  it.each([
    ['/dashboard', 'DashboardPage'],
    ['/leaderboard', 'LeaderboardPage'],
    ['/golfers', 'GolfersPage'],
    ['/users', 'UsersPage'],
    ['/tournaments', 'TournamentsPage'],
    ['/leagues', 'LeaguesPage'],
    ['/my-team', 'MyTeamPage'],
    ['/profile', 'ProfilePage'],
  ])('adds noindex on %s', (path, expectedPage) => {
    signInVerifiedUser();
    renderAt(path);

    expect(screen.getByText(expectedPage)).toBeInTheDocument();
    expect(robotsMeta()?.getAttribute('content')).toBe('noindex,nofollow');
  });

  it('adds noindex on admin routes', () => {
    signInVerifiedUser({ admin: true });
    renderAt('/admin/golfers');

    expect(screen.getByText('GolfersAdminPage')).toBeInTheDocument();
    expect(robotsMeta()?.getAttribute('content')).toBe('noindex,nofollow');
  });

  // The homepage is the only URL in sitemap.xml, so it must stay indexable.
  it('leaves the public homepage indexable', () => {
    renderAt('/');

    expect(screen.getByText('HomePage')).toBeInTheDocument();
    expect(robotsMeta()).toBeNull();
  });

  it.each([
    ['/login', 'LoginPage'],
    ['/register', 'RegisterPage'],
  ])('leaves the public %s route indexable', (path, expectedPage) => {
    renderAt(path);

    expect(screen.getByText(expectedPage)).toBeInTheDocument();
    expect(robotsMeta()).toBeNull();
  });

  it('redirects an anonymous visitor away from a private route without leaking a noindex tag', () => {
    renderAt('/dashboard');

    // The guard calls useNoIndex() before returning <Navigate>, so the tag is applied while
    // /dashboard is mounted — but the redirect immediately unmounts the guard and takes the
    // tag with it. That cleanup is the point: /login is public and must stay indexable, so a
    // stale noindex must not survive the redirect. For auth-walled URLs the durable signal is
    // the X-Robots-Tag header in netlify.toml, not this tag.
    expect(screen.getByText('LoginPage')).toBeInTheDocument();
    expect(robotsMeta()).toBeNull();
  });
});
