#!/usr/bin/env node

/**
 * PWA Verification Script
 * Tests all PWA requirements and configurations
 * Run with: node verify-pwa.js
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

const log = {
  success: (msg) => console.log(`${colors.green}✅ ${msg}${colors.reset}`),
  error: (msg) => console.log(`${colors.red}❌ ${msg}${colors.reset}`),
  warning: (msg) => console.log(`${colors.yellow}⚠️  ${msg}${colors.reset}`),
  info: (msg) => console.log(`${colors.blue}ℹ️  ${msg}${colors.reset}`),
  section: (msg) => console.log(`\n${colors.cyan}${msg}${colors.reset}`),
};

class PWAVerifier {
  constructor() {
    this.distDir = path.join(__dirname, 'dist');
    this.publicDir = path.join(__dirname, 'public');
    this.tests = [];
    this.passed = 0;
    this.failed = 0;
  }

  fileExists(filePath) {
    return fs.existsSync(filePath);
  }

  readJSON(filePath) {
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      return JSON.parse(content);
    } catch (e) {
      return null;
    }
  }

  readFile(filePath) {
    try {
      return fs.readFileSync(filePath, 'utf8');
    } catch (e) {
      return null;
    }
  }

  async runTests() {
    log.section('🚀 PWA VERIFICATION REPORT');
    console.log(`Date: ${new Date().toLocaleString()}`);
    console.log(`Directory: ${this.distDir}\n`);

    // Test files existence
    log.section('📁 FILE STRUCTURE');
    this.testFileExists('manifest.webmanifest', 'Manifest');
    this.testFileExists('sw.js', 'Service Worker');
    this.testFileExists('index.html', 'HTML');
    this.testFileExists('pwa-icon-192-v2.png', 'Icon 192x192');
    this.testFileExists('pwa-icon-512-v2.png', 'Icon 512x512');
    this.testFileExists('favicon.png', 'Favicon');

    // Test manifest content
    log.section('📋 MANIFEST VALIDATION');
    this.testManifest();

    // Test HTML content
    log.section('🔗 HTML VALIDATION');
    this.testHTMLTags();

    // Test service worker
    log.section('⚙️  SERVICE WORKER');
    this.testServiceWorker();

    // Test icon files
    log.section('🖼️  ICON VALIDATION');
    this.testIcons();

    // Summary
    log.section('📊 SUMMARY');
    this.printSummary();
  }

  testFileExists(filename, label) {
    const filePath = path.join(this.distDir, filename);
    if (this.fileExists(filePath)) {
      const stats = fs.statSync(filePath);
      log.success(`${label}: ${filename} (${this.formatBytes(stats.size)})`);
      this.passed++;
    } else {
      log.error(`${label}: ${filename} NOT FOUND`);
      this.failed++;
    }
  }

  testManifest() {
    const manifestPath = path.join(this.distDir, 'manifest.webmanifest');
    const manifest = this.readJSON(manifestPath);

    if (!manifest) {
      log.error('Manifest could not be parsed');
      this.failed++;
      return;
    }

    const requiredFields = [
      { key: 'name', type: 'string' },
      { key: 'short_name', type: 'string' },
      { key: 'description', type: 'string' },
      { key: 'display', type: 'string', value: 'standalone' },
      { key: 'start_url', type: 'string', value: '/' },
      { key: 'scope', type: 'string', value: '/' },
      { key: 'icons', type: 'array' },
      { key: 'theme_color', type: 'string' },
      { key: 'background_color', type: 'string' },
      { key: 'lang', type: 'string' },
    ];

    requiredFields.forEach((field) => {
      if (!(field.key in manifest)) {
        log.error(`Missing required field: ${field.key}`);
        this.failed++;
      } else if (field.value && manifest[field.key] !== field.value) {
        log.warning(`${field.key} should be "${field.value}", but is "${manifest[field.key]}"`);
        this.passed++;
      } else {
        log.success(`Field "${field.key}": ${JSON.stringify(manifest[field.key]).substring(0, 50)}`);
        this.passed++;
      }
    });

    // Test icons
    if (Array.isArray(manifest.icons)) {
      const has192 = manifest.icons.some((i) => i.sizes === '192x192');
      const has512 = manifest.icons.some((i) => i.sizes === '512x512');

      if (has192) {
        log.success('Icon 192x192 configured');
        this.passed++;
      } else {
        log.error('Icon 192x192 NOT configured');
        this.failed++;
      }

      if (has512) {
        log.success('Icon 512x512 configured');
        this.passed++;
      } else {
        log.error('Icon 512x512 NOT configured');
        this.failed++;
      }
    }

    // Test screenshots
    if (manifest.screenshots) {
      log.success(`Screenshots configured: ${manifest.screenshots.length}`);
      this.passed++;
    } else {
      log.warning('No screenshots configured (optional but recommended)');
    }
  }

  testHTMLTags() {
    const htmlPath = path.join(this.distDir, 'index.html');
    const html = this.readFile(htmlPath);

    if (!html) {
      log.error('index.html could not be read');
      this.failed++;
      return;
    }

    const tags = [
      { name: 'manifest link', pattern: /<link[^>]*rel=["\']manifest["\'][^>]*>/ },
      { name: 'viewport meta', pattern: /<meta[^>]*name=["\']viewport["\'][^>]*>/ },
      { name: 'theme-color meta', pattern: /<meta[^>]*name=["\']theme-color["\'][^>]*>/ },
      { name: 'apple-mobile-web-app-capable', pattern: /<meta[^>]*name=["\']apple-mobile-web-app-capable["\'][^>]*>/ },
      { name: 'description meta', pattern: /<meta[^>]*name=["\']description["\'][^>]*>/ },
      { name: 'charset meta', pattern: /<meta[^>]*charset[^>]*>/ },
    ];

    tags.forEach((tag) => {
      if (tag.pattern.test(html)) {
        log.success(`${tag.name} present`);
        this.passed++;
      } else {
        log.error(`${tag.name} NOT found`);
        this.failed++;
      }
    });
  }

  testServiceWorker() {
    const swPath = path.join(this.distDir, 'sw.js');
    const sw = this.readFile(swPath);

    if (!sw) {
      log.error('Service Worker could not be read');
      this.failed++;
      return;
    }

    const stats = fs.statSync(swPath);
    log.success(`Service Worker loaded (${this.formatBytes(stats.size)})`);
    this.passed++;

    // Test for key SW features
    const features = [
      { name: 'Precache', pattern: /precacheAndRoute/ },
      { name: 'Cache cleanup', pattern: /cleanupOutdatedCaches/ },
      { name: 'Clients claim', pattern: /clientsClaim/ },
      { name: 'Skip waiting', pattern: /skipWaiting/ },
      { name: 'Navigation route', pattern: /NavigationRoute/ },
      { name: 'Runtime caching', pattern: /registerRoute/ },
    ];

    features.forEach((feature) => {
      if (feature.pattern.test(sw)) {
        log.success(`${feature.name} configured`);
        this.passed++;
      } else {
        log.warning(`${feature.name} NOT found (may be optional)`);
      }
    });
  }

  testIcons() {
    const icons = [
      { name: 'pwa-icon-192-v2.png', size: '192x192' },
      { name: 'pwa-icon-512-v2.png', size: '512x512' },
      { name: 'favicon.png', size: 'Favicon' },
    ];

    icons.forEach((icon) => {
      const iconPath = path.join(this.distDir, icon.name);
      if (this.fileExists(iconPath)) {
        const stats = fs.statSync(iconPath);
        const isValidSize = stats.size > 1000 && stats.size < 100000;
        if (isValidSize) {
          log.success(`${icon.size}: ${icon.name} (${this.formatBytes(stats.size)})`);
          this.passed++;
        } else {
          log.warning(`${icon.name} size seems unusual: ${this.formatBytes(stats.size)}`);
          this.passed++;
        }
      } else {
        log.error(`${icon.size}: ${icon.name} NOT FOUND`);
        this.failed++;
      }
    });
  }

  formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
  }

  printSummary() {
    const total = this.passed + this.failed;
    const percentage = Math.round((this.passed / total) * 100);

    console.log(`Total Tests: ${total}`);
    console.log(`${colors.green}Passed: ${this.passed}${colors.reset}`);
    console.log(`${colors.red}Failed: ${this.failed}${colors.reset}`);
    console.log(`Score: ${percentage}%\n`);

    if (this.failed === 0) {
      log.success('✨ ALL PWA REQUIREMENTS MET - PRODUCTION READY ✨');
    } else {
      log.warning(`⚠️  ${this.failed} issues found. Review above.`);
    }

    log.section('📱 NEXT STEPS');
    console.log('1. Deploy to HTTPS server');
    console.log('2. Test on Android Chrome: Menu → "Install app"');
    console.log('3. Test on iOS Safari: Share → "Add to Home Screen"');
    console.log('4. Test on Desktop Chrome: Address bar icon or Menu → "Install"');
    console.log('5. Verify offline functionality works');
  }
}

// Run verification
const verifier = new PWAVerifier();
verifier.runTests().catch((e) => {
  log.error('Verification failed: ' + e.message);
  process.exit(1);
});
