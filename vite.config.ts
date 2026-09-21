import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { "@": path.resolve(import.meta.dirname, "./src") },
  },
  worker: { format: "es" },
  optimizeDeps: {
    // web-llm ships its own worker + wasm; let Vite handle it lazily.
    exclude: ["@mlc-ai/web-llm"],
  },
  build: {
    chunkSizeWarningLimit: 1500,
  },
  server: { port: 5173 },
});
