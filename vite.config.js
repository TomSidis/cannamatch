import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// בזמן פיתוח, קריאות ל-/api מועברות לשרת ה-proxy המקומי (api/server.js)
// כדי שמפתח ה-API לעולם לא ייחשף בצד הלקוח.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:8787",
        changeOrigin: true,
      },
    },
  },
});
