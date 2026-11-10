import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Frontend proxies /api → XAMPP Apache folder (htdocs/mems-backend)
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/api": {
        target: "http://127.0.0.1",
        changeOrigin: true,
        rewrite: (path) => `/mems-backend${path}`,
      },
    },
  },
});
