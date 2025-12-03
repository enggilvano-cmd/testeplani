import { offlineQueue, QueuedOperation } from './offlineQueue';
import { offlineDatabase } from './offlineDatabase';
import { supabase } from '@/integrations/supabase/client';
import { logger } from './logger';
import type { Transaction, Account, Category } from '@/types';
import { toast } from 'sonner';
import { queryClient, queryKeys } from './queryClient';

const MAX_RETRIES = 5;
const SYNC_MONTHS = 12; // Aligned with useTransactions.tsx (1 year history)

class OfflineSyncManager {
  private isSyncing = false;

  async syncAll(): Promise<void> {
    if (this.isSyncing || !navigator.onLine) return;

    this.isSyncing = true;
    logger.info('Starting offline sync...');

    try {
      // 1. Processar Fila de Operações Pendentes
      const operations = await offlineQueue.getAll();
      
      if (operations.length > 0) {
        logger.info(`Syncing ${operations.length} queued operations`);
        operations.sort((a, b) => a.timestamp - b.timestamp);

        let successCount = 0;
        let failCount = 0;
        const tempIdMap = new Map<string, string>(); // Map<TempID, RealID>

        for (const operation of operations) {
          // Skip operations that have already failed permanently
          if (operation.status === 'failed') continue;

          try {
            await this.syncOperation(operation, tempIdMap);
            await offlineQueue.dequeue(operation.id);
            successCount++;
          } catch (error: any) {
            logger.error(`Failed to sync operation ${operation.id}:`, error);
            failCount++;
            
            if (operation.retries >= MAX_RETRIES) {
              const errorMessage = error?.message || 'Unknown error';
              toast.error(`Falha permanente ao sincronizar: ${operation.type}. Verifique os logs.`);
              
              // CRITICAL FIX: Mark as failed instead of removing
              // This prevents data loss. The user (or a future UI) can decide what to do.
              await offlineQueue.markAsFailed(operation.id, errorMessage);
            } else {
              await offlineQueue.updateRetries(operation.id, operation.retries + 1);
            }
          }
        }
        
        if (successCount > 0) toast.success(`${successCount} operações sincronizadas.`);
        if (failCount > 0) logger.warn(`${failCount} operações falharam no sync.`);
      }

      // 2. Baixar Dados Atualizados do Servidor (Sync Down)
      await this.syncDataFromServer();
      
    } catch (e) {
      logger.error('Critical sync error:', e);
    } finally {
      this.isSyncing = false;
    }
  }

