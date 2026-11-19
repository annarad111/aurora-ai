import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Vite compiles our .scss files automatically because the `sass` package is installed.
//
// During development the React app runs on :5173 (with hot reload) and the
// Worker on :8787 (`npm run dev` starts both). API calls are forwarded to the
// Worker, so the browser sees a single origin, exactly like in production.
// AURORA_API_ORIGIN points the proxy at a Worker on another port (default :8787).
const apiOrigin = process.env.AURORA_API_ORIGIN ?? 'http://127.0.0.1:8787';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': apiOrigin,
      '/mcp': apiOrigin,
    },
  },
});
