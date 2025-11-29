#!/usr/bin/env node

import fs from 'fs';
import path from 'path';

console.log('\n🤖 PWA ANDROID INSTALLATION DIAGNOSTIC\n');
console.log('='.repeat(70));

try {
  // 1. Check manifest
  console.log('\n1️⃣  MANIFEST WEBMANIFEST');
  const manifest = JSON.parse(fs.readFileSync('dist/manifest.webmanifest', 'utf8'));
  console.log('   ✅ Manifest exists');
  console.log('   📄 Name:', manifest.name);
  console.log('   📄 Display:', manifest.display);
  console.log('   📄 Start URL:', manifest.start_url);
  console.log('   📄 Icons:', manifest.icons.length);
  console.log('   📄 Screenshots:', manifest.screenshots.length);

  // 2. Check index.html has manifest link
  console.log('\n2️⃣  HTML MANIFEST LINK');
  const html = fs.readFileSync('dist/index.html', 'utf8');
  if (html.includes('manifest.webmanifest')) {
    console.log('   ✅ Manifest link found');
    const match = html.match(/<link[^>]*manifest[^>]*>/);
    if (match) console.log('      ' + match[0]);
  } else {
    console.log('   ❌ Manifest link NOT found - THIS IS THE PROBLEM!');
  }

  // 3. Check service worker
  console.log('\n3️⃣  SERVICE WORKER');
  if (fs.existsSync('dist/sw.js')) {
    const swContent = fs.readFileSync('dist/sw.js', 'utf8');
    console.log('   ✅ sw.js exists (' + swContent.length + ' bytes)');
    if (swContent.includes('precacheManifest')) console.log('   ✅ Has precache manifest');
    else console.log('   ⚠️  No precache manifest');
    if (swContent.includes('clientsClaim')) console.log('   ✅ Has clientsClaim');
    if (swContent.includes('skipWaiting')) console.log('   ✅ Has skipWaiting');
  } else {
    console.log('   ❌ sw.js NOT found');
  }

  // 4. Check icons
  console.log('\n4️⃣  ICONS');
  const iconFiles = ['pwa-icon-192-v2.png', 'pwa-icon-512-v2.png', 'favicon.png'];
  iconFiles.forEach(icon => {
    if (fs.existsSync('dist/' + icon)) {
      const size = fs.statSync('dist/' + icon).size;
      console.log('   ✅ ' + icon + ' (' + size + ' bytes)');
    } else {
      console.log('   ❌ ' + icon + ' NOT found');
    }
  });

  // 5. Check meta tags
  console.log('\n5️⃣  META TAGS');
  const metaTags = [
    { name: 'viewport', desc: 'Viewport responsive' },
    { name: 'theme-color', desc: 'Theme color' },
    { name: 'mobile-web-app-capable', desc: 'Mobile web app' },
    { name: 'apple-mobile-web-app-capable', desc: 'Apple mobile web app' }
  ];
  
  metaTags.forEach(tag => {
    const hasTag = html.includes('name="' + tag.name + '"') || 
                   html.includes("name='" + tag.name + "'");
    console.log((hasTag ? '   ✅ ' : '   ❌ ') + tag.desc);
  });

  // 6. Check manifest icons purpose
  console.log('\n6️⃣  ICON PURPOSE');
  manifest.icons.forEach((icon, idx) => {
    console.log('   Icon ' + (idx + 1) + ':');
    console.log('      Size: ' + icon.sizes);
    console.log('      Purpose: ' + (icon.purpose || 'any (standard)'));
    console.log('      Maskable: ' + (icon.purpose.includes('maskable') ? 'Yes ✅' : 'No'));
  });

  // 7. Android Install Checklist
  console.log('\n7️⃣  ANDROID INSTALL REQUIREMENTS');
  console.log('='.repeat(70));
  
  const requirements = [
    {
      check: 'HTTPS Connection',
      status: '⚠️  (Must be HTTPS in production - localhost OK for testing)',
      result: true
    },
    {
      check: 'Manifest File Valid JSON',
      status: manifest ? '✅' : '❌',
      result: !!manifest
    },
    {
      check: 'Display Mode = standalone',
      status: manifest.display === 'standalone' ? '✅' : '❌',
      result: manifest.display === 'standalone'
    },
    {
      check: 'Icon 192x192',
      status: manifest.icons.some(i => i.sizes === '192x192') ? '✅' : '❌',
      result: manifest.icons.some(i => i.sizes === '192x192')
    },
    {
      check: 'Icon 512x512',
      status: manifest.icons.some(i => i.sizes === '512x512') ? '✅' : '❌',
      result: manifest.icons.some(i => i.sizes === '512x512')
    },
    {
      check: 'Maskable Icons',
      status: manifest.icons.every(i => i.purpose.includes('maskable')) ? '✅' : '❌',
      result: manifest.icons.every(i => i.purpose.includes('maskable'))
    },
    {
      check: 'Start URL set',
      status: manifest.start_url ? '✅' : '❌',
      result: !!manifest.start_url
    },
    {
      check: 'Theme Color set',
      status: manifest.theme_color ? '✅' : '❌',
      result: !!manifest.theme_color
    },
    {
      check: 'Background Color set',
      status: manifest.background_color ? '✅' : '❌',
      result: !!manifest.background_color
    },
    {
      check: 'Manifest Linked in HTML',
      status: html.includes('manifest.webmanifest') ? '✅' : '❌',
      result: html.includes('manifest.webmanifest')
    },
    {
      check: 'Service Worker Exists',
      status: fs.existsSync('dist/sw.js') ? '✅' : '❌',
      result: fs.existsSync('dist/sw.js')
    },
    {
      check: 'Viewport Meta Tag',
      status: html.includes('viewport') ? '✅' : '❌',
      result: html.includes('viewport')
    },
    {
      check: 'Name Attribute',
      status: manifest.name && manifest.name.length > 0 ? '✅' : '❌',
      result: !!manifest.name
    },
    {
      check: 'Short Name Attribute',
      status: manifest.short_name && manifest.short_name.length > 0 ? '✅' : '❌',
      result: !!manifest.short_name
    }
  ];

  requirements.forEach(req => {
    console.log(req.status.padEnd(10) + ' ' + req.check);
  });

  const passCount = requirements.filter(r => r.status.includes('✅')).length;
  const failCount = requirements.filter(r => r.status.includes('❌')).length;
  
  console.log('\n' + '='.repeat(70));
  console.log(`SCORE: ${passCount}/${requirements.length - 1} (${failCount} issues)`);

  if (failCount > 0) {
    console.log('\n⚠️  ISSUES FOUND:');
    requirements.filter(r => r.status.includes('❌')).forEach(req => {
      console.log('   ❌ ' + req.check);
    });
  }

  // 8. How to test
  console.log('\n8️⃣  HOW TO TEST ON ANDROID');
  console.log('='.repeat(70));
  console.log('\nLOCAL TESTING (for development):');
  console.log('   1. Open DevTools (F12)');
  console.log('   2. Go to Console tab');
  console.log('   3. Look for errors or SW registration issues');
  console.log('   4. Check Application → Manifest');
  console.log('   5. Check Application → Service Workers');
  
  console.log('\nPRODUCTION TESTING (Android Chrome):');
  console.log('   1. Deploy to HTTPS server');
  console.log('   2. Open app in Android Chrome');
  console.log('   3. Wait 2-3 seconds for app detection');
  console.log('   4. Should see install prompt');
  console.log('   5. If not, check DevTools Console');
  
  console.log('\nDEBUGGING ON ANDROID:');
  console.log('   1. Connect Android to PC via USB');
  console.log('   2. Enable USB debugging on Android');
  console.log('   3. Open: chrome://inspect in Desktop Chrome');
  console.log('   4. Click "inspect" on your phone');
  console.log('   5. Check Console for errors');

  console.log('\n9️⃣  COMMON ISSUES');
  console.log('='.repeat(70));
  console.log('❌ "No install prompt"');
  console.log('   └─ Check if HTTPS is being used');
  console.log('   └─ Check if manifest.webmanifest is accessible');
  console.log('   └─ Check if Service Worker is registered');
  console.log('   └─ Wait 2-3 seconds after page load');
  console.log('   └─ Clear browser cache (Settings → Delete all data)');
  
  console.log('\n❌ "Manifest not found"');
  console.log('   └─ Verify <link rel="manifest"> in HTML');
  console.log('   └─ Check dist/manifest.webmanifest exists');
  console.log('   └─ Check manifest is valid JSON');
  
  console.log('\n❌ "Service Worker error"');
  console.log('   └─ Check dist/sw.js exists');
  console.log('   └─ Check browser console for errors');
  console.log('   └─ Verify vite-plugin-pwa configuration');

  console.log('\n✅ IF ALL CHECKS PASS:');
  console.log('   → Deploy to HTTPS');
  console.log('   → Visit from Android Chrome');
  console.log('   → Install prompt should appear');
  console.log('   → App will work offline ✨');
  console.log('\n' + '='.repeat(70));

} catch (error) {
  console.error('❌ Error:', error.message);
  process.exit(1);
}
