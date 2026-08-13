import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // Only used for local dev if you run the API separately
      // (e.g. `vercel dev`, `netlify dev`, or `wrangler pages dev`).
      "/api": "http://localhost:3000",
    },
  },
});
