vi.mock('../../../hooks/useAuth', () => ({
  useAuth: () => ({
    register: vi.fn(),
    user: null,
    isAuthenticated: false,
    loading: false,
  }),
}));

vi.mock('../../../hooks/useDocumentTitle', () => ({
  useDocumentTitle: vi.fn(),
}));

vi.mock('../../utils/validation', () => {
  const noop = () => null;
  const noopFactory = () => noop;
  return {
    useFormValidation: () => ({
      values: {
        firstName: '',
        lastName: '',
        username: '',
        email: '',
        phoneNumber: '',
        password: '',
        confirmPassword: '',
      },
      setValue: vi.fn(),
      setFieldTouched: vi.fn(),
      validateAll: vi.fn().mockReturnValue(true),
      getFieldState: vi.fn().mockReturnValue({ touched: false, error: null }),
      errors: {},
    }),
    validators: {
      required: noop,
      minLength: noopFactory,
      maxLength: noopFactory,
      email: noop,
      matches: noop,
      lettersOnly: noop,
      alphanumeric: noop,
      ukPhone: noop,
      password: noop,
      passwordMatch: noopFactory,
    },
    sanitizers: { trim: (v: string) => v, phone: (v: string) => v },
    getInputClassName: () => '',
  };
});

import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import RegisterPage from './RegisterPage';

describe('RegisterPage', () => {
  it('renders without crashing', () => {
    render(
      <MemoryRouter>
        <RegisterPage />
      </MemoryRouter>
    );
    expect(document.body).toBeTruthy();
  });
});
