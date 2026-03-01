vi.mock('../../../hooks/useAuth', () => ({
  useAuth: () => ({
    user: {
      id: '1',
      firstName: 'Test',
      lastName: 'User',
      phoneNumber: '+447000000000',
      phoneVerified: false,
    },
    token: 'mock-token',
    logout: vi.fn(),
    loading: false,
  }),
}));

vi.mock('../../../hooks/useDocumentTitle', () => ({
  useDocumentTitle: vi.fn(),
}));

import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import VerifyPhonePage from './VerifyPhonePage';

describe('VerifyPhonePage', () => {
  it('renders without crashing', () => {
    render(
      <MemoryRouter>
        <VerifyPhonePage />
      </MemoryRouter>
    );
    expect(document.body).toBeTruthy();
  });
});
