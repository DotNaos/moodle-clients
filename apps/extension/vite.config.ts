import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { crx } from '@crxjs/vite-plugin'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import manifest from './src/manifest'

const srcPath = fileURLToPath(new URL('./src', import.meta.url))
const isDevPreview = process.env.DEV_MODE === 'preview'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    // Only include CRXJS when building the actual extension
    ...(!isDevPreview ? [crx({ manifest })] : []),
  ],
  resolve: {
    alias: {
      '@': path.resolve(srcPath),
    },
  },
  // In dev preview mode, use the dev shell as the HTML entry
  ...(isDevPreview
    ? {
        root: path.resolve(srcPath, 'dev'),
        publicDir: path.resolve(srcPath, '..', 'public'),
      }
    : {}),
})
