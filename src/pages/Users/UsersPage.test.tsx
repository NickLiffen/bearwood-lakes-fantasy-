vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({
    user: { id: '1', firstName: 'Test', lastName: 'User', username: 'testuser', role: 'user', phoneVerified: true },
    token: 'mock-token',
    isAuthenticated: true,
    logout: vi.fn(),
    loading: false,
  }),
}));

vi.mock('../../hooks/useAsyncData', () => ({
  useAsyncData: () => ({
    data: [],
    loading: false,
    error: null,
  }),
}));

vi.mock('../../hooks/useDocumentTitle', () => ({
  useDocumentTitle: vi.fn(),
}));

vi.mock('../../components/layout/PageLayout', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('../../components/ui/LoadingSpinner', () => ({
  default: () => <div>Loading...</div>,
}));

vi.mock('../../components/ui/SearchBar', () => ({
  default: () => <div>SearchBar</div>,
}));

vi.mock('../../components/ui/DataTable', () => ({
  default: () => <div>DataTable</div>,
}));

vi.mock('../../utils/search', () => ({
  matchesSearch: vi.fn().mockReturnValue(true),
}));

import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import React from 'react';
import UsersPage from './UsersPage';

describe('UsersPage', () => {
  it('renders without crashing', () => {
    render(
      <MemoryRouter>
        <UsersPage />
      </MemoryRouter>
    );
    expect(document.body).toBeTruthy();
  });
});
