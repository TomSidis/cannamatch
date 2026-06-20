import { Component } from "react";

class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error("CannaMatch ErrorBoundary caught:", error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div dir="rtl" className="min-h-screen flex items-center justify-center bg-[#F3F6F2] px-5">
          <div className="w-full max-w-sm rounded-3xl bg-white border border-[#DCE5DC] shadow-xl p-7 text-center">
            <div className="text-4xl mb-3">⚠️</div>
            <h2 className="text-xl font-bold text-[#16302B] mb-2">משהו השתבש</h2>
            <p className="text-sm text-[#6B7280] mb-5 leading-relaxed">
              לא הצלחנו לטעון את הנתונים מהשרת. בדקו את החיבור לאינטרנט ונסו שוב.
            </p>
            <pre className="text-xs text-[#9CA3AF] bg-[#F3F6F2] rounded-xl p-3 mb-5 text-left overflow-x-auto">
              {String(this.state.error?.message || this.state.error)}
            </pre>
            <button
              onClick={() => this.setState({ error: null })}
              className="w-full rounded-2xl py-3 font-bold text-white"
              style={{ background: "#2E6B53" }}
            >
              נסו שוב
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default ErrorBoundary;
