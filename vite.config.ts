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
  plugins: [
    react(),
    mode === 'development' && componentTagger(),
    VitePWA({
      registerType: 'autoUpdate', // Update automatically
      strategy: 'generateSW', 
      injectRegister: 'auto', // Inject registration script
      devOptions: {
        enabled: true,
        navigateFallback: 'index.html',
        suppressWarnings: true,
        type: 'module',
      },
      workbox: {
        importScripts: ['/push-sw.js'],
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,
        maximumFileSizeToCacheInBytes: 10000000,
        navigateFallback: 'index.html',
        globPatterns: [
          '**/*.{css,html,ico,png,svg,webp,woff,woff2,ttf,eot}'
        ],
        runtimeCaching: [
          // 0. JS Files (Runtime Cache instead of Precache for faster SW activation)
          {
            urlPattern: ({ request }) => request.destination === 'script' || request.url.endsWith('.js'),
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'js-cache',
              expiration: {
                maxEntries: 50,
                maxAgeSeconds: 60 * 60 * 24 * 30, // 30 dias
              },
            },
          },
          // 1. Google Fonts
          {
            urlPattern: /^https:\/\/fonts\.(?:googleapis|gstatic)\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-cache',
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 365, // 1 ano
              },
            },
          },
          // 2. Imagens
          {
            urlPattern: /\.(?:png|jpg|jpeg|svg|gif|webp)$/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'images-cache',
              expiration: {
                maxEntries: 50,
                maxAgeSeconds: 60 * 60 * 24 * 30, // 30 dias
              },
            },
          },
          // 3. Supabase Storage (Imagens de perfil, anexos)
          {
            urlPattern: /^https:\/\/.*\.supabase\.co\/storage\/v1\/object\/public\/.*/i,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'supabase-storage-cache',
              expiration: {
                maxEntries: 100,
                maxAgeSeconds: 60 * 60 * 24 * 7, // 1 semana
              },
            },
          },
          // 4. Supabase API (Dados)
          // NetworkFirst garante dados frescos se online, e cache se offline
          {
            urlPattern: /^https:\/\/.*\.supabase\.co\/rest\/v1\/.*/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'supabase-api-cache',
              networkTimeoutSeconds: 5, // Espera 5s pela rede
              expiration: {
                maxEntries: 200,
                maxAgeSeconds: 60 * 60 * 24 * 2, // 2 dias
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
        ],
      },
      includeAssets: [
        'favicon.png', 
        'robots.txt', 
        'logo.svg',
        'pwa-icon-192.png',
        'pwa-icon-512.png'
      ],
      manifest: {
        id: '/',
        name: 'PlaniFlow - Gestão Financeira',
        short_name: 'PlaniFlow',
        description: 'Aplicativo completo para gestão financeira pessoal com funcionalidade offline',
        theme_color: '#176EB5',
        background_color: '#176EB5',
        display: 'standalone',
        start_url: '/',
        scope: '/',
        lang: 'pt-BR',
        dir: 'ltr',
        orientation: 'portrait-primary',
        prefer_related_applications: false,
        icons: [
          {
            src: '/pwa-icon-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/pwa-icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/pwa-icon-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'maskable',
          },
          {
            src: '/pwa-icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
          {
            src: '/logo.svg',
            sizes: '512x512',
            type: 'image/svg+xml',
            purpose: 'any maskable',
          }
        ],
        categories: ['finance', 'productivity', 'utilities'],
      },
    })
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));