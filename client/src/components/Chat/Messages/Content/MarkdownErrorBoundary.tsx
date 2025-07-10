import React from 'react';

interface ErrorBoundaryState {
  hasError: boolean;
  error?: Error;
}

interface MarkdownErrorBoundaryProps {
  children: React.ReactNode;
  content: string;
}

class MarkdownErrorBoundary extends React.Component<
  MarkdownErrorBoundaryProps,
  ErrorBoundaryState
> {
  constructor(props: MarkdownErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('Markdown rendering error:', error, errorInfo);
  }

  componentDidUpdate(prevProps: MarkdownErrorBoundaryProps) {
    if (prevProps.content !== this.props.content && this.state.hasError) {
      this.setState({ hasError: false, error: undefined });
    }
  }

  render() {
    if (this.state.hasError) {
      return <p className="mb-2 whitespace-pre-wrap">{this.props.content}</p>;
    }

    return this.props.children;
  }
}

export default MarkdownErrorBoundary;
