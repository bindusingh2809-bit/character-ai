import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true, // bind 0.0.0.0 so Codespaces port forwarding can reach it
    // The proxy itself talks server-to-server inside the same container,
    // so "localhost:8000" is correct here even though the browser reaches
    // the frontend via a forwarded *.app.github.dev URL.
    proxy: {
      "/api": "http://localhost:8000",
      "/media": "http://localhost:8000",
    },
  },
});
