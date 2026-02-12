import { useEffect, useState } from "react";
import "./App.css";
import TrackrDashboard from "./trackr-dashboard.jsx";
import { installTrackrHttpBridge, pollBackendHealthOnce } from "./trackr-http-core";

function App() {
  const [backendConnected, setBackendConnected] = useState(false);

  useEffect(() => {
    const bridge = installTrackrHttpBridge();
    void bridge;

    let cancelled = false;
    const runPoll = async () => {
      const connected = await pollBackendHealthOnce();
      if (!cancelled) setBackendConnected(connected);
    };

    void runPoll();
    const timer = setInterval(() => {
      void runPoll();
    }, 2000);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  return (
    <>
      <TrackrDashboard />
      <div className="backend-status" aria-live="polite">
        <span className={`backend-dot ${backendConnected ? "ok" : "down"}`} />
        <span>Backend: {backendConnected ? "Connected" : "Disconnected"}</span>
      </div>
    </>
  );
}

export default App;
