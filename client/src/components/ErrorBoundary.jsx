import React from 'react';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('[ErrorBoundary]', error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex flex-col items-center justify-center py-20 text-on-surface-variant gap-4">
          <span className="material-symbols-outlined text-5xl text-error">error</span>
          <p className="text-body-lg font-light">Something went wrong rendering this page.</p>
          <pre className="text-label-sm bg-error-container text-error rounded-xl px-4 py-3 max-w-lg overflow-auto whitespace-pre-wrap">
            {this.state.error.message}
          </pre>
          <button
            onClick={() => this.setState({ error: null })}
            className="px-5 py-2 rounded-full bg-primary text-on-primary text-label-md font-bold hover:bg-primary/90 transition"
          >
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
