import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "path";

// Three separate apps, one shared backend (FastAPI on :8000).
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      input: {
        dispatch: resolve(__dirname, "dispatch.html"),
        elite: resolve(__dirname, "elite.html"),
        driver: resolve(__dirname, "driver.html"),
        book: resolve(__dirname, "book.html"),      // audience phones at the hackathon (QR on the dispatcher)
      },
    },
  },
  server: { proxy: { "/api": "http://127.0.0.1:8000", "/ws": { target: "ws://127.0.0.1:8000", ws: true } } },
});
