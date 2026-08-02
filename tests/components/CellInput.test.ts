import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import CellInput from '../../src/components/CellInput.svelte';

function setup(delivered: number, required: number) {
  const onChange = vi.fn();
  render(CellInput, { props: { delivered, required, label: 'Beaver Pelt — Satchels', onChange } });
  return { onChange };
}

describe('CellInput', () => {
  it('renders the delivered value and the required amount', () => {
    setup(2, 5);
    const input = screen.getByLabelText(
      'Beaver Pelt — Satchels delivered, 5 required'
    ) as HTMLInputElement;
    expect(input.value).toBe('2');
    expect(screen.getByText('/ 5')).toBeInTheDocument();
  });

  it('increments via the + button', async () => {
    const { onChange } = setup(2, 5);
    await fireEvent.click(screen.getByLabelText('Increase Beaver Pelt — Satchels delivered'));
    expect(onChange).toHaveBeenCalledWith(3);
  });

  it('decrements via the − button', async () => {
    const { onChange } = setup(2, 5);
    await fireEvent.click(screen.getByLabelText('Decrease Beaver Pelt — Satchels delivered'));
    expect(onChange).toHaveBeenCalledWith(1);
  });

  it('disables decrement at zero', () => {
    setup(0, 5);
    expect(screen.getByLabelText('Decrease Beaver Pelt — Satchels delivered')).toBeDisabled();
  });

  it('parses typed input and clamps blanks to zero', async () => {
    const { onChange } = setup(2, 5);
    const input = screen.getByLabelText('Beaver Pelt — Satchels delivered, 5 required');
    await fireEvent.input(input, { target: { value: '4' } });
    expect(onChange).toHaveBeenCalledWith(4);
    await fireEvent.input(input, { target: { value: '' } });
    expect(onChange).toHaveBeenLastCalledWith(0);
  });

  it('shows the complete state when delivered meets required', () => {
    setup(5, 5);
    expect(screen.getByText('✓')).toBeInTheDocument();
  });

  it('does not show the complete check while incomplete', () => {
    setup(1, 5);
    expect(screen.queryByText('✓')).not.toBeInTheDocument();
  });
});
