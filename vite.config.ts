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
      registerType: 'autoUpdate',
      strategy: 'injectManifest',
      srcDir: 'public',
      filename: 'sw.js',
      injectManifest: {
        swSrc: 'public/sw.js',
        swDest: 'dist/sw.js',
        globDirectory: 'dist',
        // Cacheia arquivos estáticos essenciais (HTML, CSS, JS, Imagens, Fontes)
        globPatterns: ['**/*.{js,css,html,ico,png,svg,json,woff,woff2,ttf}'],
      },
      includeAssets: [
        'favicon.png', 
        'robots.txt', 
        'pwa-icon-192-v2.png', 
        'pwa-icon-512-v2.png'
      ],
      manifest: {
        name: 'PlaniFlow - Gestão Financeira',
        short_name: 'PlaniFlow',
        description: 'Aplicativo completo para gestão financeira pessoal com funcionalidade offline',
        theme_color: '#1469B6',
        background_color: '#F7F9FB', // Coincide com o --background do CSS
        display: 'standalone',
        start_url: '/',
        scope: '/',
        orientation: 'portrait-primary',
        icons: [
          {
            src: '/pwa-icon-192-v2.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any maskable',
          },
          {
            src: '/pwa-icon-512-v2.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable',
          },
        ],
        categories: ['finance', 'productivity', 'utilities'],
        screenshots: [],
        shortcuts: [
          {
            name: 'Nova Transação',
            short_name: 'Nova',
            description: 'Adicionar nova transação',
            url: '/?action=new-transaction',
            icons: [
              {
                src: '/pwa-icon-192-v2.png',
                sizes: '192x192',
                type: 'image/png',
              },
            ],
          },
        ],
      },
      workbox: {
        // Opções críticas para funcionamento offline robusto
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2}'],
        runtimeCaching: [
          // 1. Cache de Fontes (Google Fonts) - Estratégia CacheFirst (Prioriza Cache)
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
          // 2. Cache de Imagens Gerais - CacheFirst
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
          // 3. Supabase Storage (Anexos, Avatars) - StaleWhileRevalidate (Usa cache, atualiza em background)
          {
            urlPattern: /^https:\/\/.*\.supabase\.co\/storage\/v1\/object\/public\/.*/i,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'supabase-storage-cache',
              expiration: {
                maxEntries: 50,
                maxAgeSeconds: 60 * 60 * 24 * 7, // 1 semana
              },
            },
          },
          // 4. Supabase API (Leitura de Dados) - NetworkFirst (Tenta rede, se falhar usa cache)
          // Isso permite leitura offline dos dados se a query for GET
          {
            urlPattern: /^https:\/\/.*\.supabase\.co\/rest\/v1\/.*/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'supabase-api-cache',
              networkTimeoutSeconds: 5, // Espera 5s pela rede, senão vai pro cache
              expiration: {
                maxEntries: 100,
                maxAgeSeconds: 60 * 60 * 24, // 1 dia
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
        ],
      },
      devOptions: {
        enabled: true,
        type: 'module',
      },
    })
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));