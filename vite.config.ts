
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  // Load env file based on `mode` in the current working directory.
  // Set the third parameter to '' to load all env vars regardless of prefix.
  const env = loadEnv(mode, (process as any).cwd(), '');
  
  // Look for both GOOGLE_API_KEY (from your screenshot) and API_KEY
  const apiKey = env.GOOGLE_API_KEY || env.API_KEY || process.env.GOOGLE_API_KEY || process.env.API_KEY || '';

  return {
    plugins: [react()],
    define: {
      // This forces Vite to replace 'process.env.API_KEY' with the actual key string during build
      'process.env.API_KEY': JSON.stringify(apiKey)
    },
    build: {
      target: 'esnext',
      outDir: 'dist'
    },
    server: {
      port: 3000
    }
  };
});
