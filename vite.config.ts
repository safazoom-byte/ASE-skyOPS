
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
// Fix: Imported process from node:process to resolve "Property 'cwd' does not exist on type 'Process'" error
import process from 'node:process';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  
  // Prioritize environment variables from the shell/env file
  const apiKey = env.API_KEY || process.env.API_KEY || '';

  return {
    plugins: [react()],
    define: {
      // Ensure the API key is stringified for replacement in the code
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
