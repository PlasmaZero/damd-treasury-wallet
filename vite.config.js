import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
// BASE_PATH is set by the GitHub Pages workflow, which serves the site under /<repo>/.
export default defineConfig({base:process.env.BASE_PATH??'/',plugins:[react()],build:{rollupOptions:{output:{manualChunks:{react:['react','react-dom'],ethers:['ethers']}}}},server:{port:5173,strictPort:true},preview:{port:4173}});
