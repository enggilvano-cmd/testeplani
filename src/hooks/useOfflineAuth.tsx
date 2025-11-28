import { useCallback } from 'react';
import { useAuth } from './useAuth';
import { useOnlineStatus } from './useOnlineStatus';
import { offlineQueue } from '@/lib/offlineQueue';
import { offlineDatabase } from '@/lib/offlineDatabase';
import { useToast } from '@/hooks/use-toast';
import { logger } from '@/lib/logger';

export function useOfflineAuth() {
  const isOnline = useOnlineStatus();
  const auth = useAuth();
  const { toast } = useToast();

  const signOut = useCallback(async () => {
    if (isOnline) {
      return auth.signOut();
    }

    // Offline: enqueue logout operation
    try {
      await offlineQueue.enqueue({
        type: 'logout',
        data: {}
      });

      // Clear local database immediately
      await offlineDatabase.clearAll();

      // Clear local session immediately
      window.location.href = '/auth';

      
      return { error: null };
    } catch (error) {
      logger.error('Failed to queue logout:', error);
      toast({
        title: 'Erro',
        description: 'Não foi possível fazer logout offline',
        variant: 'destructive',
      });
      return { error: error as any };
    }
  }, [isOnline, auth, toast]);

  return {
    ...auth,
    signOut,
    isOnline,
  };
}
