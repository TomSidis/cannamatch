import React from "react";
import ReactDOM from "react-dom/client";
import CannaMatch from "./CannaMatch.jsx";
import ErrorBoundary from "./components/ErrorBoundary.jsx";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ErrorBoundary>
      <CannaMatch />
    </ErrorBoundary>
  </React.StrictMode>
);

// PWA: register the service worker in production only (needs HTTPS or localhost).
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  });
}
