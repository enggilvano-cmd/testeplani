// Push notification utilities for service worker integration
import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/lib/logger';

// VAPID public key for push notifications
// This will be generated and stored as a secret
const VAPID_PUBLIC_KEY = 'BNGj1HbKCx7vZUS2oE6rsbJrttyRgC4V9OYbi3RcaWbicZMBwm_m_K5eU8188MRF-sB1imKfONhmuKf2bPffTwI';

export interface PushSubscriptionData {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
}

/**
 * Check if push notifications are supported
 */
export function isPushNotificationSupported(): boolean {
  return 'serviceWorker' in navigator && 'PushManager' in window;
}

/**
 * Check current push notification permission
 */
export function getPushNotificationPermission(): NotificationPermission {
  return Notification.permission;
}

/**
 * Request push notification permission
 */
export async function requestPushNotificationPermission(): Promise<boolean> {
  if (!isPushNotificationSupported()) {
    logger.warn('Push notifications are not supported');
    return false;
  }

  try {
    const permission = await Notification.requestPermission();
    return permission === 'granted';
  } catch (error) {
    logger.error('Error requesting push notification permission:', error);
    return false;
  }
}

/**
 * Helper to wait for Service Worker activation
 */
async function waitForActivation(registration: ServiceWorkerRegistration): Promise<void> {
  if (registration.active) return;

  const sw = registration.installing || registration.waiting;
  
  if (!sw) {
    // If no active, installing or waiting, try ready as last resort
    if (registration.active) return;
    await Promise.race([
      navigator.serviceWorker.ready,
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Timeout waiting for ready')), 5000))
    ]);
    return;
  }

  // Force skip waiting if installed
  if (sw.state === 'installed') {
     sw.postMessage({ type: 'SKIP_WAITING' });
  }

  await new Promise<void>((resolve, reject) => {
    // 30s timeout for activation attempt
    const timeoutId = setTimeout(() => {
      reject(new Error('Timeout waiting for activation'));
    }, 30000);

    const stateChangeHandler = () => {
      if (sw.state === 'activated') {
        clearTimeout(timeoutId);
        sw.removeEventListener('statechange', stateChangeHandler);
        resolve();
      }
    };

    sw.addEventListener('statechange', stateChangeHandler);
    
    if (sw.state === 'activated') {
      clearTimeout(timeoutId);
      sw.removeEventListener('statechange', stateChangeHandler);
      resolve();
    }
  });
}

/**
 * Subscribe to push notifications
 */
