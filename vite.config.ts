import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  // Load env file based on `mode` in the current working directory.
  // Set the third parameter to '' to load all env vars.
  const env = loadEnv(mode, (process as any).cwd(), '');
  
  // Prioritize the API_KEY from the environment
  const apiKey = env.API_KEY || process.env.API_KEY || '';

  return {
    plugins: [react()],
    define: {
      // This strictly replaces 'process.env.API_KEY' in your source code with the string value
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