import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { createStore } from '../state/store';
import { ErrorBoundary } from './ErrorBoundary';

function Boom(): never {
  throw new Error('boom');
}

describe('error containment', () => {
  it('renders the fallback instead of unmounting its siblings', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    render(
      <>
        <p>tabs</p>
        <ErrorBoundary fallback={() => <p>recover</p>}>
          <Boom />
        </ErrorBoundary>
      </>,
    );
    expect(screen.getByText('tabs')).toBeTruthy();
    expect(screen.getByText('recover')).toBeTruthy();
  });

  it('a throwing store listener does not starve the later ones', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const store = createStore({ n: 0 });
    const seen = vi.fn();
    store.subscribe(() => {
      throw new Error('bad subscriber');
    });
    store.subscribe(seen);
    store.set({ n: 1 });
    expect(seen).toHaveBeenCalledTimes(1);
  });
});