export async function subscribeToPushNotifications(userId: string): Promise<PushSubscriptionData | null> {
  if (!isPushNotificationSupported()) {
    logger.warn('Push notifications are not supported');
    return null;
  }

  // Request permission immediately to preserve user gesture
  // This is critical for mobile browsers where async operations might lose the gesture token
  if (Notification.permission === 'default') {
    const permission = await requestPushNotificationPermission();
    if (!permission) {
      logger.warn('Push notification permission denied');
      return null;
    }
  } else if (Notification.permission === 'denied') {
    logger.warn('Push notification permission previously denied');
    return null;
  }

  try {
    // Check if we have a registration already
    let registration = await navigator.serviceWorker.getRegistration();

    // If no registration found, try to register manually
    if (!registration) {
      logger.info('No service worker registration found. Attempting to register /sw.js manually...');
      try {
        // IMPORTANT: Capture the returned registration object!
        registration = await navigator.serviceWorker.register('/sw.js', {
          scope: '/'
        });
        logger.info('Manual Service Worker registration successful', registration);
      } catch (regError: any) {
        logger.error('Failed to register Service Worker manually:', regError);
        // Throwing here to give the user specific feedback about why registration failed
        throw new Error(`Falha ao registrar o Service Worker: ${regError.message || regError}`);
      }
    }

    // Double check if we have a registration now
    if (!registration) {
      throw new Error('Não foi possível obter o registro do Service Worker.');
    }

    // Ensure the Service Worker is active
    if (!registration.active) {
      logger.info('Service Worker registered but not active. Waiting for activation...');
      
      try {
        await waitForActivation(registration);
      } catch (e) {
        logger.warn('SW activation timed out. Unregistering and retrying...', e);
        // Force unregister to clear any bad state
        await registration.unregister();
        
        // Try fresh register
        try {
          registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
          logger.info('Re-registered Service Worker');
          await waitForActivation(registration);
        } catch (e2) {
           logger.error('Critical failure in SW activation retry:', e2);
           throw new Error('Falha crítica na ativação do Service Worker. Tente limpar o cache do navegador e recarregar.');
        }
      }
    }

    if (!registration.active) {
       throw new Error('O Service Worker foi registrado mas falhou ao ativar. Tente recarregar a página.');
    }

    // Check if already subscribed
    let subscription = await registration.pushManager.getSubscription();

    // If not subscribed, create new subscription
    if (!subscription) {
      // Permission already checked/requested above
      
      try {
        // Subscribe to push notifications
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as BufferSource,
        });
      } catch (subError) {
        logger.error('Error during pushManager.subscribe:', subError);
        // If subscription fails, it might be due to an existing subscription with a different key?
        // Or invalid key format.
        throw subError;
      }
    } else {
      // If already subscribed, we should check if we need to resubscribe (e.g. key rotation)
      // But we can't easily check the key.
      // For now, we assume if it exists, it's valid.
      // However, if the user is reporting issues, maybe we should force re-subscribe?
      // Let's just log it.
      logger.info('Using existing push subscription');
    }

    // Extract subscription data
    const subscriptionData = subscription.toJSON();
    
    if (!subscriptionData.endpoint || !subscriptionData.keys) {
      throw new Error('Invalid subscription data');
    }

    const pushData: PushSubscriptionData = {
      endpoint: subscriptionData.endpoint,
      keys: {
        p256dh: subscriptionData.keys.p256dh,
        auth: subscriptionData.keys.auth,
      },
    };

    // Save subscription to database
    // Workaround: Since we might be missing an UPDATE policy, we delete first then insert
    // This ensures we don't hit a permission error on upsert if the row exists
    const { error: deleteError } = await supabase
      .from('push_subscriptions')
      .delete()
      .eq('user_id', userId)
      .eq('endpoint', pushData.endpoint);
      
    if (deleteError) {
      logger.warn('Error cleaning up old subscription:', deleteError);
      // Continue anyway, as the delete might fail if it doesn't exist (though usually it just returns count 0)
    }

    const { error } = await supabase
      .from('push_subscriptions')
      .insert({
        user_id: userId,
        endpoint: pushData.endpoint,
        p256dh: pushData.keys.p256dh,
        auth: pushData.keys.auth,
      });

    if (error) {
      logger.error('Error saving push subscription:', error);
      // Throw error to be caught by caller
      throw new Error(`Database error: ${error.message}`);
    }

    logger.info('Push notification subscription successful');
    return pushData;
  } catch (error) {
    logger.error('Error subscribing to push notifications:', error);
    throw error; // Re-throw to let caller handle/display it
  }
}

/**
 * Unsubscribe from push notifications
 */
export async function unsubscribeFromPushNotifications(userId: string): Promise<boolean> {
  if (!isPushNotificationSupported()) {
    return false;
  }

  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();

    if (subscription) {
      // Unsubscribe from push manager
      const unsubscribed = await subscription.unsubscribe();
      
      if (!unsubscribed) {
        logger.warn('Failed to unsubscribe from push manager');
        // Even if browser unsubscribe failed (rare), we might want to try to remove from DB?
        // But if browser is still subscribed, we are in a mismatch state.
        // Let's continue anyway to try to clean up DB.
      } else {
        logger.info('Browser push subscription cancelled');
      }

      // Remove from database
      const { error } = await supabase
        .from('push_subscriptions')
        .delete()
        .eq('user_id', userId)
        .eq('endpoint', subscription.endpoint);

      if (error) {
        logger.error('Error removing push subscription from database:', error);
        // We don't return false here because the browser subscription IS gone (or we tried).
        // Returning false would make the UI think it's still ON, which is confusing if we just killed the browser sub.
      }
    }

    return true;
  } catch (error) {
    logger.error('Error unsubscribing from push notifications:', error);
    return false;
  }
}

/**
 * Check if user is subscribed to push notifications
 */
export async function isPushSubscribed(): Promise<boolean> {
  if (!isPushNotificationSupported()) {
    return false;
  }

  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    return subscription !== null;
  } catch (error) {
    logger.error('Error checking push subscription:', error);
    return false;
  }
}

/**
 * Convert VAPID key from base64 to Uint8Array
 */
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding)
    .replace(/\-/g, '+')
    .replace(/_/g, '/');

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }

  return outputArray;
}

/**
 * Test push notification
 */
export async function sendTestPushNotification(userId: string): Promise<boolean> {
  try {
    const { data, error } = await supabase.functions.invoke('send-push-notification', {
      body: {
        userId,
        title: 'Teste de Notificação',
        body: 'Esta é uma notificação de teste do PlaniFlow',
        icon: '/icon-192.png',
        badge: '/favicon.png',
      },
    });

    if (error) {
      logger.error('Error sending test push notification:', error);
      return false;
    }

    logger.info('Test push notification sent successfully', data);
    return true;
  } catch (error) {
    logger.error('Error sending test push notification:', error);
    return false;
  }
}
