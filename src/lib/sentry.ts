import * as Sentry from '@sentry/react';
import { useEffect } from 'react';
import { useLocation, useNavigationType, createRoutesFromChildren, matchRoutes } from 'react-router-dom';

export const initSentry = () => {
  const dsn = import.meta.env.VITE_SENTRY_DSN;
  
  // Only initialize if DSN is provided and not in development
  if (!dsn || import.meta.env.DEV) {
    // Sentry not initialized in development or without DSN
    return;
  }

  Sentry.init({
    dsn,
    integrations: [
      Sentry.browserTracingIntegration(),
      Sentry.replayIntegration({
        maskAllText: true,
        blockAllMedia: true,
      }),
      Sentry.reactRouterV6BrowserTracingIntegration({
        useEffect,
        useLocation,
        useNavigationType,
        createRoutesFromChildren,
        matchRoutes,
      }),
    ],
    
    // Performance Monitoring
    tracesSampleRate: 1.0, // Capture 100% of transactions in production
    
    // Session Replay
    replaysSessionSampleRate: 0.1, // Sample 10% of sessions
    replaysOnErrorSampleRate: 1.0, // Capture 100% of sessions with errors
    
    // Environment
    environment: import.meta.env.MODE,
    
    // Release tracking
    release: import.meta.env.VITE_APP_VERSION || 'unknown',
    
    // Before send hook to add additional context
    beforeSend(event) {
      // Filter out development errors
      if (import.meta.env.DEV) {
        return null;
      }
      
      // Add custom tags
      event.tags = {
        ...event.tags,
        app_version: import.meta.env.VITE_APP_VERSION || 'unknown',
      };
      
      return event;
    },
  });
};

// Helper to set user context
export const setSentryUser = (user: { id: string; email?: string; username?: string; role?: string } | null) => {
  if (user) {
    Sentry.setUser({
      id: user.id,
      email: user.email,
      username: user.username || user.email,
      role: user.role,
    });
  } else {
    Sentry.setUser(null);
  }
};

// Helper to add breadcrumb
export const addSentryBreadcrumb = (message: string, category: string, level: Sentry.SeverityLevel = 'info', data?: Record<string, unknown>) => {
  Sentry.addBreadcrumb({
    message,
    category,
    level,
    data,
    timestamp: Date.now() / 1000,
  });
};

// Helper to capture exception manually
export const captureException = (error: Error, context?: Record<string, unknown>) => {
  Sentry.captureException(error, {
    extra: context,
  });
};

// Helper to capture message
export const captureMessage = (message: string, level: Sentry.SeverityLevel = 'info', context?: Record<string, unknown>) => {
  Sentry.captureMessage(message, {
    level,
    extra: context,
  });
};

// Helper to set context
export const setSentryContext = (key: string, context: Record<string, unknown>) => {
  Sentry.setContext(key, context);
};
