
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import process from 'node:process';

export default defineConfig(({ mode }) => {
  // Load environment variables from the system (Vercel) or .env file
  const env = loadEnv(mode, process.cwd(), '');
  
  // Vercel provides the API_KEY in the environment.
  // We prioritize the system environment variable for security.
  const apiKey = env.API_KEY || env.VITE_API_KEY || '';

  return {
    plugins: [react()],
    define: {
      // This makes process.env.API_KEY available in your code
      'process.env.API_KEY': JSON.stringify(apiKey)
    },
    build: {
      target: 'esnext',
      outDir: 'dist',
      sourcemap: false,
      minify: 'terser',
      terserOptions: {
        compress: {
          drop_console: false,
          drop_debugger: true
        }
      },
      rollupOptions: {
        output: {
          manualChunks: {
            'vendor-react': ['react', 'react-dom'],
            'vendor-utils': ['xlsx', 'jspdf', 'jspdf-autotable', 'lucide-react']
          }
        }
      }
    },
    server: {
      port: 3000,
      host: true
    }
  };
});
