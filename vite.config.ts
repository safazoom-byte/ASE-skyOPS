import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import process from "node:process";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "VITE_");

  // Robust collection of variables from Vercel/Local env
  const supabaseUrl = env.VITE_SUPABASE_URL || "";
  const supabaseAnonKey = env.VITE_SUPABASE_ANON_KEY || "";

  return {
    plugins: [react()],
    define: {
      "process.env.SUPABASE_URL": JSON.stringify(supabaseUrl),
      "process.env.SUPABASE_ANON_KEY": JSON.stringify(supabaseAnonKey),
    },
    build: {
      target: "esnext",
      outDir: "dist",
      sourcemap: false,
      rollupOptions: {
        output: {
          manualChunks: {
            xlsx: ['xlsx'],
            exceljs: ['exceljs'],
            pdf: ['jspdf', 'jspdf-autotable'],
            icons: ['lucide-react']
          }
        }
      }
    },
    server: {
      port: 3000,
      host: true,
    },
  };
});
