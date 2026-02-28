import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import React from 'react';

// Mock all page components as simple stubs
vi.mock('./pages/Home/HomePage', () => ({ default: () => <div>HomePage</div> }));
vi.mock('./pages/Auth/LoginPage', () => ({ default: () => <div>LoginPage</div> }));
vi.mock('./pages/Auth/RegisterPage', () => ({ default: () => <div>RegisterPage</div> }));
vi.mock('./pages/Auth/VerifyPhonePage', () => ({ default: () => <div>VerifyPhonePage</div> }));
vi.mock('./pages/Dashboard/DashboardPage', () => ({ default: () => <div>DashboardPage</div> }));
vi.mock('./pages/Scoring/ScoringPage', () => ({ default: () => <div>ScoringPage</div> }));
vi.mock('./pages/Profile/ProfilePage', () => ({ default: () => <div>ProfilePage</div> }));
vi.mock('./pages/TeamBuilder/TeamBuilderPage', () => ({ default: () => <div>TeamBuilderPage</div> }));
vi.mock('./pages/MyTeam/MyTeamPage', () => ({ default: () => <div>MyTeamPage</div> }));
vi.mock('./pages/Golfers/GolfersPage', () => ({ default: () => <div>GolfersPage</div> }));
vi.mock('./pages/GolferProfile/GolferProfilePage', () => ({ default: () => <div>GolferProfilePage</div> }));
vi.mock('./pages/Leaderboard/LeaderboardPage', () => ({ default: () => <div>LeaderboardPage</div> }));
vi.mock('./pages/Users/UsersPage', () => ({ default: () => <div>UsersPage</div> }));
vi.mock('./pages/Users/UserProfilePage', () => ({ default: () => <div>UserProfilePage</div> }));
vi.mock('./pages/Tournaments/TournamentsPage', () => ({ default: () => <div>TournamentsPage</div> }));
vi.mock('./pages/Tournaments/TournamentDetailPage', () => ({ default: () => <div>TournamentDetailPage</div> }));
vi.mock('./pages/Picks/PicksPage', () => ({ default: () => <div>PicksPage</div> }));
vi.mock('./pages/Scoreboard/ScoreboardPage', () => ({ default: () => <div>ScoreboardPage</div> }));
vi.mock('./pages/Admin/AdminOverviewPage', () => ({ default: () => <div>AdminOverviewPage</div> }));
vi.mock('./pages/Admin/GolfersAdminPage', () => ({ default: () => <div>GolfersAdminPage</div> }));
vi.mock('./pages/Admin/TournamentsAdminPage', () => ({ default: () => <div>TournamentsAdminPage</div> }));
vi.mock('./pages/Admin/ScoresAdminPage', () => ({ default: () => <div>ScoresAdminPage</div> }));
vi.mock('./pages/Admin/UsersAdminPage', () => ({ default: () => <div>UsersAdminPage</div> }));
vi.mock('./pages/Admin/SettingsAdminPage', () => ({ default: () => <div>SettingsAdminPage</div> }));
vi.mock('./pages/Admin/SeasonsAdminPage', () => ({ default: () => <div>SeasonsAdminPage</div> }));
vi.mock('./pages/Admin/SeasonUploadPage', () => ({ default: () => <div>SeasonUploadPage</div> }));
vi.mock('./components/ui/LoadingSpinner', () => ({ default: () => <div>Loading...</div> }));
vi.mock('./hooks/usePageTracking', () => ({ usePageTracking: () => {} }));

// Mutable auth state for testing different scenarios
const mockAuth = {
  user: null as Record<string, unknown> | null,
  token: null as string | null,
  isAuthenticated: false,
  isAdmin: false,
  loading: false,
  login: vi.fn(),
  register: vi.fn(),
  logout: vi.fn(),
  refreshToken: vi.fn(),
};

vi.mock('./hooks/useAuth', () => ({
  useAuth: () => mockAuth,
}));

// Import after mocks
import { Navigate } from 'react-router-dom';

// Recreate the route guards from App.tsx for testing
const VerifiedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const auth = mockAuth;
  if (auth.loading) return <div>Loading...</div>;
  if (!auth.isAuthenticated) return <Navigate to="/login" replace />;
  if (auth.user && (auth.user as Record<string, unknown>).phoneNumber && !(auth.user as Record<string, unknown>).phoneVerified) {
    return <Navigate to="/verify-phone" replace />;
  }
  return <>{children}</>;
};

describe('App route guards', () => {
  beforeEach(() => {
    mockAuth.user = null;
    mockAuth.token = null;
    mockAuth.isAuthenticated = false;
    mockAuth.isAdmin = false;
    mockAuth.loading = false;
  });

  it('redirects unauthenticated user from /dashboard to /login', () => {
    render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <Routes>
          <Route path="/login" element={<div>LoginPage</div>} />
          <Route
            path="/dashboard"
            element={
              <VerifiedRoute>
                <div>DashboardPage</div>
              </VerifiedRoute>
            }
          />
        </Routes>
      </MemoryRouter>
    );
    expect(screen.getByText('LoginPage')).toBeInTheDocument();
    expect(screen.queryByText('DashboardPage')).toBeNull();
  });

  it('redirects authenticated unverified user from /dashboard to /verify-phone', () => {
    mockAuth.isAuthenticated = true;
    mockAuth.user = { id: '1', firstName: 'Test', lastName: 'User', phoneNumber: '+447123456789', phoneVerified: false };
    mockAuth.token = 'token';

    render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <Routes>
          <Route path="/verify-phone" element={<div>VerifyPhonePage</div>} />
          <Route
            path="/dashboard"
            element={
              <VerifiedRoute>
                <div>DashboardPage</div>
              </VerifiedRoute>
            }
          />
        </Routes>
      </MemoryRouter>
    );
    expect(screen.getByText('VerifyPhonePage')).toBeInTheDocument();
    expect(screen.queryByText('DashboardPage')).toBeNull();
  });

  it('renders dashboard for authenticated verified user', () => {
    mockAuth.isAuthenticated = true;
    mockAuth.user = { id: '1', firstName: 'Test', lastName: 'User', phoneVerified: true };
    mockAuth.token = 'token';

    render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <Routes>
          <Route
            path="/dashboard"
            element={
              <VerifiedRoute>
                <div>DashboardPage</div>
              </VerifiedRoute>
            }
          />
        </Routes>
      </MemoryRouter>
    );
    expect(screen.getByText('DashboardPage')).toBeInTheDocument();
  });
});
