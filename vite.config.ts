
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import process from 'node:process';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  
  const apiKey = env.API_KEY || env.VITE_API_KEY || '';
  const supabaseUrl = env.SUPABASE_URL || env.VITE_SUPABASE_URL || '';
  const supabaseAnonKey = env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY || '';

  return {
    plugins: [react()],
    define: {
      'process.env.API_KEY': JSON.stringify(apiKey),
      'process.env.SUPABASE_URL': JSON.stringify(supabaseUrl),
      'process.env.SUPABASE_ANON_KEY': JSON.stringify(supabaseAnonKey)
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
        // Mark these as external because they are loaded via importmap in index.html
        external: [
          'react',
          'react-dom',
          'react-dom/client',
          'lucide-react',
          '@google/genai',
          '@supabase/supabase-js',
          'xlsx',
          'jspdf',
          'jspdf-autotable'
        ],
        output: {
          // Ensure the output remains clean without trying to chunk external libs
          manualChunks: undefined 
        }
      }
    },
    server: {
      port: 3000,
      host: true
    }
  };
});
