import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  /** Rendered instead of the children after an exception; `reset` mounts the children again. */
  fallback: (reset: () => void) => ReactNode;
  /** A change of this value (e.g. the section id) also clears a previous failure. */
  resetKey?: string;
  children: ReactNode;
}

/**
 * Contains an exception thrown while rendering a part of the UI (a Settings section, a nav summary) so it
 * cannot unmount the whole shell: the tab strip and the rest of the page keep working.
 */
export class ErrorBoundary extends Component<Props, { failed: boolean }> {
  override state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('ui section crashed', error, info.componentStack);
  }

  override componentDidUpdate(prev: Props) {
    if (this.state.failed && prev.resetKey !== this.props.resetKey) this.setState({ failed: false });
  }

  reset = () => this.setState({ failed: false });

  override render() {
    return this.state.failed ? this.props.fallback(this.reset) : this.props.children;
  }
}
