// Main App component

import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './hooks/useAuth';
import { usePageTracking } from './hooks/usePageTracking';
import LoadingSpinner from './components/ui/LoadingSpinner';
import HomePage from './pages/Home/HomePage';
import LoginPage from './pages/Auth/LoginPage';
import RegisterPage from './pages/Auth/RegisterPage';
import VerifyPhonePage from './pages/Auth/VerifyPhonePage';
import ScoringPage from './pages/Scoring/ScoringPage';
import DashboardPage from './pages/Dashboard/DashboardPage';
import ProfilePage from './pages/Profile/ProfilePage';
import TeamBuilderPage from './pages/TeamBuilder/TeamBuilderPage';
import MyTeamPage from './pages/MyTeam/MyTeamPage';
import GolfersPage from './pages/Golfers/GolfersPage';
import GolferProfilePage from './pages/GolferProfile/GolferProfilePage';
import LeaderboardPage from './pages/Leaderboard/LeaderboardPage';
import UsersPage from './pages/Users/UsersPage';
import UserProfilePage from './pages/Users/UserProfilePage';
import TournamentsPage from './pages/Tournaments/TournamentsPage';
import TournamentDetailPage from './pages/Tournaments/TournamentDetailPage';

// Admin pages
import AdminOverviewPage from './pages/Admin/AdminOverviewPage';
import GolfersAdminPage from './pages/Admin/GolfersAdminPage';
import TournamentsAdminPage from './pages/Admin/TournamentsAdminPage';
import ScoresAdminPage from './pages/Admin/ScoresAdminPage';
import UsersAdminPage from './pages/Admin/UsersAdminPage';
import SettingsAdminPage from './pages/Admin/SettingsAdminPage';
import SeasonUploadPage from './pages/Admin/SeasonUploadPage';
import SeasonsAdminPage from './pages/Admin/SeasonsAdminPage';

// Protected route wrapper for admin pages
const AdminRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated, isAdmin, user, loading } = useAuth();

  if (loading) {
    return <LoadingSpinner text="Loading..." />;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (user && user.phoneNumber && !user.phoneVerified) {
    return <Navigate to="/verify-phone" replace />;
  }

  if (!isAdmin) {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
};

// Protected route wrapper for authenticated pages
const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated, loading } = useAuth();

  if (loading) {
    return <LoadingSpinner text="Loading..." />;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
};

// Protected + verified route wrapper — requires phone verification
const VerifiedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated, user, loading } = useAuth();

  if (loading) {
    return <LoadingSpinner text="Loading..." />;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  // Redirect unverified users to the phone verification page
  // Grandfathered users (phoneVerified undefined/true or phoneNumber null) pass through
  if (user && user.phoneNumber && !user.phoneVerified) {
    return <Navigate to="/verify-phone" replace />;
  }

  return <>{children}</>;
};

// Home route that redirects logged-in users to dashboard
const HomeRoute: React.FC = () => {
  const { isAuthenticated, loading } = useAuth();

  if (loading) {
    return <LoadingSpinner text="Loading..." />;
  }

  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />;
  }

  return <HomePage />;
};

const App: React.FC = () => {
  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  );
};

const AppRoutes: React.FC = () => {
  usePageTracking();

  return (
    <Routes>
      {/* Public routes */}
      <Route path="/" element={<HomeRoute />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />

      {/* Phone verification — requires auth but not verified phone */}
      <Route
        path="/verify-phone"
        element={
          <ProtectedRoute>
            <VerifyPhonePage />
          </ProtectedRoute>
        }
      />

      <Route
        path="/scoring"
        element={
          <VerifiedRoute>
            <ScoringPage />
          </VerifiedRoute>
        }
      />

      {/* Protected user routes */}
      <Route
        path="/dashboard"
        element={
          <VerifiedRoute>
            <DashboardPage />
          </VerifiedRoute>
        }
      />
      <Route
        path="/profile"
        element={
          <VerifiedRoute>
            <ProfilePage />
          </VerifiedRoute>
        }
      />
      <Route
        path="/my-team"
        element={
          <VerifiedRoute>
            <MyTeamPage />
          </VerifiedRoute>
        }
      />
      <Route
        path="/team-builder"
        element={
          <VerifiedRoute>
            <TeamBuilderPage />
          </VerifiedRoute>
        }
      />
      <Route
        path="/golfers"
        element={
          <VerifiedRoute>
            <GolfersPage />
          </VerifiedRoute>
        }
      />
      <Route
        path="/golfers/:id"
        element={
          <VerifiedRoute>
            <GolferProfilePage />
          </VerifiedRoute>
        }
      />
      <Route
        path="/leaderboard"
        element={
          <VerifiedRoute>
            <LeaderboardPage />
          </VerifiedRoute>
        }
      />
      <Route
        path="/users"
        element={
          <VerifiedRoute>
            <UsersPage />
          </VerifiedRoute>
        }
      />
      <Route
        path="/users/:userId"
        element={
          <VerifiedRoute>
            <UserProfilePage />
          </VerifiedRoute>
        }
      />
      <Route
        path="/tournaments"
        element={
          <VerifiedRoute>
            <TournamentsPage />
          </VerifiedRoute>
        }
      />
      <Route
        path="/tournaments/:id"
        element={
          <VerifiedRoute>
            <TournamentDetailPage />
          </VerifiedRoute>
        }
      />

      {/* Admin routes */}
      <Route
        path="/admin"
        element={
          <AdminRoute>
            <AdminOverviewPage />
          </AdminRoute>
        }
      />
      <Route
        path="/admin/golfers"
        element={
          <AdminRoute>
            <GolfersAdminPage />
          </AdminRoute>
        }
      />
      <Route
        path="/admin/tournaments"
        element={
          <AdminRoute>
            <TournamentsAdminPage />
          </AdminRoute>
        }
      />
      <Route
        path="/admin/scores"
        element={
          <AdminRoute>
            <ScoresAdminPage />
          </AdminRoute>
        }
      />
      <Route
        path="/admin/users"
        element={
          <AdminRoute>
            <UsersAdminPage />
          </AdminRoute>
        }
      />
      <Route
        path="/admin/settings"
        element={
          <AdminRoute>
            <SettingsAdminPage />
          </AdminRoute>
        }
      />
      <Route
        path="/admin/seasons"
        element={
          <AdminRoute>
            <SeasonsAdminPage />
          </AdminRoute>
        }
      />
      <Route
        path="/admin/season-upload"
        element={
          <AdminRoute>
            <SeasonUploadPage />
          </AdminRoute>
        }
      />
    </Routes>
  );
};

export default App;
