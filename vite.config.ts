
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import process from 'node:process';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  
  // Robust collection of variables from Vercel/Local env
  const apiKey = env.API_KEY || env.VITE_API_KEY || '';
  const supabaseUrl = env.SUPABASE_URL || env.VITE_SUPABASE_URL || '';
  const supabaseAnonKey = env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY || '';

  return {
    plugins: [react()],
    define: {
      'process.env.API_KEY': JSON.stringify(apiKey || ''),
      'process.env.SUPABASE_URL': JSON.stringify(supabaseUrl || ''),
      'process.env.SUPABASE_ANON_KEY': JSON.stringify(supabaseAnonKey || '')
    },
    build: {
      target: 'esnext',
      outDir: 'dist',
      sourcemap: false,
      minify: 'terser',
      // Force new filenames every build to prevent Vercel caching old JS
      rollupOptions: {
        output: {
          entryFileNames: `assets/[name].[hash]-${Date.now()}.js`,
          chunkFileNames: `assets/[name].[hash]-${Date.now()}.js`,
          assetFileNames: `assets/[name].[hash]-${Date.now()}.[ext]`,
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