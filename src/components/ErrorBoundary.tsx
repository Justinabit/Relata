import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  /** Shown instead of the app. Defaults to a minimal recovery screen. */
  fallback?: (reset: () => void) => ReactNode;
}

/**
 * Last line of defence: without this, one render error (for example from a corrupted saved
 * record) unmounts the whole tree and leaves a blank page.
 */
export class ErrorBoundary extends Component<Props, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Console only: Relata has no analytics or remote error reporting.
    console.error('[ui]', error.message, info.componentStack);
  }

  reset = () => this.setState({ failed: false });

  render() {
    if (!this.state.failed) return this.props.children;
    if (this.props.fallback) return this.props.fallback(this.reset);
    return (
      <div className="page page--narrow" role="alert">
        <h1>Something went wrong</h1>
        <p className="muted">This page hit an unexpected error. Your saved research is stored in this browser and has not been deleted.</p>
        <p className="row">
          <button type="button" className="btn btn--primary" onClick={this.reset}>Try again</button>
          <a className="btn" href="/app">Back to Search</a>
        </p>
      </div>
    );
  }
}
