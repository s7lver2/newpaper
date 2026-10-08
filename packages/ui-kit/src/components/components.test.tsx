import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { Button } from './Button';
import { IconButton } from './IconButton';
import { SegmentedControl } from './SegmentedControl';
import { Switch } from './Switch';
import { Tabs } from './Tabs';

describe('Button and IconButton', () => {
  it('renders real buttons with type=button', () => {
    render(<Button variant="primary">Go</Button>);
    const b = screen.getByRole('button', { name: 'Go' });
    expect(b).toHaveAttribute('type', 'button');
    expect(b).toHaveClass('np-btn', 'np-btn--primary');
  });
  it('labels icon buttons and exposes pressed state', () => {
    render(<IconButton label="Shield" icon={<svg />} pressed />);
    const b = screen.getByRole('button', { name: 'Shield' });
    expect(b).toHaveAttribute('aria-pressed', 'true');
    expect(b).toHaveAttribute('title', 'Shield');
  });
});

describe('Switch', () => {
  it('toggles with click and keyboard', async () => {
    const onChange = vi.fn();
    render(<Switch checked={false} onChange={onChange} label="Tor" description="Route via Tor" />);
    const sw = screen.getByRole('switch', { name: 'Tor' });
    expect(sw).toHaveAttribute('aria-checked', 'false');
    expect(sw).toHaveAccessibleDescription('Route via Tor');
    await userEvent.click(sw);
    sw.focus();
    await userEvent.keyboard(' ');
    expect(onChange).toHaveBeenNthCalledWith(1, true);
    expect(onChange).toHaveBeenNthCalledWith(2, true);
  });
});

describe('SegmentedControl', () => {
  it('moves selection with arrow keys', async () => {
    function Host() {
      const [v, setV] = useState<'a' | 'b' | 'c'>('a');
      return (
        <SegmentedControl
          label="Mode"
          value={v}
          onChange={setV}
          options={[
            { value: 'a', label: 'A' },
            { value: 'b', label: 'B' },
            { value: 'c', label: 'C' },
          ]}
        />
      );
    }
    render(<Host />);
    const a = screen.getByRole('radio', { name: 'A' });
    expect(a).toHaveAttribute('aria-checked', 'true');
    a.focus();
    await userEvent.keyboard('{ArrowRight}');
    expect(screen.getByRole('radio', { name: 'B' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('radio', { name: 'B' })).toHaveFocus();
    await userEvent.keyboard('{ArrowLeft}{ArrowLeft}');
    expect(screen.getByRole('radio', { name: 'C' })).toHaveAttribute('aria-checked', 'true');
  });
});

describe('Tabs', () => {
  it('implements the WAI-ARIA tabs pattern', async () => {
    function Host() {
      const [t, setT] = useState<'x' | 'y'>('x');
      return <Tabs label="Panel" idPrefix="p" tabs={[{ id: 'x', label: 'X' }, { id: 'y', label: 'Y', badge: '3' }]} active={t} onChange={setT} />;
    }
    render(<Host />);
    const x = screen.getByRole('tab', { name: 'X' });
    expect(x).toHaveAttribute('aria-selected', 'true');
    expect(x).toHaveAttribute('aria-controls', 'p-panel-x');
    expect(screen.getByRole('tab', { name: /Y/ })).toHaveAttribute('tabindex', '-1');
    x.focus();
    await userEvent.keyboard('{End}');
    expect(screen.getByRole('tab', { name: /Y/ })).toHaveAttribute('aria-selected', 'true');
    await userEvent.keyboard('{Home}');
    expect(x).toHaveFocus();
  });
});