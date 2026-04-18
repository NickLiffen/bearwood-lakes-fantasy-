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

  it('renders an action button when action prop is provided', () => {
    render(
      <Toast
        message="Captain set"
        onClose={vi.fn()}
        action={{ label: 'Undo', onClick: vi.fn() }}
      />
    );
    expect(screen.getByRole('button', { name: 'Undo' })).toBeInTheDocument();
  });

  it('invokes action.onClick and closes when action button is clicked', () => {
    const onClose = vi.fn();
    const onAction = vi.fn();
    render(
      <Toast message="Captain set" onClose={onClose} action={{ label: 'Undo', onClick: onAction }} />
    );
    act(() => {
      screen.getByRole('button', { name: 'Undo' }).click();
    });
    expect(onAction).toHaveBeenCalledTimes(1);
    // Close fires after fade-out
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does not call onClose twice when action is clicked then the auto-dismiss timer fires', () => {
    // Regression guard: previously the auto-dismiss timer was not cancelled
    // when the action button triggered a close, which could schedule a second
    // onClose.
    const onClose = vi.fn();
    const onAction = vi.fn();
    render(
      <Toast
        message="Captain set"
        duration={1000}
        onClose={onClose}
        action={{ label: 'Undo', onClick: onAction }}
      />
    );
    // Click Undo before the auto-dismiss fires
    act(() => {
      vi.advanceTimersByTime(500);
      screen.getByRole('button', { name: 'Undo' }).click();
      // Fade-out animation
      vi.advanceTimersByTime(300);
    });
    // Now let the original auto-dismiss timer elapse
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
