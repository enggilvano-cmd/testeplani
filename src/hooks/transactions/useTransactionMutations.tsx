import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { TransactionInput, TransactionUpdate } from '@/types';
import { logger } from '@/lib/logger';
import { queryKeys } from '@/lib/queryClient';
import { EditScope } from '@/components/TransactionScopeDialog';
import { getErrorMessage } from '@/lib/errorUtils';

export function useTransactionMutations() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const handleAddTransaction = useCallback(async (transactionData: TransactionInput) => {
    if (!user) return;
    try {
      const { error } = await supabase.functions.invoke('atomic-transaction', {
        body: {
          transaction: {
            description: transactionData.description,
            amount: transactionData.amount,
            date: transactionData.date.toISOString().split('T')[0],
            type: transactionData.type,
            category_id: transactionData.category_id,
            account_id: transactionData.account_id,
            status: transactionData.status,
            invoice_month: transactionData.invoiceMonth || null,
            invoice_month_overridden: !!transactionData.invoiceMonth,
          }
        }
      });

      if (error) {
        const errorMessage = getErrorMessage(error);
        if (errorMessage.includes('Credit limit exceeded')) {
          const match = errorMessage.match(/Available: ([\d.-]+).*Limit: ([\d.]+).*Used: ([\d.]+).*Requested: ([\d.]+)/);
          
          let friendlyMessage = 'Limite do cartão de crédito excedido. ';
          if (match) {
            const available = (parseFloat(match[1]) / 100).toFixed(2);
            const limit = (parseFloat(match[2]) / 100).toFixed(2);
            const used = (parseFloat(match[3]) / 100).toFixed(2);
            const requested = (parseFloat(match[4]) / 100).toFixed(2);
            
            friendlyMessage += `Disponível: R$ ${available} | Limite: R$ ${limit} | Usado: R$ ${used} | Solicitado: R$ ${requested}`;
          } else {
            friendlyMessage += 'Reduza o valor da transação, aumente o limite do cartão ou faça um pagamento.';
          }
          
          toast({
            title: 'Limite de crédito excedido',
            description: friendlyMessage,
            variant: 'destructive',
          });
          return;
        }
        throw error;
      }

      // ✅ Invalidação imediata dispara refetch automático sem delay
      queryClient.invalidateQueries({ queryKey: queryKeys.transactionsBase });
      queryClient.invalidateQueries({ queryKey: queryKeys.accounts });
    } catch (error: unknown) {
      logger.error('Error adding transaction:', error);
      const errorMessage = getErrorMessage(error);
      toast({
        title: 'Erro',
        description: errorMessage,
        variant: 'destructive',
      });
      throw error;
    }
  }, [user, queryClient, toast]);

  const handleEditTransaction = useCallback(async (
    updatedTransaction: TransactionUpdate,
    editScope?: EditScope
  ) => {
    if (!user) return;
    try {
      const updates: Partial<TransactionUpdate> = {};
      
      if (updatedTransaction.description !== undefined) {
        updates.description = updatedTransaction.description;
      }
      if (updatedTransaction.amount !== undefined) {
        updates.amount = updatedTransaction.amount;
      }
      if (updatedTransaction.date !== undefined) {
        updates.date = typeof updatedTransaction.date === 'string'
          ? updatedTransaction.date
          : updatedTransaction.date.toISOString().split('T')[0];
      }
      if (updatedTransaction.type !== undefined) {
        updates.type = updatedTransaction.type;
      }
      if (updatedTransaction.category_id !== undefined) {
        updates.category_id = updatedTransaction.category_id;
      }
      if (updatedTransaction.account_id !== undefined) {
        updates.account_id = updatedTransaction.account_id;
      }
      if (updatedTransaction.status !== undefined) {
        updates.status = updatedTransaction.status;
      }
      if (updatedTransaction.invoice_month !== undefined) {
        updates.invoice_month = updatedTransaction.invoice_month || null;
      }

      const { error } = await supabase.functions.invoke('atomic-edit-transaction', {
        body: {
          transaction_id: updatedTransaction.id,
          updates,
          scope: editScope || 'current',
        }
      });

      if (error) throw error;

      // ✅ Invalidação imediata dispara refetch automático sem delay
      queryClient.invalidateQueries({ queryKey: queryKeys.transactionsBase });
      queryClient.invalidateQueries({ queryKey: queryKeys.accounts });
    } catch (error: unknown) {
      logger.error('Error updating transaction:', error);
      const errorMessage = getErrorMessage(error);
      toast({
        title: 'Erro',
        description: errorMessage,
        variant: 'destructive',
      });
      throw error;
    }
  }, [user, queryClient, toast]);

  const handleDeleteTransaction = useCallback(async (
    transactionId: string,
    editScope?: EditScope
  ) => {
    if (!user) return;

    try {
      // Usar função SQL atômica diretamente para evitar falhas de Edge Function / rate limit
      const { data: rpcData, error } = await supabase.rpc('atomic_delete_transaction', {
        p_user_id: user.id,
        p_transaction_id: transactionId,
        p_scope: editScope || 'current',
      });

      if (error) {
        const errorMessage = getErrorMessage(error);
        throw new Error(errorMessage || 'Erro ao excluir transação');
      }

      const record = rpcData && Array.isArray(rpcData)
        ? (rpcData[0] as { deleted_count?: number; success?: boolean; error_message?: string })
        : null;

      if (!record || record.success === false) {
        throw new Error(record?.error_message || 'Transação não encontrada ou já foi excluída');
      }

      // ✅ Invalidação imediata dispara refetch automático sem delay
      queryClient.invalidateQueries({ queryKey: queryKeys.transactionsBase });
      queryClient.invalidateQueries({ queryKey: queryKeys.accounts });

      toast({
        title: 'Sucesso',
        description: `${record.deleted_count ?? 1} transação(ões) excluída(s)`,
      });
    } catch (error: unknown) {
      logger.error('Error deleting transaction:', error);
      const errorMessage = getErrorMessage(error);

      toast({
        title: 'Erro ao excluir',
        description: errorMessage,
        variant: 'destructive',
      });
      throw error;
    }
  }, [user, queryClient, toast]);
 
  return {
    handleAddTransaction,
    handleEditTransaction,
    handleDeleteTransaction,
  };
}
