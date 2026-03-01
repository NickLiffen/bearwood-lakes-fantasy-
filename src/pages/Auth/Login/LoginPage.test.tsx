vi.mock('../../../hooks/useAuth', () => ({
  useAuth: () => ({
    login: vi.fn(),
    user: null,
    isAuthenticated: false,
    loading: false,
  }),
}));

vi.mock('../../../hooks/useDocumentTitle', () => ({
  useDocumentTitle: vi.fn(),
}));

vi.mock('../../utils/validation', () => ({
  useFormValidation: () => ({
    values: { username: '', password: '' },
    setValue: vi.fn(),
    setFieldTouched: vi.fn(),
    validateAll: vi.fn().mockReturnValue(true),
    getFieldState: vi.fn().mockReturnValue({ touched: false, error: null }),
    errors: {},
  }),
  validators: { required: vi.fn(), minLength: vi.fn() },
  sanitizers: { trim: vi.fn((v: string) => v) },
  getInputClassName: vi.fn().mockReturnValue(''),
}));

import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import LoginPage from './LoginPage';

describe('LoginPage', () => {
  it('renders without crashing', () => {
    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>
    );
    expect(document.body).toBeTruthy();
  });
});
