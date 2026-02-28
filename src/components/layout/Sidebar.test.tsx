import { render, screen } from '@testing-library/react';
import { Sidebar } from './Sidebar';

describe('Sidebar', () => {
  it('renders aside element', () => {
    const { container } = render(<Sidebar />);
    expect(container.querySelector('aside')).toBeInTheDocument();
  });

  it('renders nav element', () => {
    const { container } = render(<Sidebar />);
    expect(container.querySelector('nav')).toBeInTheDocument();
  });
});
