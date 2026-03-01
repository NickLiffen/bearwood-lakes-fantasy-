import { render, screen, act } from '@testing-library/react';
import Toast from './Toast';

describe('Toast', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders message', () => {
    render(<Toast message="Success!" onClose={vi.fn()} />);
    expect(screen.getByText('Success!')).toBeInTheDocument();
  });

  it('has role="alert"', () => {
    render(<Toast message="Alert!" onClose={vi.fn()} />);
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('applies type class', () => {
    render(<Toast message="Error" type="error" onClose={vi.fn()} />);
    expect(screen.getByRole('alert')).toHaveClass('toast-error');
  });

  it('defaults to success type', () => {
    render(<Toast message="Done" onClose={vi.fn()} />);
    expect(screen.getByRole('alert')).toHaveClass('toast-success');
  });

  it('auto-dismisses after duration', () => {
    const onClose = vi.fn();
    render(<Toast message="Bye" duration={1000} onClose={onClose} />);

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    // Wait for fade-out animation (300ms)
    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
