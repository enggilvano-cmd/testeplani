import { createRoot } from 'react-dom/client'
import { useState } from 'react'
import App from './App.tsx'
import './index.css'
import { initSentry } from './lib/sentry'
import { initWebVitals } from './lib/webVitals'
import { offlineDatabase } from './lib/offlineDatabase'
import { offlineSync } from './lib/offlineSync'
import { SplashScreen } from './components/SplashScreen'

// Initialize Sentry before rendering
initSentry();

// Initialize Web Vitals monitoring
initWebVitals();

// Initialize offline database and initial sync
offlineDatabase.init().then(() => {
  offlineSync.syncDataFromServer().catch(err => {
    console.warn('Initial sync failed, will retry when online:', err);
  });
});

function Root() {
  const [showSplash, setShowSplash] = useState(true);

  if (showSplash) {
    return <SplashScreen onComplete={() => setShowSplash(false)} />;
  }

  return <App />;
}

createRoot(document.getElementById("root")!).render(<Root />);
