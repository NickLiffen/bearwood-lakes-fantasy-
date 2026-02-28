vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({
    user: { id: '1', firstName: 'Admin', lastName: 'User', username: 'admin', role: 'admin', phoneVerified: true },
    token: 'mock-token',
    isAuthenticated: true,
    isAdmin: true,
    logout: vi.fn(),
    loading: false,
  }),
}));

vi.mock('../../hooks/useApiClient', () => ({
  useApiClient: () => ({
    get: vi.fn().mockResolvedValue({ success: true, data: { users: 0, golfers: 0, activeGolfers: 0, tournaments: 0, publishedTournaments: 0, completeTournaments: 0, totalScoresEntered: 0 } }),
    post: vi.fn(),
    put: vi.fn(),
    del: vi.fn(),
    isAuthReady: true,
  }),
}));

vi.mock('../../components/AdminLayout/AdminLayout', () => ({
  default: ({ children, title }: { children: React.ReactNode; title: string }) => <div><h1>{title}</h1>{children}</div>,
}));

import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import React from 'react';
import AdminOverviewPage from './AdminOverviewPage';

describe('AdminOverviewPage', () => {
  it('renders without crashing', () => {
    render(
      <MemoryRouter>
        <AdminOverviewPage />
      </MemoryRouter>
    );
    expect(document.body).toBeTruthy();
  });
});
