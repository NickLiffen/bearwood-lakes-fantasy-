import { render, screen, fireEvent } from '@testing-library/react';
import { Input } from './Input';

describe('Input', () => {
  it('renders input element', () => {
    render(<Input name="email" value="" onChange={vi.fn()} />);
    expect(screen.getByRole('textbox')).toBeInTheDocument();
  });

  it('displays value', () => {
    render(<Input name="email" value="test@test.com" onChange={vi.fn()} />);
    expect(screen.getByRole('textbox')).toHaveValue('test@test.com');
  });

  it('calls onChange', () => {
    const onChange = vi.fn();
    render(<Input name="email" value="" onChange={onChange} />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'a' } });
    expect(onChange).toHaveBeenCalled();
  });

  it('can be disabled', () => {
    render(<Input name="email" value="" onChange={vi.fn()} disabled />);
    expect(screen.getByRole('textbox')).toBeDisabled();
  });

  it('displays error message', () => {
    render(<Input name="email" value="" onChange={vi.fn()} error="Required" />);
    expect(screen.getByText('Required')).toBeInTheDocument();
  });
});
