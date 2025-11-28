import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { Account, ImportAccountData } from '@/types';
import { logger } from '@/lib/logger';
import { queryKeys } from '@/lib/queryClient';
import { importAccountSchema } from '@/lib/validationSchemas';
import { z } from 'zod';
import { getErrorMessage } from '@/types/errors';

export function useAccountHandlers() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const handleEditAccount = useCallback(async (updatedAccount: Account) => {
    if (!user) return;
    try {
      const { error } = await supabase
        .from('accounts')
        .update(updatedAccount)
        .eq('id', updatedAccount.id)
        .eq('user_id', user.id);
      if (error) throw error;
      
      queryClient.invalidateQueries({ queryKey: queryKeys.accounts });
      
      toast({
        title: 'Sucesso',
        description: 'Conta atualizada com sucesso',
      });
    } catch (error: unknown) {
      logger.error('Error updating account:', error);
      toast({
        title: 'Erro',
        description: getErrorMessage(error) || 'Erro ao atualizar conta',
        variant: 'destructive',
      });
      throw error;
    }
  }, [user, queryClient, toast]);

  const handleDeleteAccount = useCallback(async (accountId: string) => {
    if (!user) return;
    try {
      // CRITICAL: Verificar se há transações vinculadas antes de deletar
      const { data: transactions, error: checkError } = await supabase
        .from('transactions')
        .select('id', { count: 'exact', head: true })
        .eq('account_id', accountId)
        .limit(1);

      if (checkError) throw checkError;

      // Se há transações, bloquear exclusão
      if (transactions && transactions.length > 0) {
        toast({
          title: 'Não é possível excluir',
          description: 'Esta conta possui transações vinculadas. Exclua as transações primeiro ou transfira-as para outra conta.',
          variant: 'destructive',
        });
        return;
      }

      // Verificar se é conta destino em transferências
      const { data: transfers, error: transferCheckError } = await supabase
        .from('transactions')
        .select('id', { count: 'exact', head: true })
        .eq('to_account_id', accountId)
        .limit(1);

      if (transferCheckError) throw transferCheckError;

      if (transfers && transfers.length > 0) {
        toast({
          title: 'Não é possível excluir',
          description: 'Esta conta é destino de transferências. Exclua as transferências primeiro.',
          variant: 'destructive',
        });
        return;
      }

      // Se passou nas verificações, pode deletar
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
      logger.error('Error deleting account:', error);
      toast({
        title: 'Erro',
        description: getErrorMessage(error) || 'Erro ao excluir conta',
        variant: 'destructive',
      });
      throw error;
    }
  }, [user, toast, queryClient]);

  const handleImportAccounts = useCallback(async (
    accountsData: ImportAccountData[],
    accountsToReplace: string[] = []
  ) => {
    if (!user) return;
    try {
      logger.debug('[ImportAccounts] handleImportAccounts chamado', {
        totalAccounts: accountsData.length,
        accountsToReplace: accountsToReplace.length,
        firstAccountSample: accountsData[0]
      });

      // 1. Validar cada conta usando Zod schema
      const validatedAccounts: ImportAccountData[] = [];
      const validationErrors: string[] = [];

      for (let i = 0; i < accountsData.length; i++) {
        const result = importAccountSchema.safeParse(accountsData[i]);
        if (!result.success) {
          logger.error(`[ImportAccounts] Validação falhou na linha ${i + 1}:`, {
            data: accountsData[i],
            errors: result.error.errors
          });
          validationErrors.push(
            `Linha ${i + 1}: ${result.error.errors.map((e: z.ZodIssue) => e.message).join(', ')}`
          );
        } else {
          validatedAccounts.push(result.data);
        }
      }

      if (validationErrors.length > 0) {
        logger.error('[ImportAccounts] Erros de validação encontrados:', {
          totalErrors: validationErrors.length,
          errors: validationErrors
        });
        toast({
          title: 'Erro de validação',
          description: validationErrors.slice(0, 3).join('; ') + 
                      (validationErrors.length > 3 ? `... e mais ${validationErrors.length - 3} erros` : ''),
          variant: 'destructive',
        });
        throw new Error('Dados inválidos na importação');
      }

      logger.debug('[ImportAccounts] Todas as contas validadas com sucesso:', {
        validatedCount: validatedAccounts.length
      });

      // 2. Deletar contas que serão substituídas
      if (accountsToReplace.length > 0) {
        const { error: deleteError } = await supabase
          .from('accounts')
          .delete()
          .in('id', accountsToReplace)
          .eq('user_id', user.id);
        
        if (deleteError) throw deleteError;
      }

      // 3. Inserir novas contas validadas
      const accountsToAdd = validatedAccounts.map(acc => ({
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
        description: `${accountsToAdd.length} contas importadas${accountsToReplace.length > 0 ? ` (${accountsToReplace.length} substituídas)` : ''} com sucesso!`,
      });
    } catch (error: unknown) {
      logger.error('Error importing accounts:', error);
      const errorMsg = getErrorMessage(error);
      if (errorMsg !== 'Dados inválidos na importação') {
        toast({
          title: 'Erro',
          description: errorMsg || 'Erro ao importar contas.',
          variant: 'destructive'
        });
      }
      throw error;
    }
  }, [user, toast, queryClient]);

  return {
    handleEditAccount,
    handleDeleteAccount,
    handleImportAccounts,
  };
}
