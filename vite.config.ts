
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, (process as any).cwd(), '');
  
  // Robust check for different potential environment variable names
  const apiKey = env.GOOGLE_API_KEY || env.API_KEY || process.env.GOOGLE_API_KEY || process.env.API_KEY || '';

  return {
    plugins: [react()],
    define: {
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
