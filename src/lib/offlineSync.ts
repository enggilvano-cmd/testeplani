import { offlineQueue, QueuedOperation } from './offlineQueue';
import { offlineDatabase } from './offlineDatabase';
import { supabase } from '@/integrations/supabase/client';
import { logger } from './logger';
import type { Transaction, Account, Category } from '@/types';
import { toast } from 'sonner';

const MAX_RETRIES = 5;
const SYNC_MONTHS = 6;

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

        for (const operation of operations) {
          try {
            await this.syncOperation(operation);
            await offlineQueue.dequeue(operation.id);
            successCount++;
          } catch (error) {
            logger.error(`Failed to sync operation ${operation.id}:`, error);
            failCount++;
            
            if (operation.retries >= MAX_RETRIES) {
              toast.error(`Não foi possível sincronizar: ${operation.type}`);
              // Removemos da fila para não travar o app eternamente
              await offlineQueue.dequeue(operation.id);
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

      // Transactions
      const { data: transactions } = await supabase
        .from('transactions')
        .select('*')
        .eq('user_id', user.id)
        .gte('date', dateFrom)
        .order('date', { ascending: false });

      if (transactions) {
        await offlineDatabase.syncTransactions(transactions as Transaction[], user.id, dateFrom);
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

    } catch (error) {
      logger.error('Failed to sync data from server:', error);
    }
  }

  private async syncOperation(operation: QueuedOperation): Promise<void> {
    const { data: { user } } = await supabase.auth.getUser();
    
    // Safety check: só logout pode ser feito sem user
    if (!user && operation.type !== 'logout') {
        throw new Error('User not authenticated for sync');
    }

    let payload = { ...operation.data };
    
    // Helper para identificar ID temporário
    const isTempId = (id: any) => typeof id === 'string' && id.startsWith('temp-');

    // Remove ID temporário antes de enviar ao Supabase (para que ele gere um oficial)
    if (['transaction', 'add_account', 'add_category'].includes(operation.type)) {
       if (isTempId(payload.id)) {
           delete payload.id; 
       }
    }

    switch (operation.type) {
      case 'transaction':
        await supabase.functions.invoke('atomic-transaction', { body: { transaction: payload } });
        break;

      case 'edit':
        if (isTempId(payload.id)) {
             // Se estamos tentando editar algo que tem ID temp, significa que a criação falhou ou ainda não rodou.
             // Não podemos enviar 'temp-123' pro servidor.
             logger.warn('Skipping edit for temporary ID', payload);
             return; 
        }
        await supabase.functions.invoke('atomic-edit-transaction', { body: payload });
        break;

      case 'delete':
        if (isTempId(payload.id)) {
            // Deletar algo que nem existe no servidor = sucesso imediato.
            return;
        }
        await supabase.rpc('atomic_delete_transaction', {
          p_user_id: user!.id,
          p_transaction_id: payload.id
        });
        break;

      case 'transfer':
        if (payload.origin_transaction_id && isTempId(payload.origin_transaction_id)) delete payload.origin_transaction_id;
        if (payload.destination_transaction_id && isTempId(payload.destination_transaction_id)) delete payload.destination_transaction_id;
        await supabase.functions.invoke('atomic-transfer', { body: { transfer: payload } });
        break;

      case 'add_account':
        await supabase.from('accounts').insert({ ...payload, user_id: user!.id });
        break;
      
      case 'edit_account':
        if (isTempId(payload.account_id)) return;
        await supabase.from('accounts').update(payload.updates).eq('id', payload.account_id);
        break;

      case 'delete_account':
        if (isTempId(payload.account_id)) return;
        await supabase.from('accounts').delete().eq('id', payload.account_id);
        break;

      case 'add_category':
        await supabase.from('categories').insert({ ...payload, user_id: user!.id });
        break;

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

        const createdIds = [];

        for (const transaction of transactions) {
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
            await supabase.functions.invoke('atomic-delete-transaction', {
              body: { transaction_id: txId, scope: 'current' }
            });
          }
        }

        const localCategories = await offlineDatabase.getCategories(user!.id);
        const categoryMap = new Map<string, string>(
          localCategories.map(cat => [cat.name, cat.id])
        );

        for (const transaction of transactions) {
          const category_id = transaction.category ? categoryMap.get(transaction.category) || null : null;
          
          if (transaction.category && !category_id) {
             logger.warn(`Category "${transaction.category}" not found locally. Skipping transaction import for "${transaction.description}".`);
             continue; // Pula esta transação
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
        for (const account of accounts) {
          try {
            const { error } = await supabase
              .from('accounts')
              .insert({
                ...account,
                user_id: user!.id,
              });

            if (error) throw error;
            successCount++;
          } catch (err) {
            logger.warn(`Failed to import account "${account.name}":`, err);
            // Continue com próximas contas em vez de falhar toda a operação
          }
        }

        if (successCount === 0) {
          throw new Error('Nenhuma conta foi importada com sucesso');
        }

        logger.info(`Successfully imported ${successCount}/${accounts.length} accounts`);
        break;
      }

      default:
        logger.warn(`Operation type ${operation.type} not fully implemented in sync.`);
    }
  }
}

export const offlineSync = new OfflineSyncManager();