// Main App component

import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './hooks/useAuth';
import HomePage from './pages/Home/HomePage';
import LoginPage from './pages/Auth/LoginPage';
import RegisterPage from './pages/Auth/RegisterPage';
import DashboardPage from './pages/Dashboard/DashboardPage';
import ProfilePage from './pages/Profile/ProfilePage';
import TeamBuilderPage from './pages/TeamBuilder/TeamBuilderPage';
import MyTeamPage from './pages/MyTeam/MyTeamPage';
import GolfersPage from './pages/Golfers/GolfersPage';
import GolferProfilePage from './pages/GolferProfile/GolferProfilePage';
import LeaderboardPage from './pages/Leaderboard/LeaderboardPage';
import UsersPage from './pages/Users/UsersPage';
import UserProfilePage from './pages/Users/UserProfilePage';

// Admin pages
import AdminOverviewPage from './pages/Admin/AdminOverviewPage';
import GolfersAdminPage from './pages/Admin/GolfersAdminPage';
import TournamentsAdminPage from './pages/Admin/TournamentsAdminPage';
import ScoresAdminPage from './pages/Admin/ScoresAdminPage';
import UsersAdminPage from './pages/Admin/UsersAdminPage';
import SettingsAdminPage from './pages/Admin/SettingsAdminPage';

// Protected route wrapper for admin pages
const AdminRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated, isAdmin, loading } = useAuth();

  if (loading) {
    return <div className="loading-screen">Loading...</div>;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
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
    return <div className="loading-screen">Loading...</div>;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
};

// Home route that redirects logged-in users to dashboard
const HomeRoute: React.FC = () => {
  const { isAuthenticated, loading } = useAuth();

  if (loading) {
    return <div className="loading-screen">Loading...</div>;
  }

  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />;
  }

  return <HomePage />;
};

const App: React.FC = () => {
  return (
    <BrowserRouter>
      <Routes>
        {/* Public routes */}
        <Route path="/" element={<HomeRoute />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />

        {/* Protected user routes */}
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <DashboardPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/profile"
          element={
            <ProtectedRoute>
              <ProfilePage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/my-team"
          element={
            <ProtectedRoute>
              <MyTeamPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/team-builder"
          element={
            <ProtectedRoute>
              <TeamBuilderPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/golfers"
          element={
            <ProtectedRoute>
              <GolfersPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/golfers/:id"
          element={
            <ProtectedRoute>
              <GolferProfilePage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/leaderboard"
          element={
            <ProtectedRoute>
              <LeaderboardPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/users"
          element={
            <ProtectedRoute>
              <UsersPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/users/:userId"
          element={
            <ProtectedRoute>
              <UserProfilePage />
            </ProtectedRoute>
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
      </Routes>
    </BrowserRouter>
  );
};

export default App;
