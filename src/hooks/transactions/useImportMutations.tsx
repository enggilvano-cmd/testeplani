import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { ImportTransactionData } from '@/types';
import { logger } from '@/lib/logger';
import { queryKeys } from '@/lib/queryClient';
import { getErrorMessage } from '@/lib/errorUtils';

type DetectedTransferPair = {
  expense: ImportTransactionData;
  income: ImportTransactionData;
};

function detectTransferPairs(transactions: ImportTransactionData[]) {
  const pairs: DetectedTransferPair[] = [];
  const usedIndexes = new Set<number>();

  logger.info('[Pair Detection] Iniciando análise de transferências:', {
    totalTransactions: transactions.length,
    details: transactions.map((t, i) => ({
      index: i,
      type: t.type,
      account_id: t.account_id,
      to_account_id: t.to_account_id,
      amount: t.amount,
      date: t.date,
      description: t.description
    }))
  });

  // Estratégia: Qualquer EXPENSE ou TRANSFER com to_account_id é uma saída de transferência
  // que deve gerar AMBOS os lados via atomic-transfer
  // Pareamos com qualquer INCOME correspondente para evitar duplicação
  transactions.forEach((expenseData, expenseIndex) => {
    if (usedIndexes.has(expenseIndex)) return;

    // Procurar por EXPENSE/TRANSFER com conta destino (saída de transferência)
    const isTransferOutgoing = Boolean(expenseData.to_account_id) && 
                              (expenseData.type === 'transfer' || expenseData.type === 'expense');
    
    if (!isTransferOutgoing) {
      logger.info(`[Pair Detection] [${expenseIndex}] Pulando: tipo=${expenseData.type}, to_account_id=${expenseData.to_account_id}`);
      return;
    }

    logger.info(`[Pair Detection] [${expenseIndex}] Encontrada possível saída: ${expenseData.description}`);

    // Procurar por INCOME correspondente (opcional - pode ou não existir no arquivo)
    const incomeIndex = transactions.findIndex((incomeData, index) => {
      if (usedIndexes.has(index) || index === expenseIndex) return false;
      if (incomeData.type !== 'income') return false;

      const accountMatch = incomeData.account_id === expenseData.to_account_id;
      const amountMatch = incomeData.amount === expenseData.amount;
      const dateMatch = incomeData.date === expenseData.date;
      const noDestination = !incomeData.to_account_id;

      logger.info(`[Pair Detection] [${expenseIndex}] Checando income [${index}]:`, {
        desc: incomeData.description,
        account_match: accountMatch,
        amount_match: amountMatch,
        date_match: dateMatch,
        no_destination: noDestination,
        all_match: accountMatch && amountMatch && dateMatch && noDestination
      });

      // Match: receita na conta destino, mesmo valor e data (ou sem to_account_id)
      return (
        accountMatch &&
        amountMatch &&
        dateMatch &&
        noDestination
      );
    });

    usedIndexes.add(expenseIndex);
    if (incomeIndex !== -1) {
      logger.info(`[Pair Detection] ✅ PAR ENCONTRADO: [${expenseIndex}] + [${incomeIndex}]`);
      usedIndexes.add(incomeIndex);
    } else {
      logger.info(`[Pair Detection] ⚠️ Nenhuma receita correspondente para [${expenseIndex}] - será criada via atomic-transfer`);
    }
    
    pairs.push({ 
      expense: expenseData, 
      income: incomeIndex !== -1 ? transactions[incomeIndex] : {
        // Se não encontrar receita, criar um "espelho" imaginário com os dados
        description: expenseData.description,
        amount: expenseData.amount,
        date: expenseData.date,
        type: 'income',
        account_id: expenseData.to_account_id!,
        status: expenseData.status,
        category: 'Transferência'
      } as ImportTransactionData
    });
  });

  logger.info('[Pair Detection] Resultado final:', {
    paresEncontrados: pairs.length,
    detalhes: pairs.map(p => ({
      from_account: p.expense.account_id,
      to_account: p.expense.to_account_id,
      amount: p.expense.amount
    }))
  });

  const remaining = transactions.filter((_, index) => !usedIndexes.has(index));
  logger.info('[Pair Detection] Linhas restantes:', {
    count: remaining.length,
    detalhes: remaining.map(t => ({
      type: t.type,
      description: t.description,
      account_id: t.account_id,
      to_account_id: t.to_account_id
    }))
  });

  return { pairs, remaining };
}

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

      // 3. Agrupar parcelas antes de importar
      const installmentGroups = new Map<string, ImportTransactionData[]>();
      const nonInstallmentTransactions: ImportTransactionData[] = [];

      transactionsData.forEach((data) => {
        if (data.installments && data.current_installment && data.installments > 1) {
          // Criar chave única baseada em descrição base, conta, valor
          const descBase = data.description.replace(/\s*-\s*Parcela\s*\d+.*$/i, '').trim();
          const groupKey = `${descBase}|${data.account_id}|${data.amount}|${data.installments}`;
          
          if (!installmentGroups.has(groupKey)) {
            installmentGroups.set(groupKey, []);
          }
          installmentGroups.get(groupKey)!.push(data);
        } else {
          nonInstallmentTransactions.push(data);
        }
      });

      // Ordenar parcelas dentro de cada grupo
      installmentGroups.forEach((group) => {
        group.sort((a, b) => (a.current_installment || 0) - (b.current_installment || 0));
      });

      logger.info('[Import] Análise de parcelamentos:', {
        totalLinhas: transactionsData.length,
        gruposParcelados: installmentGroups.size,
        transacoesSimples: nonInstallmentTransactions.length
      });

      // 4. Importar transações (com pareamento automático de transferências)
      const { pairs: inferredTransferPairs, remaining: transactionsToProcess } = detectTransferPairs(nonInstallmentTransactions);

      logger.info('[Import] Pareamento de transferências:', {
        totalLinhas: nonInstallmentTransactions.length,
        paresEncontrados: inferredTransferPairs.length,
        linhasRestantes: transactionsToProcess.length,
        detalhes: inferredTransferPairs.map((p, i) => ({
          index: i,
          from_account: p.expense.account_id,
          to_account: p.expense.to_account_id,
          amount: p.expense.amount,
          date: p.expense.date,
          desc_out: p.expense.description,
          desc_in: p.income.description,
        }))
      });

      if (inferredTransferPairs.length > 0) {
        logger.info('[Import] Transferências inferidas para vincular automaticamente:', {
          count: inferredTransferPairs.length
        });
      }

      const inferredTransfersPromises = inferredTransferPairs.map(async (pair) => {
        const status = pair.expense.status === 'pending' || pair.income.status === 'pending'
          ? 'pending'
          : (pair.expense.status || pair.income.status || 'completed');

        logger.info('[Import] Vinculando transferência inferida:', {
          from: pair.expense.account_id,
          to: pair.income.account_id,
          amount: pair.expense.amount,
          description_out: pair.expense.description,
          description_in: pair.income.description
        });

        const result = await supabase.functions.invoke('atomic-transfer', {
          body: {
            transfer: {
              from_account_id: pair.expense.account_id,
              to_account_id: pair.income.account_id,
              amount: pair.expense.amount,
              date: pair.expense.date,
              outgoing_description: pair.expense.description,
              incoming_description: pair.income.description,
              status,
            }
          }
        });

        if (result.error) {
          logger.error('[Import] Erro ao vincular transferência inferida:', result.error);
        } else {
          logger.info('[Import] Transferência inferida vinculada com sucesso:', result.data);
        }

        return { ...result, transactionData: pair.expense, createdCount: result.error ? 0 : 2 };
      });

      // Processar grupos de parcelas
      const installmentGroupsPromises = Array.from(installmentGroups.values()).map(async (group) => {
        if (group.length === 0) return { createdCount: 0 };
        
        const category_id = group[0].category ? categoryMap.get(group[0].category) || null : null;
        let parent_transaction_id: string | null = null;
        let createdCount = 0;

        for (const data of group) {
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
            logger.error('[Import] Erro ao criar parcela:', { error: result.error, data });
            return { ...result, transactionData: data, createdCount };
          }

          const responseData = result.data as { transaction?: { id: string } };
          const transactionId = responseData?.transaction?.id;

          if (transactionId) {
            // A primeira parcela define o parent_transaction_id
            if (!parent_transaction_id) {
              parent_transaction_id = transactionId;
            }

            const updates: Record<string, unknown> = {
              installments: data.installments,
              current_installment: data.current_installment,
              parent_transaction_id: parent_transaction_id
            };

            if (data.invoice_month) {
              updates.invoice_month = data.invoice_month;
              updates.invoice_month_overridden = true;
            }
            
            if (data.is_fixed !== undefined) updates.is_fixed = data.is_fixed;
            if (data.is_provision !== undefined) updates.is_provision = data.is_provision;

            const { error: updateError } = await supabase
              .from('transactions')
              .update(updates)
              .eq('id', transactionId);

            if (updateError) {
              logger.error('[Import] Erro ao atualizar metadados da parcela:', updateError);
            } else {
              createdCount++;
            }
          }
        }

        logger.info('[Import] Grupo de parcelas processado:', {
          totalParcelas: group.length,
          criadas: createdCount,
          parent_id: parent_transaction_id
        });

        return { createdCount };
      });

      const singleTransactionsPromises = transactionsToProcess.map(async (data) => {
        const category_id = data.category ? categoryMap.get(data.category) || null : null;

        // IMPORTANTE: Despesas/receitas normais (sem to_account_id)
        // Receitas com to_account_id (conta destino) NÃO devem chegar aqui
        if (!data.to_account_id && (data.type === 'income' || data.type === 'expense')) {
          // Transação simples, criar normalmente
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
            return { ...result, transactionData: data, createdCount: 0 };
          }

          // Se tem parcelas ou invoice_month ou outros campos extras, atualizar
          const responseData = result.data as { transaction?: { id: string } };
          const transactionId = responseData?.transaction?.id;

          if (transactionId) {
            const updates: Record<string, unknown> = {};
            
            if (data.installments) updates.installments = data.installments;
            if (data.current_installment) updates.current_installment = data.current_installment;
            if (data.invoice_month) {
              updates.invoice_month = data.invoice_month;
              updates.invoice_month_overridden = true;
            }
            
            // Novos campos para fidelidade 100%
            if (data.to_account_id) updates.to_account_id = data.to_account_id;
            if (data.is_fixed !== undefined) updates.is_fixed = data.is_fixed;
            if (data.is_provision !== undefined) updates.is_provision = data.is_provision;

            if (Object.keys(updates).length > 0) {
              const { error: updateError } = await supabase
                .from('transactions')
                .update(updates)
                .eq('id', transactionId);

              if (updateError) {
                logger.error('Error updating transaction metadata:', updateError);
              }
            }
          }

          return { ...result, transactionData: data, createdCount: 1 };
        } else {
          // Transação não reconhecida (receita com to_account_id ou outro tipo)
          logger.warn('[Import] Transação ignorada (tipo não suportado):', {
            type: data.type,
            to_account_id: data.to_account_id,
            description: data.description
          });
          return { error: 'Tipo de transação não suportado neste contexto', transactionData: data, createdCount: 0 };
        }
      });

      const results = await Promise.all([
        ...inferredTransfersPromises,
        ...installmentGroupsPromises,
        ...singleTransactionsPromises,
      ]);

      const createdTransactionsCount = results.reduce((total, current) => total + (current.createdCount ?? 0), 0);

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
        description: `${createdTransactionsCount} transações importadas${transactionsToReplace.length > 0 ? ` (${transactionsToReplace.length} substituídas)` : ''} com sucesso`,
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
