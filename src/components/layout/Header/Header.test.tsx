import { render, screen } from '@testing-library/react';
import { Header } from './Header';

describe('Header', () => {
  it('renders header with brand text', () => {
    render(<Header />);
    expect(screen.getByText('Bearwood Lakes Fantasy')).toBeInTheDocument();
  });

  it('renders a header element', () => {
    const { container } = render(<Header />);
    expect(container.querySelector('header')).toBeInTheDocument();
  });
});
