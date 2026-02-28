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
    get: vi.fn().mockResolvedValue({ success: true, data: [] }),
    post: vi.fn(),
    put: vi.fn(),
    del: vi.fn(),
    request: vi.fn(),
    isAuthReady: true,
  }),
}));

vi.mock('../../hooks/useDocumentTitle', () => ({
  useDocumentTitle: vi.fn(),
}));

vi.mock('../../components/AdminLayout/AdminLayout', () => ({
  default: ({ children, title }: { children: React.ReactNode; title: string }) => <div><h1>{title}</h1>{children}</div>,
}));

vi.mock('../../components/ui/LoadingSpinner', () => ({
  default: () => <div>Loading...</div>,
}));

vi.mock('../../utils/validation', () => ({
  validators: { required: vi.fn(), minLength: vi.fn() },
  sanitizers: { trim: vi.fn((v: string) => v) },
  getInputClassName: vi.fn().mockReturnValue(''),
}));

import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import React from 'react';
import GolfersAdminPage from './GolfersAdminPage';

describe('GolfersAdminPage', () => {
  it('renders without crashing', () => {
    render(
      <MemoryRouter>
        <GolfersAdminPage />
      </MemoryRouter>
    );
    expect(document.body).toBeTruthy();
  });
});
