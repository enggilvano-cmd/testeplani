// Push notification utilities for service worker integration
import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/lib/logger';

// VAPID public key for push notifications
// This will be generated and stored as a secret
const VAPID_PUBLIC_KEY = 'YOUR_VAPID_PUBLIC_KEY_HERE';

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
 * Subscribe to push notifications
 */
export async function subscribeToPushNotifications(userId: string): Promise<PushSubscriptionData | null> {
  if (!isPushNotificationSupported()) {
    logger.warn('Push notifications are not supported');
    return null;
  }

  try {
    // Get service worker registration
    const registration = await navigator.serviceWorker.ready;

    // Check if already subscribed
    let subscription = await registration.pushManager.getSubscription();

    // If not subscribed, create new subscription
    if (!subscription) {
      const permission = await requestPushNotificationPermission();
      if (!permission) {
        logger.warn('Push notification permission denied');
        return null;
      }

      // Subscribe to push notifications
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as BufferSource,
      });
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
    const { error } = await supabase
      .from('push_subscriptions')
      .upsert({
        user_id: userId,
        endpoint: pushData.endpoint,
        p256dh: pushData.keys.p256dh,
        auth: pushData.keys.auth,
      }, {
        onConflict: 'endpoint'
      });

    if (error) {
      logger.error('Error saving push subscription:', error);
      return null;
    }

    logger.info('Push notification subscription successful');
    return pushData;
  } catch (error) {
    logger.error('Error subscribing to push notifications:', error);
    return null;
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
      await subscription.unsubscribe();

      // Remove from database
      const { error } = await supabase
        .from('push_subscriptions')
        .delete()
        .eq('user_id', userId)
        .eq('endpoint', subscription.endpoint);

      if (error) {
        logger.error('Error removing push subscription from database:', error);
        return false;
      }
    }

    logger.info('Push notification unsubscription successful');
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
