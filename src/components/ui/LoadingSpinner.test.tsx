import { render, screen } from '@testing-library/react';
import LoadingSpinner from './LoadingSpinner';

describe('LoadingSpinner', () => {
  it('renders default "Loading..." text', () => {
    render(<LoadingSpinner />);
    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('renders custom text', () => {
    render(<LoadingSpinner text="Please wait" />);
    expect(screen.getByText('Please wait')).toBeInTheDocument();
  });

  it('applies size class', () => {
    const { container } = render(<LoadingSpinner size="small" />);
    expect(container.querySelector('.spinner-small')).toBeInTheDocument();
  });

  it('defaults to large size class', () => {
    const { container } = render(<LoadingSpinner />);
    expect(container.querySelector('.spinner-large')).toBeInTheDocument();
  });

  it('applies fullPage class by default', () => {
    const { container } = render(<LoadingSpinner />);
    expect(container.querySelector('.loading-container-fullpage')).toBeInTheDocument();
  });

  it('omits fullPage class when fullPage is false', () => {
    const { container } = render(<LoadingSpinner fullPage={false} />);
    expect(container.querySelector('.loading-container-fullpage')).toBeNull();
  });
});
