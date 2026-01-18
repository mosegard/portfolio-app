import React from 'react';

class ErrorBoundary extends React.Component {
    constructor(props) { super(props); this.state = { hasError: false, error: null }; }
    static getDerivedStateFromError(error) { return { hasError: true, error }; }
    render() {
        if (this.state.hasError) {
            return (
                <div className="p-6 text-red-900 bg-red-50 h-screen flex flex-col items-center justify-center">
                    <h1 className="text-2xl font-bold mb-2">App Crashed</h1>
                    <div className="bg-white p-4 border border-red-200 rounded text-xs font-mono mb-4 w-full overflow-auto">
                        {this.state.error && this.state.error.toString()}
                    </div>
                    <button onClick={() => { localStorage.clear(); window.location.reload(); }} className="px-6 py-3 bg-red-600 text-white rounded-lg font-bold shadow">
                        Reset App & Clear Cache
                    </button>
                </div>
            );
        }
        return this.props.children;
    }
}
export default ErrorBoundary;