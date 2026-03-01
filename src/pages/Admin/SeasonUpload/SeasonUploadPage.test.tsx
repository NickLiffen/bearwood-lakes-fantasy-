vi.mock('../../../hooks/useAuth', () => ({
  useAuth: () => ({
    user: {
      id: '1',
      firstName: 'Admin',
      lastName: 'User',
      username: 'admin',
      role: 'admin',
      phoneVerified: true,
    },
    token: 'mock-token',
    isAuthenticated: true,
    isAdmin: true,
    logout: vi.fn(),
    loading: false,
  }),
}));

vi.mock('../../../hooks/useApiClient', () => ({
  useApiClient: () => ({
    get: vi.fn().mockResolvedValue({ success: true, data: null }),
    post: vi.fn().mockResolvedValue({ success: true, data: null }),
    put: vi.fn(),
    del: vi.fn(),
    isAuthReady: true,
  }),
}));

vi.mock('../../../hooks/useDocumentTitle', () => ({
  useDocumentTitle: vi.fn(),
}));

vi.mock('../../../components/AdminLayout/AdminLayout', () => ({
  default: ({ children, title }: { children: React.ReactNode; title: string }) => (
    <div>
      <h1>{title}</h1>
      {children}
    </div>
  ),
}));

import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import React from 'react';
import SeasonUploadPage from './SeasonUploadPage';

describe('SeasonUploadPage', () => {
  it('renders without crashing', () => {
    render(
      <MemoryRouter>
        <SeasonUploadPage />
      </MemoryRouter>
    );
    expect(document.body).toBeTruthy();
  });
});
