import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { VitePWA } from 'vite-plugin-pwa';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
  },
  build: {
    // Enable code splitting for better caching
    rollupOptions: {
      output: {
        manualChunks: {
          // Vendor libraries
          'react-vendor': ['react', 'react-dom'],
          'query-vendor': ['@tanstack/react-query'],
          'ui-vendor': ['@radix-ui/react-dialog', '@radix-ui/react-dropdown-menu', '@radix-ui/react-select'],
          'supabase-vendor': ['@supabase/supabase-js'],
          
          // Heavy components
          'analytics-chunk': ['recharts'],
          'excel-chunk': ['xlsx'],
          'pdf-chunk': ['jspdf', 'html-to-image'],
          'date-chunk': ['date-fns'],
          
          // App chunks
          'components-chunk': [
            './src/components/AnalyticsPage.tsx',
            './src/components/FixedTransactionsPage.tsx',
            './src/components/TransactionsPage.tsx'
          ],
          'import-chunk': [
            './src/components/ImportTransactionsModal.tsx',
            './src/components/ImportAccountsModal.tsx',
            './src/components/ImportCategoriesModal.tsx'
          ]
        },
        // Optimize chunk size
        chunkFileNames: (chunkInfo) => {
          if (chunkInfo.name?.includes('vendor')) {
            return 'assets/vendor/[name]-[hash].js';
          }
          return 'assets/chunks/[name]-[hash].js';
        },
      },
    },
    // Optimize build performance
    target: 'esnext',
    minify: 'esbuild',
    sourcemap: mode === 'development',
    // Increase chunk size warning limit
    chunkSizeWarningLimit: 1000,
  },
  // Enable tree shaking
  optimizeDeps: {
    include: [
      'react',
      'react-dom',
      '@tanstack/react-query',
      'es-toolkit/compat/get'
    ],
    exclude: [
      'xlsx',
      'jspdf',
      'html-to-image'
    ]
  },
  // Fix ESM compatibility issues
  ssr: {
    noExternal: ['recharts', 'es-toolkit']
  },
  define: {
    // Remove unused environment variables
    'process.env.NODE_ENV': JSON.stringify(mode),
    'global': 'globalThis',
  },
  plugins: [
    react(),
    componentTagger(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'mask-icon.svg'],
      manifest: {
        name: 'Financial Planner',
        short_name: 'FinPlan',
        description: 'Personal Financial Management PWA',
        theme_color: '#ffffff',
        background_color: '#ffffff',
        display: 'standalone',
        scope: '/',
        start_url: '/',
        orientation: 'portrait',
        icons: [
          {
            src: 'pwa-64x64.png',
            sizes: '64x64',
            type: 'image/png'
          },
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any'
          },
          {
            src: 'maskable-icon-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable'
          }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        maximumFileSizeToCacheInBytes: 10 * 1024 * 1024, // 10MB
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/api\./,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api-cache',
              expiration: {
                maxEntries: 100,
                maxAgeSeconds: 60 * 60 // 1 hour
              }
            }
          },
          {
            urlPattern: /\.(?:png|jpg|jpeg|svg|gif|webp)$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'image-cache',
              expiration: {
                maxEntries: 200,
                maxAgeSeconds: 60 * 60 * 24 * 30 // 30 days
              }
            }
          }
        ]
      }
    })
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  // Performance optimizations
  esbuild: {
    drop: mode === 'production' ? ['console', 'debugger'] : [],
    minifyIdentifiers: mode === 'production',
    minifySyntax: mode === 'production',
    minifyWhitespace: mode === 'production',
  }
}));