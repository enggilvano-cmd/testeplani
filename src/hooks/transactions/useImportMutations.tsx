import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { ImportTransactionData } from '@/types';
import { logger } from '@/lib/logger';
import { queryKeys } from '@/lib/queryClient';
import { getErrorMessage } from '@/lib/errorUtils';

export function useImportMutations() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const handleImportTransactions = useCallback(async (
    transactionsData: ImportTransactionData[],
    transactionsToReplace: string[] = []
  ) => {
    if (!user) return;
    try {
      // 1. Deletar transações que serão substituídas
      if (transactionsToReplace.length > 0) {
        await Promise.all(
          transactionsToReplace.map(txId =>
            supabase.functions.invoke('atomic-delete-transaction', {
              body: {
                transaction_id: txId,
                scope: 'current',
              }
            })
          )
        );
      }

      // 2. Batch lookup de categorias
      const uniqueCategoryNames = [...new Set(
        transactionsData
          .filter(data => data.category)
          .map(data => data.category!)
      )];

      const { data: existingCategories } = await supabase
        .from('categories')
        .select('id, name')
        .eq('user_id', user.id)
        .in('name', uniqueCategoryNames);

      const categoryMap = new Map<string, string>(
        existingCategories?.map(cat => [cat.name, cat.id]) || []
      );

      const categoriesToCreate = uniqueCategoryNames.filter(
        name => !categoryMap.has(name)
      );

      if (categoriesToCreate.length > 0) {
        const { data: newCategories } = await supabase
          .from('categories')
          .insert(
            categoriesToCreate.map(name => {
              const sampleTransaction = transactionsData.find(
                data => data.category === name
              );
              const categoryType: 'income' | 'expense' | 'both' = 
                sampleTransaction?.type === 'income' ? 'income' : 'expense';
              
              return {
                name,
                user_id: user.id,
                type: categoryType,
              };
            })
          )
          .select('id, name');

        newCategories?.forEach(cat => {
          categoryMap.set(cat.name, cat.id);
        });
      }

      // 3. Importar transações
      const results = await Promise.all(
        transactionsData.map(async (data) => {
          const category_id = data.category ? categoryMap.get(data.category) || null : null;

          // Criar transação base
          const result = await supabase.functions.invoke('atomic-transaction', {
            body: {
              transaction: {
                description: data.description,
                amount: data.amount,
                date: data.date,
                type: data.type,
                category_id: category_id,
                account_id: data.account_id,
                status: data.status || 'completed',
              }
            }
          });

          if (result.error) {
            return { ...result, transactionData: data };
          }

          // Se tem parcelas ou invoice_month, atualizar os campos extras
          const responseData = result.data as { transaction?: { id: string } };
          const transactionId = responseData?.transaction?.id;

          if (transactionId && (data.installments || data.current_installment || data.invoice_month)) {
            const updates: Record<string, unknown> = {};
            
            if (data.installments) updates.installments = data.installments;
            if (data.current_installment) updates.current_installment = data.current_installment;
            if (data.invoice_month) {
              updates.invoice_month = data.invoice_month;
              updates.invoice_month_overridden = true;
            }

            const { error: updateError } = await supabase
              .from('transactions')
              .update(updates)
              .eq('id', transactionId);

            if (updateError) {
              logger.error('Error updating transaction metadata:', updateError);
            }
          }

          return { ...result, transactionData: data };
        })
      );

      const errors = results.filter(r => r.error);
      if (errors.length > 0) {
        const firstError = errors[0].error;
        const errorMessage = getErrorMessage(firstError);
        
        if (errorMessage.includes('Credit limit exceeded')) {
          const match = errorMessage.match(/Available: ([\d.-]+).*Limit: ([\d.]+).*Used: ([\d.]+).*Requested: ([\d.]+)/);
          
          let friendlyMessage = 'Limite do cartão de crédito excedido durante importação. ';
          if (match) {
            const available = (parseFloat(match[1]) / 100).toFixed(2);
            const limit = (parseFloat(match[2]) / 100).toFixed(2);
            const used = (parseFloat(match[3]) / 100).toFixed(2);
            
            friendlyMessage += `Disponível: R$ ${available} | Limite: R$ ${limit} | Usado: R$ ${used}. Ajuste os valores ou aumente o limite do cartão.`;
          } else {
            friendlyMessage += 'Verifique os valores das transações e o limite do cartão.';
          }
          
          toast({
            title: 'Limite de crédito excedido',
            description: friendlyMessage,
            variant: 'destructive',
          });
          return;
        }
        throw firstError;
      }

      // ✅ Invalidação imediata dispara refetch automático sem delay
      queryClient.invalidateQueries({ queryKey: queryKeys.transactionsBase });
      queryClient.invalidateQueries({ queryKey: queryKeys.accounts });
      
      toast({
        title: 'Importação concluída',
        description: `${results.length} transações importadas${transactionsToReplace.length > 0 ? ` (${transactionsToReplace.length} substituídas)` : ''} com sucesso`,
      });
    } catch (error: unknown) {
      logger.error('Error importing transactions:', error);
      const errorMessage = getErrorMessage(error);
      toast({
        title: 'Erro na importação',
        description: errorMessage,
        variant: 'destructive',
      });
      throw error;
    }
  }, [user, queryClient, toast]);

  return {
    handleImportTransactions,
  };
}