  async syncDataFromServer(): Promise<void> {
    if (!navigator.onLine) return;

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const cutoffDate = new Date();
      cutoffDate.setMonth(cutoffDate.getMonth() - SYNC_MONTHS);
      const dateFrom = cutoffDate.toISOString().split('T')[0];

      // Transactions - Fetch all with pagination to avoid data loss
      let allTransactions: Transaction[] = [];
      let page = 0;
      const pageSize = 1000;
      let hasMore = true;

      while (hasMore) {
        const { data: pageData, error } = await supabase
          .from('transactions')
          .select('*')
          .eq('user_id', user.id)
          .gte('date', dateFrom)
          .order('date', { ascending: false })
          .range(page * pageSize, (page + 1) * pageSize - 1);

        if (error) throw error;

        if (pageData && pageData.length > 0) {
          allTransactions = [...allTransactions, ...(pageData as Transaction[])];
          if (pageData.length < pageSize) {
            hasMore = false;
          } else {
            page++;
          }
        } else {
          hasMore = false;
        }
      }

      if (allTransactions.length > 0) {
        await offlineDatabase.syncTransactions(allTransactions, user.id, dateFrom);
      } else if (page === 0) {
        // Only sync empty if we really got no data on the first page (and no error)
        // This handles the case where the user deleted everything on another device
        await offlineDatabase.syncTransactions([], user.id, dateFrom);
      }

      // Fixed Transactions (Sync separado para garantir que todas sejam baixadas, independente da data)
      const { data: fixedTransactions } = await supabase
        .from('transactions')
        .select('*')
        .eq('user_id', user.id)
        .eq('is_fixed', true)
        .is('parent_transaction_id', null);

      if (fixedTransactions) {
        // Salvar transações fixas no banco local e remover as que foram excluídas
        await offlineDatabase.syncFixedTransactions(fixedTransactions as Transaction[], user.id);
      }

      // Accounts
      const { data: accounts } = await supabase
        .from('accounts')
        .select('*')
        .eq('user_id', user.id);

      if (accounts) {
        // Conversão de tipos se necessário (limit_amount vs limit)
        const mappedAccounts = accounts.map(acc => ({
          ...acc,
          limit: acc.limit_amount || 0,
        })) as unknown as Account[];
        await offlineDatabase.syncAccounts(mappedAccounts, user.id);
      }

      // Categories
      const { data: categories } = await supabase
        .from('categories')
        .select('*')
        .eq('user_id', user.id);

      if (categories) {
        await offlineDatabase.syncCategories(categories as Category[], user.id);
      }

      await offlineDatabase.setLastSync('full-sync', Date.now());

      // ✅ Invalidate queries to update UI with fresh data (from DB or Server)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.transactionsBase }),
        queryClient.invalidateQueries({ queryKey: queryKeys.accounts }),
        queryClient.invalidateQueries({ queryKey: queryKeys.categories }),
      ]);

    } catch (error) {
      logger.error('Failed to sync data from server:', error);
    }
  }

  private async syncOperation(operation: QueuedOperation, tempIdMap: Map<string, string>): Promise<void> {
    const { data: { user } } = await supabase.auth.getUser();
    
    // Safety check: só logout pode ser feito sem user
    if (!user && operation.type !== 'logout') {
        throw new Error('User not authenticated for sync');
    }

    let payload = { ...operation.data };
    
    // Helper para identificar ID temporário
    const isTempId = (id: any) => typeof id === 'string' && id.startsWith('temp-');

    // === DEPENDENCY RESOLUTION ===
    // Resolve IDs using the map (replace temp IDs with real IDs from previous operations in this batch)
    if (payload.id && tempIdMap.has(payload.id)) payload.id = tempIdMap.get(payload.id);
    if (payload.account_id && tempIdMap.has(payload.account_id)) payload.account_id = tempIdMap.get(payload.account_id);
    if (payload.category_id && tempIdMap.has(payload.category_id)) payload.category_id = tempIdMap.get(payload.category_id);
    if (payload.to_account_id && tempIdMap.has(payload.to_account_id)) payload.to_account_id = tempIdMap.get(payload.to_account_id);
    if (payload.transaction_id && tempIdMap.has(payload.transaction_id)) payload.transaction_id = tempIdMap.get(payload.transaction_id);
    if (payload.parent_transaction_id && tempIdMap.has(payload.parent_transaction_id)) payload.parent_transaction_id = tempIdMap.get(payload.parent_transaction_id);
    if (payload.p_transaction_id && tempIdMap.has(payload.p_transaction_id)) payload.p_transaction_id = tempIdMap.get(payload.p_transaction_id);
    
    // Also check inside 'updates' object for edits
    if (payload.updates) {
      if (payload.updates.account_id && tempIdMap.has(payload.updates.account_id)) payload.updates.account_id = tempIdMap.get(payload.updates.account_id);
      if (payload.updates.category_id && tempIdMap.has(payload.updates.category_id)) payload.updates.category_id = tempIdMap.get(payload.updates.category_id);
    }

    // Capture the temp ID before deleting it (for mapping later)
    const originalTempId = isTempId(payload.id) ? payload.id : null;

    // Remove ID temporário antes de enviar ao Supabase (para que ele gere um oficial)
    if (['transaction', 'add_account', 'add_category'].includes(operation.type)) {
       if (isTempId(payload.id)) {
           delete payload.id; 
       }
    }

    switch (operation.type) {
      case 'transaction': {
        const { data: rpcData, error } = await supabase.functions.invoke('atomic-transaction', { body: { transaction: payload } });
        if (error) throw error;
        
        // Capture new ID and update map
        const responseData = rpcData as { transaction?: { id: string } };
        if (originalTempId && responseData?.transaction?.id) {
            tempIdMap.set(originalTempId, responseData.transaction.id);
        }
        break;
      }

      case 'edit':
        if (isTempId(payload.id) || isTempId(payload.transaction_id)) {
             // Se ainda é temp ID aqui, significa que não foi resolvido (criação falhou ou não estava no batch)
             logger.warn('Skipping edit for unresolved temporary ID', payload);
             return; 
        }
        await supabase.functions.invoke('atomic-edit-transaction', { body: payload });
        break;

      case 'delete':
        if (isTempId(payload.id) || isTempId(payload.p_transaction_id)) {
            // Deletar algo que nem existe no servidor = sucesso imediato.
            return;
        }
        await supabase.rpc('atomic_delete_transaction', {
          p_user_id: user!.id,
          p_transaction_id: payload.p_transaction_id || payload.id // Handle both naming conventions
        });
        break;

      case 'transfer':
        if (payload.origin_transaction_id && isTempId(payload.origin_transaction_id)) delete payload.origin_transaction_id;
        if (payload.destination_transaction_id && isTempId(payload.destination_transaction_id)) delete payload.destination_transaction_id;
        await supabase.functions.invoke('atomic-transfer', { body: { transfer: payload } });
        break;

      case 'add_account': {
        const { data, error } = await supabase.from('accounts').insert({ ...payload, user_id: user!.id }).select().single();
        if (error) throw error;
        
        if (originalTempId && data?.id) {
            tempIdMap.set(originalTempId, data.id);
        }
        break;
      }
      
      case 'edit_account':
        if (isTempId(payload.account_id)) return;
        await supabase.from('accounts').update(payload.updates).eq('id', payload.account_id);
        break;

      case 'delete_account':
        if (isTempId(payload.account_id)) return;
        await supabase.from('accounts').delete().eq('id', payload.account_id);
        break;

      case 'add_category': {
        const { data, error } = await supabase.from('categories').insert({ ...payload, user_id: user!.id }).select().single();
        if (error) throw error;
        
        if (originalTempId && data?.id) {
            tempIdMap.set(originalTempId, data.id);
        }
        break;
      }

      case 'edit_category':
        if (isTempId(payload.category_id)) return;
        await supabase.from('categories').update(payload.updates).eq('id', payload.category_id);
        break;
      
      case 'delete_category':
        if (isTempId(payload.category_id)) return;
        await supabase.from('categories').delete().eq('id', payload.category_id);
        break;

      case 'logout':
        await supabase.auth.signOut();
        await offlineDatabase.clearAll();
        break;

      case 'credit_payment':
         await supabase.functions.invoke('atomic-pay-bill', { body: payload });
         break;
         
      case 'add_fixed_transaction':
         if (isTempId(payload.id)) delete payload.id;
         await supabase.functions.invoke('atomic-create-fixed', { body: { transaction: payload } });
         break;

      case 'add_installments': {
        const { transactions, total_installments } = payload;
        if (!transactions || !Array.isArray(transactions)) {
          throw new Error('Invalid payload for add_installments');
        }

        // Resume from previous attempt if available
        const createdIds: string[] = payload.created_ids || [];
        let hasUpdates = false;

        for (let i = 0; i < transactions.length; i++) {
          // Skip if already created
          if (i < createdIds.length) continue;

          const transaction = transactions[i];
          
          // @ts-ignore
          const { data: rpcData, error } = await supabase.rpc('atomic_create_transaction', {
            p_user_id: user!.id,
            p_description: transaction.description,
            p_amount: transaction.amount,
            p_date: transaction.date,
            p_type: transaction.type,
            p_category_id: transaction.category_id,
            p_account_id: transaction.account_id,
            p_status: transaction.status,
            p_invoice_month: transaction.invoice_month ?? undefined,
            p_invoice_month_overridden: !!transaction.invoice_month,
          });

          if (error) throw error;

          const record = rpcData && Array.isArray(rpcData) ? rpcData[0] as { transaction_id?: string; success?: boolean; error_message?: string } : null;

          if (!record || record.success === false) {
            throw new Error(record?.error_message || 'Erro ao criar transação parcelada no sync');
          }
          
          if(record.transaction_id) {
            createdIds.push(record.transaction_id);
            hasUpdates = true;
            
            // Save progress after each successful creation to ensure idempotency
            // If we crash, next time we skip this index
            await offlineQueue.updateData(operation.id, {
              ...payload,
              created_ids: createdIds
            });
          }
        }

        if (createdIds.length !== total_installments) {
          logger.error('Mismatch between offline installments created and expected', {
            expected: total_installments,
            created: createdIds.length,
          });
          throw new Error('Erro ao registrar metadados das parcelas no sync');
        }

        const parentId = createdIds[0];
        const updatePromises = createdIds.map((id, index) =>
          supabase
            .from('transactions')
            .update({
              installments: total_installments,
              current_installment: index + 1,
              parent_transaction_id: parentId,
            })
            .eq('id', id)
        );

        const updateResults = await Promise.all(updatePromises);
        const updateErrors = updateResults.filter(r => r.error);
        if (updateErrors.length > 0) {
          logger.error('Error updating installment metadata in sync:', updateErrors[0].error);
          throw updateErrors[0].error;
        }

        break;
      }

      case 'import_transactions': {
        const { transactions, replace_ids = [] } = payload;
        if (!transactions || !Array.isArray(transactions)) {
          throw new Error('Invalid payload for import_transactions');
        }

        if (replace_ids.length > 0) {
          for (const txId of replace_ids) {
            try {
              await supabase.functions.invoke('atomic-delete-transaction', {
                body: { transaction_id: txId, scope: 'current' }
              });
            } catch (e) {
              logger.warn(`Failed to delete replaced transaction ${txId} during import sync`, e);
            }
          }
        }

        const localCategories = await offlineDatabase.getCategories(user!.id);
        const categoryMap = new Map<string, string>(
          localCategories.map(cat => [cat.name, cat.id])
        );

        let successCount = 0;
        let failCount = 0;
        const errors: string[] = [];

        for (const transaction of transactions) {
          try {
            const category_id = transaction.category ? categoryMap.get(transaction.category) || null : null;
            
            if (transaction.category && !category_id) {
               logger.warn(`Category "${transaction.category}" not found locally. Skipping transaction import for "${transaction.description}".`);
               failCount++;
               continue; 
            }

            const { data: rpcData, error } = await supabase.functions.invoke('atomic-transaction', {
              body: {
                transaction: {
                  description: transaction.description,
                  amount: transaction.amount,
                  date: transaction.date,
                  type: transaction.type,
                  category_id: category_id,
                  account_id: transaction.account_id,
                  status: transaction.status || 'completed',
                }
              }
            });

            if (error) throw error;
            
            const responseData = rpcData as { transaction?: { id: string } };
            const transactionId = responseData?.transaction?.id;

            if (transactionId && (transaction.installments || transaction.current_installment || transaction.invoice_month)) {
               const updates: Record<string, unknown> = {};
               if (transaction.installments) updates.installments = transaction.installments;
               if (transaction.current_installment) updates.current_installment = transaction.current_installment;
               if (transaction.invoice_month) {
                 updates.invoice_month = transaction.invoice_month;
                 updates.invoice_month_overridden = true;
               }
               await supabase.from('transactions').update(updates).eq('id', transactionId);
            }
            successCount++;
          } catch (err: any) {
            logger.error(`Failed to import transaction "${transaction.description}":`, err);
            failCount++;
            errors.push(err.message || 'Unknown error');
          }
        }

        if (successCount === 0 && failCount > 0) {
          throw new Error(`Todas as ${failCount} transações falharam na importação. Erros: ${errors.slice(0, 3).join(', ')}`);
        }

        if (failCount > 0) {
          logger.warn(`Importação parcial: ${successCount} sucessos, ${failCount} falhas.`);
          // Não lançamos erro aqui para não travar a fila, já que algumas passaram.
          // Idealmente, notificaríamos o usuário, mas no sync background isso é complexo.
        }
        break;
      }
      
      case 'import_categories': {
        const { categories } = payload;
        if (!categories || !Array.isArray(categories)) {
          throw new Error('Invalid payload for import_categories');
        }

        let successCount = 0;
        for (const category of categories) {
          try {
            const { error } = await supabase
              .from('categories')
              .insert({
                ...category,
                user_id: user!.id,
              });

            if (error) throw error;
            successCount++;
          } catch (err) {
            logger.warn(`Failed to import category "${category.name}":`, err);
            // Continue com próximas categorias em vez de falhar toda a operação
          }
        }

        if (successCount === 0) {
          throw new Error('Nenhuma categoria foi importada com sucesso');
        }

        logger.info(`Successfully imported ${successCount}/${categories.length} categories`);
        break;
      }

      case 'import_accounts': {
        const { accounts } = payload;
        if (!accounts || !Array.isArray(accounts)) {
          throw new Error('Invalid payload for import_accounts');
        }

        let successCount = 0;
        const createdAccounts: Account[] = [];

        for (const account of accounts) {
          try {
            const { data, error } = await supabase
              .from('accounts')
              .insert({
                ...account,
                user_id: user!.id,
              })
              .select()
              .single();

            if (error) throw error;
            if (data) createdAccounts.push(data as unknown as Account);
            successCount++;
          } catch (err) {
            logger.warn(`Failed to import account "${account.name}":`, err);
            // Continue com próximas contas em vez de falhar toda a operação
          }
        }

        // Create Initial Balance Transactions for imported accounts
        if (createdAccounts.length > 0) {
            const initialBalanceTransactions = createdAccounts
                .filter(acc => acc.balance !== 0)
                .map(acc => {
                    const isIncome = acc.balance > 0;
                    const amount = Math.abs(acc.balance);
                    return {
                        user_id: user!.id,
                        description: 'Saldo Inicial',
                        amount: isIncome ? amount : -amount,
                        date: new Date().toISOString().split('T')[0],
                        type: isIncome ? 'income' : 'expense',
                        account_id: acc.id,
                        status: 'completed',
                        category_id: null
                    };
                });
            
            if (initialBalanceTransactions.length > 0) {
                const { error: txError } = await supabase
                    .from('transactions')
                    .insert(initialBalanceTransactions);
                
                if (txError) {
                    logger.error('Failed to create initial balance transactions for imported accounts in sync', txError);
                }
            }
        }

        if (successCount === 0) {
          throw new Error('Nenhuma conta foi importada com sucesso');
        }

        logger.info(`Successfully imported ${successCount}/${accounts.length} accounts`);
        break;
      }

      case 'clear_all_data':
        await supabase.from("transactions").delete().eq("user_id", user!.id);
        await supabase.from("accounts").delete().eq("user_id", user!.id);
        await supabase.from("categories").delete().eq("user_id", user!.id);
        break;

      default:
        logger.warn(`Operation type ${operation.type} not fully implemented in sync.`);
    }
  }
}

export const offlineSync = new OfflineSyncManager();