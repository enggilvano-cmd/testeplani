import { useCallback } from 'react';
import { useImportMutations } from './useImportMutations';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import { offlineQueue } from '@/lib/offlineQueue';
import { useToast } from '@/hooks/use-toast';
import { logger } from '@/lib/logger';
import { ImportTransactionData } from '@/types';

export function useOfflineImportMutations() {
  const isOnline = useOnlineStatus();
  const onlineMutations = useImportMutations();
  const { toast } = useToast();

  const handleImportTransactions = useCallback(async (
    transactionsData: ImportTransactionData[],
    transactionsToReplace: string[] = []
  ) => {
    if (isOnline) {
      return onlineMutations.handleImportTransactions(transactionsData, transactionsToReplace);
    }

    // Offline: enqueue import transactions operation
    try {
      await offlineQueue.enqueue({
        type: 'import_transactions',
        data: {
          transactions: transactionsData,
          replace_ids: transactionsToReplace,
        }
      });

      toast({
        title: 'Importação registrada',
        description: 'Será sincronizada quando você voltar online.',
        duration: 3000,
      });

      logger.info('Transactions import queued for offline sync');
    } catch (error) {
      logger.error('Failed to queue transactions import:', error);
      toast({
        title: 'Erro',
        description: 'Não foi possível registrar a importação offline.',
        variant: 'destructive',
      });
      throw error;
    }
  }, [isOnline, onlineMutations, toast]);

  return {
    handleImportTransactions,
  };
}
