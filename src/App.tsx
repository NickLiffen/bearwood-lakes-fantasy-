// Main App component

import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import HomePage from './pages/Home/HomePage';
import LoginPage from './pages/Auth/LoginPage';
import RegisterPage from './pages/Auth/RegisterPage';
import DashboardPage from './pages/Dashboard/DashboardPage';
import ProfilePage from './pages/Profile/ProfilePage';
import TeamBuilderPage from './pages/TeamBuilder/TeamBuilderPage';
import MyTeamPage from './pages/MyTeam/MyTeamPage';
import PlayersPage from './pages/Players/PlayersPage';
import PlayerProfilePage from './pages/PlayerProfile/PlayerProfilePage';
import LeaderboardPage from './pages/Leaderboard/LeaderboardPage';

// Admin pages
import AdminOverviewPage from './pages/Admin/AdminOverviewPage';
import PlayersAdminPage from './pages/Admin/PlayersAdminPage';
import TournamentsAdminPage from './pages/Admin/TournamentsAdminPage';
import ScoresAdminPage from './pages/Admin/ScoresAdminPage';
import UsersAdminPage from './pages/Admin/UsersAdminPage';
import SettingsAdminPage from './pages/Admin/SettingsAdminPage';

// Protected route wrapper for admin pages
const AdminRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const user = localStorage.getItem('user');
  const parsedUser = user ? JSON.parse(user) : null;

  if (!parsedUser) {
    return <Navigate to="/login" replace />;
  }

  if (parsedUser.role !== 'admin') {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
};

// Protected route wrapper for authenticated pages
const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const token = localStorage.getItem('token');
  if (!token) {
    return <Navigate to="/login" replace />;
  }
  return <>{children}</>;
};

// Home route that redirects logged-in users to dashboard
const HomeRoute: React.FC = () => {
  const token = localStorage.getItem('token');
  if (token) {
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
          path="/players"
          element={
            <ProtectedRoute>
              <PlayersPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/players/:id"
          element={
            <ProtectedRoute>
              <PlayerProfilePage />
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
          path="/admin/players"
          element={
            <AdminRoute>
              <PlayersAdminPage />
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
