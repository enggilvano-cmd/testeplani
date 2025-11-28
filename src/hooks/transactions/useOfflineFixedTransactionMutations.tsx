import { useCallback } from 'react';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import { offlineQueue } from '@/lib/offlineQueue';
import { useToast } from '@/hooks/use-toast';
import { logger } from '@/lib/logger';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/queryClient';
import { getErrorMessage } from '@/types/errors';

export function useOfflineFixedTransactionMutations() {
  const isOnline = useOnlineStatus();
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const handleAddFixedTransaction = useCallback(async (transactionData: {
    description: string;
    amount: number;
    date: string;
    type: 'income' | 'expense';
    category_id: string;
    account_id: string;
    status: 'pending' | 'completed';
  }) => {
    if (isOnline) {
      // Online: usar edge function
      if (!user) return;
      try {
        const { data, error } = await supabase.functions.invoke('atomic-create-fixed', {
          body: {
            transaction: transactionData,
          }
        });

        if (error) throw error;

        queryClient.invalidateQueries({ queryKey: queryKeys.transactionsBase });
        queryClient.invalidateQueries({ queryKey: queryKeys.accounts });
        
        toast({
          title: 'Sucesso',
          description: 'Transação fixa criada com sucesso',
        });

        return data;
      } catch (error: unknown) {
        logger.error('Error adding fixed transaction:', error);
        toast({
          title: 'Erro',
          description: getErrorMessage(error) || 'Erro ao criar transação fixa',
          variant: 'destructive',
        });
        throw error;
      }
      return;
    }

    // Offline: enqueue fixed transaction
    try {
      await offlineQueue.enqueue({
        type: 'add_fixed_transaction',
        data: transactionData,
      });

      toast({
        title: 'Transação fixa registrada',
        description: 'Será sincronizada quando você voltar online.',
        duration: 3000,
      });

      logger.info('Fixed transaction queued for offline sync');
    } catch (error) {
      logger.error('Failed to queue fixed transaction:', error);
      toast({
        title: 'Erro',
        description: 'Não foi possível registrar a transação fixa offline.',
        variant: 'destructive',
      });
      throw error;
    }
  }, [isOnline, user, queryClient, toast]);

  const handleEditFixedTransaction = useCallback(async (
    transactionId: string,
    updates: any,
    scope: 'current' | 'current-and-remaining' | 'all' = 'current'
  ) => {
    if (isOnline) {
      // Online: usar edge function
      if (!user) return;
      try {
        const { error } = await supabase.functions.invoke('atomic-edit-transaction', {
          body: {
            transaction_id: transactionId,
            updates,
            scope,
          }
        });

        if (error) throw error;

        queryClient.invalidateQueries({ queryKey: queryKeys.transactionsBase });
        queryClient.invalidateQueries({ queryKey: queryKeys.accounts });
        
        toast({
          title: 'Sucesso',
          description: 'Transação fixa atualizada com sucesso',
        });
      } catch (error: unknown) {
        logger.error('Error editing fixed transaction:', error);
        toast({
          title: 'Erro',
          description: getErrorMessage(error) || 'Erro ao editar transação fixa',
          variant: 'destructive',
        });
        throw error;
      }
      return;
    }

    // Offline: enqueue edit fixed transaction
    try {
      await offlineQueue.enqueue({
        type: 'edit',
        data: {
          transaction_id: transactionId,
          updates,
          scope,
        }
      });

      toast({
        title: 'Edição registrada',
        description: 'Será sincronizada quando você voltar online.',
        duration: 3000,
      });

      logger.info('Fixed transaction edit queued for offline sync');
    } catch (error) {
      logger.error('Failed to queue fixed transaction edit:', error);
      toast({
        title: 'Erro',
        description: 'Não foi possível registrar a edição offline.',
        variant: 'destructive',
      });
      throw error;
    }
  }, [isOnline, user, queryClient, toast]);

  const handleDeleteFixedTransaction = useCallback(async (
    transactionId: string,
    scope: 'current' | 'current-and-remaining' | 'all' = 'current'
  ) => {
    if (isOnline) {
      // Online: usar edge function
      if (!user) return;
      try {
        const { error } = await supabase.functions.invoke('atomic-delete-transaction', {
          body: {
            transaction_id: transactionId,
            scope,
          }
        });

        if (error) throw error;

        queryClient.invalidateQueries({ queryKey: queryKeys.transactionsBase });
        queryClient.invalidateQueries({ queryKey: queryKeys.accounts });
        
        toast({
          title: 'Sucesso',
          description: 'Transação fixa excluída com sucesso',
        });
      } catch (error: unknown) {
        logger.error('Error deleting fixed transaction:', error);
        toast({
          title: 'Erro',
          description: getErrorMessage(error) || 'Erro ao excluir transação fixa',
          variant: 'destructive',
        });
        throw error;
      }
      return;
    }

    // Offline: enqueue delete fixed transaction
    try {
      await offlineQueue.enqueue({
        type: 'delete',
        data: {
          transaction_id: transactionId,
          scope,
        }
      });

      toast({
        title: 'Exclusão registrada',
        description: 'Será sincronizada quando você voltar online.',
        duration: 3000,
      });

      logger.info('Fixed transaction deletion queued for offline sync');
    } catch (error) {
      logger.error('Failed to queue fixed transaction deletion:', error);
      toast({
        title: 'Erro',
        description: 'Não foi possível registrar a exclusão offline.',
        variant: 'destructive',
      });
      throw error;
    }
  }, [isOnline, user, queryClient, toast]);

  return {
    handleAddFixedTransaction,
    handleEditFixedTransaction,
    handleDeleteFixedTransaction,
  };
}
