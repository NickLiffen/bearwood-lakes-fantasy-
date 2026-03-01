import { render, screen } from '@testing-library/react';
import { FormField } from './FormField';

describe('FormField', () => {
  it('renders label', () => {
    render(
      <FormField label="Username" htmlFor="username">
        <input id="username" />
      </FormField>
    );
    expect(screen.getByText('Username')).toBeInTheDocument();
  });

  it('renders children', () => {
    render(
      <FormField label="Name" htmlFor="name">
        <input id="name" data-testid="child-input" />
      </FormField>
    );
    expect(screen.getByTestId('child-input')).toBeInTheDocument();
  });

  it('displays error message', () => {
    render(
      <FormField label="Email" htmlFor="email" error="Invalid email">
        <input id="email" />
      </FormField>
    );
    expect(screen.getByText('Invalid email')).toBeInTheDocument();
  });

  it('does not display error when not provided', () => {
    const { container } = render(
      <FormField label="Email" htmlFor="email">
        <input id="email" />
      </FormField>
    );
    const spans = container.querySelectorAll('span');
    expect(spans.length).toBe(0);
  });
});
