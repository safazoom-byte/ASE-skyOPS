import React, { Component, ReactNode } from "react";

interface Props {
  children?: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-[2000] p-4 bg-red-100 text-red-600 rounded">
          <h2>Sorry.. there was an error rendering Flight Modal</h2>
          <pre className="text-xs">{this.state.error?.message}</pre>
        </div>
      );
    }

    return this.props.children;
  }
}
