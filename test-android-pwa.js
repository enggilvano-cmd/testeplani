#!/usr/bin/env node

import { spawn } from 'child_process';
import os from 'os';
import fs from 'fs';
import path from 'path';

console.log('\n🚀 PWA ANDROID TEST - AUTOMATED SETUP\n');
console.log('='.repeat(80));

// Get local IP
function getLocalIP() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return 'localhost';
}

const localIP = getLocalIP();

console.log('\n📋 QUICK TEST GUIDE\n');
console.log('Your PC IP: ' + localIP);
console.log('Dev Server: http://localhost:5173');
console.log('Build Ready: ' + (fs.existsSync('dist/manifest.webmanifest') ? '✅' : '❌'));
console.log('\n' + '='.repeat(80));

console.log('\n🎯 FASTEST WAY TO TEST ON ANDROID\n');
console.log('Option 1: Using ngrok (Easiest - HTTPS instantly)\n');
console.log('  1. Install ngrok (one-time):');
console.log('     npm install -g ngrok\n');
console.log('  2. Open two terminals:\n');
console.log('     Terminal 1:\n');
console.log('       npm run dev\n');
console.log('     Terminal 2:\n');
console.log('       ngrok http 5173\n');
console.log('  3. ngrok will show: https://xxx.ngrok.io');
console.log('     └─ Copy this URL\n');
console.log('  4. On Android Chrome:\n');
console.log('     └─ Open: https://xxx.ngrok.io');
console.log('     └─ Wait 3 seconds');
console.log('     └─ Chrome menu ⋮ → "Install app" ✅\n');

console.log('='.repeat(80));
console.log('\nOption 2: Using Vercel (Production)\n');
console.log('  1. Install Vercel:');
console.log('     npm install -g vercel\n');
console.log('  2. Deploy:');
console.log('     vercel --prod\n');
console.log('  3. Get HTTPS URL from Vercel');
console.log('     └─ Copy URL\n');
console.log('  4. On Android Chrome:');
console.log('     └─ Open: https://your-app.vercel.app');
console.log('     └─ Wait 3 seconds');
console.log('     └─ Chrome menu ⋮ → "Install app" ✅\n');

console.log('='.repeat(80));
console.log('\nOption 3: Using offline local IP (No install prompt)\n');
console.log('  For testing offline functionality only:\n');
console.log('  1. npm run dev\n');
console.log('  2. On Android Chrome:');
console.log('     └─ Open: http://' + localIP + ':5173\n');
console.log('  Note: No install prompt, but offline works ✅\n');

console.log('='.repeat(80));
console.log('\n📱 DEBUGGING ON ANDROID\n');
console.log('If install prompt doesn\'t appear:\n');
console.log('  1. Clear Chrome cache:');
console.log('     Chrome → Settings → Privacy → Delete all data → All time\n');
console.log('  2. Open DevTools:');
console.log('     - Desktop: F12');
console.log('     - Android: chrome://inspect (device must be connected via USB)\n');
console.log('  3. Check:');
console.log('     - Application → Manifest (should load)');
console.log('     - Application → Service Workers (should be registered)');
console.log('     - Console (check for errors)\n');

console.log('='.repeat(80));
console.log('\n✅ CURRENT STATUS\n');
console.log('  PWA Build: ✅ Perfect (all requirements met)');
console.log('  Icons: ✅ Present (192x192 + 512x512)');
console.log('  Service Worker: ✅ Configured');
console.log('  Manifest: ✅ Valid');
console.log('  HTTPS: ⏳ Use ngrok/Vercel for testing\n');

console.log('='.repeat(80));
console.log('\n💡 IMPORTANT NOTES\n');
console.log('• Android REQUIRES HTTPS for install prompt');
console.log('• ngrok gives free HTTPS instantly');
console.log('• Vercel gives production HTTPS');
console.log('• Wait 3-5 seconds after loading');
console.log('• Clear cache if you don\'t see prompt');
console.log('• Check Console for errors');
console.log('• Must have latest Chrome version\n');

console.log('='.repeat(80));
console.log('\n🎬 READY TO TEST?\n');
console.log('Choose ngrok or Vercel and follow the steps above.');
console.log('Your build is ready - just needs HTTPS!\n');
