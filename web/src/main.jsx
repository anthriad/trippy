/**
 * main.jsx — browser entry point for the React app.
 *
 * createRoot(...).render(...) mounts <App /> into public/index.html's <div id="root">.
 * StrictMode helps catch common mistakes in development (double-invokes some effects on purpose).
 */

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import "./index.css";

// document.getElementById("root") finds the mount node from index.html.
createRoot(document.getElementById("root")).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
