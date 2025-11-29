#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

console.log('\n🔍 ANDROID PWA INSTALLATION DIAGNOSTIC v2\n');
console.log('='.repeat(80));

const issues = [];
const warnings = [];

// 1. Check manifest.webmanifest exists and is valid
console.log('\n1️⃣  MANIFEST FILE');
const manifestPath = path.join(__dirname, 'dist', 'manifest.webmanifest');
if (!fs.existsSync(manifestPath)) {
  console.log('❌ manifest.webmanifest NOT FOUND');
  issues.push('Manifest file does not exist');
} else {
  try {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    console.log('✅ manifest.webmanifest exists and is valid JSON');
    
    // Check required fields
    const required = {
      'name': manifest.name,
      'short_name': manifest.short_name,
      'start_url': manifest.start_url,
      'display': manifest.display,
      'background_color': manifest.background_color,
      'theme_color': manifest.theme_color,
      'icons': manifest.icons
    };
    
    let allPresent = true;
    Object.entries(required).forEach(([key, value]) => {
      if (value) {
        console.log(`   ✅ ${key}: present`);
      } else {
        console.log(`   ❌ ${key}: MISSING`);
        allPresent = false;
        issues.push(`Manifest missing: ${key}`);
      }
    });
    
    // Check display value
    if (manifest.display !== 'standalone') {
      console.log(`   ⚠️  display is "${manifest.display}", should be "standalone"`);
      warnings.push(`Display is "${manifest.display}", Chrome prefers "standalone"`);
    }
    
    // Check icons
    if (manifest.icons && manifest.icons.length > 0) {
      console.log(`   ✅ icons: ${manifest.icons.length} icon(s) defined`);
      manifest.icons.forEach((icon, idx) => {
        const purpose = icon.purpose || 'any';
        const maskable = purpose.includes('maskable');
        console.log(`      Icon ${idx + 1}: ${icon.sizes} (${purpose}) ${maskable ? '✅' : '⚠️'}`);
      });
    } else {
      console.log(`   ❌ No icons defined`);
      issues.push('No icons defined in manifest');
    }
    
    // Check for required icon sizes
    const has192 = manifest.icons?.some(i => i.sizes.includes('192'));
    const has512 = manifest.icons?.some(i => i.sizes.includes('512'));
    if (!has192) {
      console.log(`   ❌ Missing 192x192 icon`);
      issues.push('Missing 192x192 icon');
    }
    if (!has512) {
      console.log(`   ❌ Missing 512x512 icon`);
      issues.push('Missing 512x512 icon');
    }
    
    // Check screenshots (recommended for Android)
    if (manifest.screenshots && manifest.screenshots.length > 0) {
      console.log(`   ✅ screenshots: ${manifest.screenshots.length} screenshot(s)`);
    } else {
      console.log(`   ⚠️  No screenshots (recommended for app store)`);
      warnings.push('No screenshots defined (optional but recommended)');
    }
    
  } catch (e) {
    console.log('❌ manifest.webmanifest is not valid JSON');
    issues.push('Manifest is not valid JSON: ' + e.message);
  }
}

// 2. Check icons exist
console.log('\n2️⃣  ICON FILES');
const iconFiles = ['pwa-icon-192-v2.png', 'pwa-icon-512-v2.png', 'favicon.png'];
const iconsExist = {};
iconFiles.forEach(icon => {
  const iconPath = path.join(__dirname, 'dist', icon);
  if (fs.existsSync(iconPath)) {
    const stats = fs.statSync(iconPath);
    console.log(`✅ ${icon} (${stats.size} bytes)`);
    iconsExist[icon] = true;
  } else {
    console.log(`❌ ${icon} NOT FOUND`);
    iconsExist[icon] = false;
    issues.push(`Icon file missing: ${icon}`);
  }
});

// 3. Check HTML
console.log('\n3️⃣  HTML CONFIGURATION');
const htmlPath = path.join(__dirname, 'dist', 'index.html');
if (fs.existsSync(htmlPath)) {
  const html = fs.readFileSync(htmlPath, 'utf8');
  
  const checks = {
    'lang="pt-BR"': html.includes('lang="pt-BR"'),
    '<meta charset': html.includes('<meta charset'),
    '<meta name="viewport"': html.includes('<meta name="viewport"'),
    '<meta name="theme-color"': html.includes('<meta name="theme-color"'),
    '<meta name="mobile-web-app-capable"': html.includes('<meta name="mobile-web-app-capable"'),
    '<link rel="manifest"': html.includes('<link rel="manifest"'),
    '<link rel="icon"': html.includes('<link rel="icon"'),
    '<title>': html.includes('<title>')
  };
  
  Object.entries(checks).forEach(([check, result]) => {
    console.log(`${result ? '✅' : '❌'} ${check}`);
    if (!result) {
      issues.push(`HTML missing: ${check}`);
    }
  });
} else {
  console.log('❌ index.html NOT FOUND');
  issues.push('index.html not found');
}

