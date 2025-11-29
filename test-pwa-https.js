#!/usr/bin/env node

import fs from 'fs';
import https from 'https';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = 8443;

// Generate self-signed certificate if it doesn't exist
function generateCertificate() {
  const certPath = path.join(__dirname, 'cert.pem');
  const keyPath = path.join(__dirname, 'key.pem');

  if (fs.existsSync(certPath) && fs.existsSync(keyPath)) {
    console.log('📜 Using existing certificates');
    return { certPath, keyPath };
  }

  console.log('🔐 Generating self-signed certificate...');
  
  const { execSync } = await import('child_process');
  try {
    execSync(`openssl req -x509 -newkey rsa:2048 -keyout "${keyPath}" -out "${certPath}" -days 365 -nodes -subj "/CN=localhost"`, {
      stdio: 'ignore'
    });
    console.log('✅ Certificate generated');
    return { certPath, keyPath };
  } catch (error) {
    console.error('❌ Failed to generate certificate');
    console.error('Install OpenSSL or use ngrok instead');
    process.exit(1);
  }
}

const { certPath, keyPath } = generateCertificate();

const server = https.createServer(
  {
    cert: fs.readFileSync(certPath),
    key: fs.readFileSync(keyPath)
  },
  (req, res) => {
    let filePath = path.join(__dirname, 'dist', req.url === '/' ? 'index.html' : req.url);
    
    // Serve manifest.webmanifest with correct MIME type
    if (req.url === '/manifest.webmanifest') {
      filePath = path.join(__dirname, 'dist', 'manifest.webmanifest');
      res.setHeader('Content-Type', 'application/manifest+json');
      res.setHeader('Cache-Control', 'public, max-age=3600');
    }
    
    // Serve service worker with correct MIME type
    if (req.url === '/sw.js') {
      filePath = path.join(__dirname, 'dist', 'sw.js');
      res.setHeader('Content-Type', 'application/javascript');
      res.setHeader('Service-Worker-Allowed', '/');
      res.setHeader('Cache-Control', 'public, max-age=3600');
    }

    fs.readFile(filePath, (err, data) => {
      if (err) {
        res.writeHead(404);
        res.end('Not found');
        return;
      }

      if (filePath.endsWith('.html')) {
        res.setHeader('Content-Type', 'text/html');
      } else if (filePath.endsWith('.js')) {
        res.setHeader('Content-Type', 'application/javascript');
      } else if (filePath.endsWith('.css')) {
        res.setHeader('Content-Type', 'text/css');
      } else if (filePath.endsWith('.json')) {
        res.setHeader('Content-Type', 'application/json');
      } else if (filePath.endsWith('.png')) {
        res.setHeader('Content-Type', 'image/png');
      } else if (filePath.endsWith('.svg')) {
        res.setHeader('Content-Type', 'image/svg+xml');
      }

      res.writeHead(200);
      res.end(data);
    });
  }
);

server.listen(PORT, () => {
  console.log('\n🚀 HTTPS PWA Server Running\n');
  console.log('='.repeat(70));
  console.log(`📍 Local:   https://localhost:${PORT}/`);
  console.log(`📍 Network: https://127.0.0.1:${PORT}/`);
  console.log('\n⚠️  Browser will warn about certificate (self-signed)');
  console.log('   Click "Advanced" → "Proceed" to continue');
  console.log('\n📱 Android Testing:');
  console.log('   1. Make sure desktop and Android are on same network');
  console.log('   2. Find your computer IP (run: ipconfig)');
  console.log('   3. Open: https://YOUR-PC-IP:' + PORT);
  console.log('   4. Android may warn - proceed anyway');
  console.log('   5. Install prompt should appear after 2-3 seconds');
  console.log('\n💡 Tips:');
  console.log('   - If no install prompt: Open DevTools (F12)');
  console.log('   - Check Console for Service Worker errors');
  console.log('   - Check Application → Manifest');
  console.log('   - Check Application → Service Workers');
  console.log('\n' + '='.repeat(70));
  console.log('Press Ctrl+C to stop server\n');
});
