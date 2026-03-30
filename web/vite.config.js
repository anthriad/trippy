import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

/**
 * Vite config — dev server + React.
 *
 * proxy: While you run `npm run dev` here, the browser talks to port 5173 (Vite).
 * Requests to /api/* are forwarded to your Express backend so you can write:
 *   fetch("/api/chat", ...)
 * and avoid CORS headaches during development.
 *
 * If your API uses a different port (see backend/.env PORT), change `target` below to match.
 */
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/api": {
        target: "http://localhost:3000",
        changeOrigin: true,
      },
    },
  },
});