// 4. Check Service Worker
console.log('\n4️⃣  SERVICE WORKER');
const swPath = path.join(__dirname, 'dist', 'sw.js');
if (fs.existsSync(swPath)) {
  const sw = fs.readFileSync(swPath, 'utf8');
  const swSize = fs.statSync(swPath).size;
  console.log(`✅ sw.js exists (${swSize} bytes)`);
  
  const swChecks = {
    'registerServiceWorker': sw.includes('registerServiceWorker') || sw.includes('register'),
    'clientsClaim': sw.includes('clientsClaim'),
    'skipWaiting': sw.includes('skipWaiting'),
    'precache': sw.includes('precacheManifest') || sw.includes('__WB_MANIFEST') || sw.includes('precache')
  };
  
  Object.entries(swChecks).forEach(([check, result]) => {
    console.log(`   ${result ? '✅' : '⚠️'} ${check}`);
  });
} else {
  console.log('❌ sw.js NOT FOUND');
  issues.push('Service Worker not found');
}

// 5. Chrome/Android Installation Checklist
console.log('\n5️⃣  ANDROID CHROME INSTALLATION CHECKLIST');
console.log('='.repeat(80));

const checklist = [
  { name: 'HTTPS', status: 'ℹ️ Must be HTTPS in production', critical: true },
  { name: 'Manifest File', status: fs.existsSync(manifestPath) ? '✅' : '❌', critical: true },
  { name: 'Manifest Valid JSON', status: issues.some(i => i.includes('not valid JSON')) ? '❌' : '✅', critical: true },
  { name: 'Display: standalone', status: '✅', critical: true },
  { name: 'Icons 192x192 & 512x512', status: iconsExist['pwa-icon-192-v2.png'] && iconsExist['pwa-icon-512-v2.png'] ? '✅' : '❌', critical: true },
  { name: 'Theme Color', status: '✅', critical: true },
  { name: 'Start URL', status: '✅', critical: true },
  { name: 'Service Worker', status: fs.existsSync(swPath) ? '✅' : '❌', critical: true },
  { name: 'Meta viewport', status: '✅', critical: true },
  { name: 'Manifest Linked in HTML', status: '✅', critical: true },
  { name: 'Screenshots', status: '✅ (optional)', critical: false },
  { name: 'Maskable Icons', status: '✅ (nice to have)', critical: false }
];

checklist.forEach(item => {
  const icon = item.status.includes('✅') ? '✅' : item.status.includes('❌') ? '❌' : 'ℹ️';
  console.log(`${icon} ${item.name.padEnd(30)} ${item.status}`);
});

// 6. Why it might not be installing
console.log('\n6️⃣  POSSIBLE REASONS FOR NO INSTALL PROMPT\n');

if (issues.length === 0 && warnings.length === 0) {
  console.log('✅ No configuration issues found!\n');
  console.log('If the install prompt still doesn\'t appear, the reasons are likely:');
  console.log('\n1. 🔒 NOT USING HTTPS');
  console.log('   └─ Android requires HTTPS (with valid certificate)');
  console.log('   └─ Solution: Deploy to HTTPS or use ngrok');
  console.log('\n2. ⏳ NOT WAITING LONG ENOUGH');
  console.log('   └─ Android takes 2-5 seconds to detect PWA');
  console.log('   └─ Solution: Wait at least 5 seconds');
  console.log('\n3. 🗑️ BROWSER CACHE');
  console.log('   └─ Old manifest might be cached');
  console.log('   └─ Solution: Clear cache (Settings → Delete all data)');
  console.log('\n4. 🔄 SERVICE WORKER NOT REGISTERED');
  console.log('   └─ Check DevTools → Application → Service Workers');
  console.log('   └─ Check Console for SW registration errors');
  console.log('\n5. 📱 BROWSER REQUIREMENTS NOT MET');
  console.log('   └─ User hasn\'t interacted enough with the site');
  console.log('   └─ Site must be visited at least once before install appears');
  console.log('   └─ Solution: Scroll, interact with the page');
  console.log('\n6. 🚫 ANDROID CHROME VERSION');
  console.log('   └─ Very old Chrome versions might not support PWA');
  console.log('   └─ Solution: Update Android Chrome to latest');
  
} else if (issues.length > 0) {
  console.log('❌ CONFIGURATION ISSUES FOUND:\n');
  issues.forEach((issue, idx) => {
    console.log(`${idx + 1}. ❌ ${issue}`);
  });
} else if (warnings.length > 0) {
  console.log('⚠️ WARNINGS:\n');
  warnings.forEach((warning, idx) => {
    console.log(`${idx + 1}. ⚠️ ${warning}`);
  });
}

// 7. How to test
console.log('\n7️⃣  HOW TO TEST ON ANDROID\n');
console.log('✅ Steps:');
console.log('1. Deploy to HTTPS (ngrok or Vercel)');
console.log('2. Open URL on Android Chrome');
console.log('3. Wait 3-5 seconds');
console.log('4. Open Chrome menu (⋮)');
console.log('5. Look for "Install app"');
console.log('6. Tap to install');
console.log('\n✅ Alternative:');
console.log('1. Open DevTools (F12 in desktop, or chrome://inspect for Android)');
console.log('2. Check Application → Manifest');
console.log('3. Check Application → Service Workers');
console.log('4. Check Console for any errors');

console.log('\n' + '='.repeat(80));
console.log(`\nResult: ${issues.length === 0 ? '✅ Ready for testing' : '❌ Fix issues first'}\n`);
