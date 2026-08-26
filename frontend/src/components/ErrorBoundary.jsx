import React from 'react';

export class ErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null, errorInfo: null };
    }

    static getDerivedStateFromError(error) {
        return { hasError: true, error };
    }

    componentDidCatch(error, errorInfo) {
        console.error("ErrorBoundary caught an unhandled error:", error, errorInfo);
        this.setState({ errorInfo });
    }

    handleReload = () => {
        window.location.reload();
    };

    render() {
        if (this.state.hasError) {
            return (
                <div style={{
                    minHeight: '100vh',
                    backgroundColor: '#0a0d14',
                    color: '#f8fafc',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '24px',
                    fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, sans-serif',
                }}>
                    <div style={{
                        maxWidth: '520px',
                        width: '100%',
                        backgroundColor: '#111827',
                        border: '1px solid #ef4444',
                        borderRadius: '12px',
                        padding: '32px',
                        textAlign: 'center',
                        boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5)',
                    }}>
                        <div style={{
                            fontSize: '48px',
                            marginBottom: '16px',
                        }}>
                            ⚙️
                        </div>
                        <h2 style={{
                            fontSize: '20px',
                            fontWeight: '700',
                            color: '#f87171',
                            marginBottom: '12px',
                        }}>
                            Application Error Occurred
                        </h2>
                        <p style={{
                            fontSize: '14px',
                            color: '#94a3b8',
                            lineHeight: '1.6',
                            marginBottom: '24px',
                        }}>
                            A component encountered an unexpected error. Your data in the workshop database is safe.
                        </p>
                        {this.state.error && (
                            <div style={{
                                backgroundColor: 'rgba(239, 68, 68, 0.1)',
                                border: '1px solid rgba(239, 68, 68, 0.3)',
                                borderRadius: '6px',
                                padding: '12px',
                                fontSize: '12px',
                                color: '#fca5a5',
                                fontFamily: "'JetBrains Mono', monospace",
                                textAlign: 'left',
                                marginBottom: '24px',
                                wordBreak: 'break-word',
                            }}>
                                {this.state.error.toString()}
                            </div>
                        )}
                        <button
                            onClick={this.handleReload}
                            style={{
                                backgroundColor: '#3b82f6',
                                color: '#ffffff',
                                border: 'none',
                                padding: '10px 24px',
                                borderRadius: '8px',
                                fontWeight: '600',
                                fontSize: '14px',
                                cursor: 'pointer',
                                transition: 'all 0.2s ease',
                            }}
                            onMouseOver={(e) => (e.currentTarget.style.backgroundColor = '#2563eb')}
                            onMouseOut={(e) => (e.currentTarget.style.backgroundColor = '#3b82f6')}
                        >
                            Reload Application
                        </button>
                    </div>
                </div>
            );
        }

        return this.props.children;
    }
}

export default ErrorBoundary;
