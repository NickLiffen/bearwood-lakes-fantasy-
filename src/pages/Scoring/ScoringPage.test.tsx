vi.mock('../../hooks/useDocumentTitle', () => ({
  useDocumentTitle: vi.fn(),
}));

vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({
    user: {
      id: '1',
      firstName: 'Test',
      lastName: 'User',
      username: 'testuser',
      role: 'user',
      phoneVerified: true,
    },
    logout: vi.fn(),
  }),
}));

vi.mock('../../components/layout/PageLayout', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import React from 'react';
import ScoringPage from './ScoringPage';

describe('ScoringPage', () => {
  it('renders without crashing', () => {
    render(
      <MemoryRouter>
        <ScoringPage />
      </MemoryRouter>
    );
    expect(document.body).toBeTruthy();
  });
});
