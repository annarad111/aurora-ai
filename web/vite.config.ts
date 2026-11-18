import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Vite compiles our .scss files automatically because the `sass` package is installed.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
  },
});
