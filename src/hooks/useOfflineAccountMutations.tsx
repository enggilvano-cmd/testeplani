import { useCallback } from 'react';
import { useOnlineStatus } from './useOnlineStatus';
import { offlineQueue } from '@/lib/offlineQueue';
import { offlineDatabase } from '@/lib/offlineDatabase';
import { useToast } from '@/hooks/use-toast';
import { logger } from '@/lib/logger';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/queryClient';
import { getErrorMessage } from '@/types/errors';
import { Account } from '@/types';

export function useOfflineAccountMutations() {
  const isOnline = useOnlineStatus();
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const processOfflineAdd = useCallback(async (accountData: any) => {
    try {
      const tempId = `temp-${Date.now()}`;
      const newAccount: Account = {
        id: tempId,
        user_id: user?.id || 'offline-user',
        name: accountData.name,
        type: accountData.type,
        balance: accountData.balance || 0,
        color: accountData.color || '#6b7280',
        limit_amount: accountData.limit_amount,
        due_date: accountData.due_date,
        closing_date: accountData.closing_date,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      // 1. Queue operation
      await offlineQueue.enqueue({
        type: 'add_account',
        data: accountData,
      });

      // 2. Update local DB (Optimistic UI)
      await offlineDatabase.saveAccounts([newAccount]);

      // 3. Update React Query Cache
      queryClient.setQueryData<Account[]>(queryKeys.accounts, (old) => {
        return [newAccount, ...(old || [])];
      });

      toast({
        title: 'Conta criada offline',
        description: 'Será sincronizada quando você voltar online.',
        duration: 3000,
      });

      logger.info('Account add queued for offline sync');
    } catch (error) {
      logger.error('Failed to queue account add:', error);
      toast({
        title: 'Erro',
        description: 'Não foi possível registrar a conta offline.',
        variant: 'destructive',
      });
      throw error;
    }
  }, [user, queryClient, toast]);

  const handleAddAccount = useCallback(async (accountData: {
    name: string;
    type: 'checking' | 'savings' | 'credit' | 'investment';
    balance?: number;
    color?: string;
    limit_amount?: number;
    due_date?: number;
    closing_date?: number;
  }) => {
    if (isOnline) {
      // Online: usar lógica normal
      if (!user) return;
      try {
        const { error } = await supabase
          .from('accounts')
          .insert({
            name: accountData.name,
            type: accountData.type,
            balance: accountData.balance || 0,
            color: accountData.color || '#6b7280',
            limit_amount: accountData.limit_amount,
            due_date: accountData.due_date,
            closing_date: accountData.closing_date,
            user_id: user.id,
          });

        if (error) throw error;

        queryClient.invalidateQueries({ queryKey: queryKeys.accounts });
        toast({
          title: 'Sucesso',
          description: 'Conta criada com sucesso',
        });
      } catch (error: unknown) {
        const message = getErrorMessage(error);
        if (message.toLowerCase().includes('failed to fetch') || 
            message.toLowerCase().includes('network request failed') ||
            message.toLowerCase().includes('connection error')) {
          logger.warn('Network error during account creation, falling back to offline mode');
          await processOfflineAdd(accountData);
          return;
        }

        logger.error('Error adding account:', error);
        toast({
          title: 'Erro',
          description: message || 'Erro ao criar conta',
          variant: 'destructive',
        });
        throw error;
      }
      return;
    }

    await processOfflineAdd(accountData);
  }, [isOnline, user, queryClient, toast, processOfflineAdd]);

  const processOfflineEdit = useCallback(async (accountId: string, accountData: any) => {
    try {
      // 1. Queue operation
      await offlineQueue.enqueue({
        type: 'edit_account',
        data: {
          account_id: accountId,
          updates: accountData,
        }
      });

      // 2. Update local DB (Optimistic UI)
      const existingAccounts = await offlineDatabase.getAccounts(user?.id || '');
      const accountToUpdate = existingAccounts.find(a => a.id === accountId);
      
      if (accountToUpdate) {
        const updatedAccount = { ...accountToUpdate, ...accountData, updated_at: new Date().toISOString() };
        await offlineDatabase.saveAccounts([updatedAccount]);

        // 3. Update React Query Cache
        queryClient.setQueryData<Account[]>(queryKeys.accounts, (old) => {
          if (!old) return old;
          return old.map(acc => acc.id === accountId ? updatedAccount : acc);
        });
      }

      toast({
        title: 'Edição registrada offline',
        description: 'Será sincronizada quando você voltar online.',
        duration: 3000,
      });

      logger.info('Account edit queued for offline sync');
    } catch (error) {
      logger.error('Failed to queue account edit:', error);
      toast({
        title: 'Erro',
        description: 'Não foi possível registrar a edição offline.',
        variant: 'destructive',
      });
      throw error;
    }
  }, [user, queryClient, toast]);

  const handleEditAccount = useCallback(async (accountId: string, accountData: {
    name?: string;
    type?: 'checking' | 'savings' | 'credit' | 'investment';
    balance?: number;
    color?: string;
    limit_amount?: number;
    due_date?: number;
    closing_date?: number;
  }) => {
    if (isOnline) {
      // Online: usar lógica normal
      if (!user) return;
      try {
        const { error } = await supabase
          .from('accounts')
          .update(accountData)
          .eq('id', accountId)
          .eq('user_id', user.id);

        if (error) throw error;

        queryClient.invalidateQueries({ queryKey: queryKeys.accounts });
        toast({
          title: 'Sucesso',
          description: 'Conta atualizada com sucesso',
        });
      } catch (error: unknown) {
        const message = getErrorMessage(error);
        if (message.toLowerCase().includes('failed to fetch') || 
            message.toLowerCase().includes('network request failed') ||
            message.toLowerCase().includes('connection error')) {
          logger.warn('Network error during account update, falling back to offline mode');
          await processOfflineEdit(accountId, accountData);
          return;
        }

        logger.error('Error updating account:', error);
        toast({
          title: 'Erro',
          description: message || 'Erro ao atualizar conta',
          variant: 'destructive',
        });
        throw error;
      }
      return;
    }

    await processOfflineEdit(accountId, accountData);
  }, [isOnline, user, queryClient, toast, processOfflineEdit]);

  const processOfflineDelete = useCallback(async (accountId: string) => {
    try {
      // 1. Queue operation
      await offlineQueue.enqueue({
        type: 'delete_account',
        data: {
          account_id: accountId,
        }
      });

      // 2. Update React Query Cache (Optimistic UI)
      queryClient.setQueryData<Account[]>(queryKeys.accounts, (old) => {
        if (!old) return old;
        return old.filter(acc => acc.id !== accountId);
      });

      toast({
        title: 'Exclusão registrada offline',
        description: 'Será sincronizada quando você voltar online.',
        duration: 3000,
      });

      logger.info('Account deletion queued for offline sync');
    } catch (error) {
      logger.error('Failed to queue account deletion:', error);
      toast({
        title: 'Erro',
        description: 'Não foi possível registrar a exclusão offline.',
        variant: 'destructive',
      });
      throw error;
    }
  }, [queryClient, toast]);

  const handleDeleteAccount = useCallback(async (accountId: string) => {
    if (isOnline) {
      // Online: usar lógica normal
      if (!user) return;
      try {
        const { error } = await supabase
          .from('accounts')
          .delete()
          .eq('id', accountId)
          .eq('user_id', user.id);

        if (error) throw error;

        queryClient.invalidateQueries({ queryKey: queryKeys.accounts });
        toast({
          title: 'Sucesso',
          description: 'Conta excluída com sucesso',
        });
      } catch (error: unknown) {
        const message = getErrorMessage(error);
        if (message.toLowerCase().includes('failed to fetch') || 
            message.toLowerCase().includes('network request failed') ||
            message.toLowerCase().includes('connection error')) {
          logger.warn('Network error during account deletion, falling back to offline mode');
          await processOfflineDelete(accountId);
          return;
        }

        logger.error('Error deleting account:', error);
        toast({
          title: 'Erro',
          description: message || 'Erro ao excluir conta',
          variant: 'destructive',
        });
        throw error;
      }
      return;
    }

    await processOfflineDelete(accountId);
  }, [isOnline, user, queryClient, toast, processOfflineDelete]);

  const handleImportAccounts = useCallback(async (accountsData: any[], accountsToReplace: string[] = []) => {
    if (isOnline) {
      // Online: usar lógica normal
      if (!user) return;
      try {
        // Deletar contas que serão substituídas
        if (accountsToReplace.length > 0) {
          const { error: deleteError } = await supabase
            .from('accounts')
            .delete()
            .in('id', accountsToReplace)
            .eq('user_id', user.id);

          if (deleteError) throw deleteError;
        }

        // Inserir novas contas
        const accountsToAdd = accountsData.map(acc => ({
          name: acc.name,
          type: acc.type,
          balance: acc.balance || 0,
          color: acc.color || '#6b7280',
          limit_amount: acc.limit_amount,
          due_date: acc.due_date,
          closing_date: acc.closing_date,
          user_id: user.id,
        }));

        const { error } = await supabase
          .from('accounts')
          .insert(accountsToAdd);

        if (error) throw error;

        queryClient.invalidateQueries({ queryKey: queryKeys.accounts });
        toast({
          title: 'Sucesso',
          description: `${accountsToAdd.length} contas importadas com sucesso`,
        });
      } catch (error: unknown) {
        logger.error('Error importing accounts:', error);
        toast({
          title: 'Erro',
          description: getErrorMessage(error) || 'Erro ao importar contas',
          variant: 'destructive',
        });
        throw error;
      }
      return;
    }

    // Offline: enqueue import accounts operation
    try {
      await offlineQueue.enqueue({
        type: 'import_accounts',
        data: {
          accounts: accountsData,
          replace_ids: accountsToReplace,
        }
      });

      toast({
        title: 'Importação registrada',
        description: 'Será sincronizada quando você voltar online.',
        duration: 3000,
      });

      logger.info('Accounts import queued for offline sync');
    } catch (error) {
      logger.error('Failed to queue accounts import:', error);
      toast({
        title: 'Erro',
        description: 'Não foi possível registrar a importação offline.',
        variant: 'destructive',
      });
      throw error;
    }
  }, [isOnline, user, queryClient, toast]);

  return {
    handleAddAccount,
    handleEditAccount,
    handleDeleteAccount,
    handleImportAccounts,
  };
}
