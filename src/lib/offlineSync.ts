import { offlineQueue, QueuedOperation } from './offlineQueue';
import { offlineDatabase } from './offlineDatabase';
import { supabase } from '@/integrations/supabase/client';
import { logger } from './logger';
import type { Transaction, Account, Category } from '@/types';

const MAX_RETRIES = 3;
const SYNC_MONTHS = 3;

class OfflineSyncManager {
  private isSyncing = false;

  async syncAll(): Promise<void> {
    if (this.isSyncing) {
      logger.info('Sync already in progress, skipping...');
      return;
    }

    this.isSyncing = true;
    logger.info('Starting offline sync...');

    try {
      const operations = await offlineQueue.getAll();
      
      if (operations.length === 0) {
        logger.info('No operations to sync');
        return;
      }

      logger.info(`Syncing ${operations.length} queued operations`);

      // Sort by timestamp to maintain order
      operations.sort((a, b) => a.timestamp - b.timestamp);

      for (const operation of operations) {
        try {
          await this.syncOperation(operation);
          await offlineQueue.dequeue(operation.id);
        } catch (error) {
          logger.error(`Failed to sync operation ${operation.id}:`, error);
          
          if (operation.retries >= MAX_RETRIES) {
            logger.warn(`Max retries reached for operation ${operation.id}, removing from queue`);
            await offlineQueue.dequeue(operation.id);
          } else {
            await offlineQueue.updateRetries(operation.id, operation.retries + 1);
          }
        }
      }

      logger.info('Offline sync completed');
      
      // After syncing operations, pull fresh data from server
      await this.syncDataFromServer();
    } finally {
      this.isSyncing = false;
    }
  }

  async syncDataFromServer(): Promise<void> {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        logger.warn('No user found for data sync');
        return;
      }

      logger.info('Syncing data from server...');

      // Calculate date range (last 3 months)
      const cutoffDate = new Date();
      cutoffDate.setMonth(cutoffDate.getMonth() - SYNC_MONTHS);
      const dateFrom = cutoffDate.toISOString().split('T')[0];

      // Fetch and cache transactions
      const { data: transactions } = await supabase
        .from('transactions')
        .select('*')
        .eq('user_id', user.id)
        .gte('date', dateFrom)
        .order('date', { ascending: false });

      if (transactions) {
        await offlineDatabase.saveTransactions(transactions as Transaction[]);
      }

      // Fetch and cache accounts
      const { data: accounts } = await supabase
        .from('accounts')
        .select('*')
        .eq('user_id', user.id);

      if (accounts) {
        const mappedAccounts = accounts.map(acc => ({
          ...acc,
          limit: acc.limit_amount,
        })) as Account[];
        await offlineDatabase.saveAccounts(mappedAccounts);
      }

      // Fetch and cache categories
      const { data: categories } = await supabase
        .from('categories')
        .select('*')
        .eq('user_id', user.id);

      if (categories) {
        await offlineDatabase.saveCategories(categories as Category[]);
      }

      // Update last sync timestamp
      await offlineDatabase.setLastSync('full-sync', Date.now());

      logger.info('Data sync from server completed');
    } catch (error) {
      logger.error('Failed to sync data from server:', error);
    }
  }

  private async syncOperation(operation: QueuedOperation): Promise<void> {
    logger.info(`Syncing operation: ${operation.type}`, operation.data);

    switch (operation.type) {
      case 'transaction':
        await supabase.functions.invoke('atomic-transaction', {
          body: { transaction: operation.data }
        });
        break;

      case 'edit':
        await supabase.functions.invoke('atomic-edit-transaction', {
          body: operation.data
        });
        break;

      case 'delete':
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          throw new Error('User not authenticated for offline delete sync');
        }
        await supabase.rpc('atomic_delete_transaction', {
          p_user_id: user.id,
          ...(operation.data || {}),
        });
        break;

      case 'transfer':
        await supabase.functions.invoke('atomic-transfer', {
          body: { transfer: operation.data }
        });
        break;

      case 'credit_payment':
        await supabase.functions.invoke('atomic-pay-bill', {
          body: operation.data
        });
        break;

      case 'logout':
        await supabase.auth.signOut();
        await offlineDatabase.clearAll();
        break;

      case 'add_fixed_transaction':
        await supabase.functions.invoke('atomic-create-fixed', {
          body: { transaction: operation.data }
        });
        break;

      case 'add_installments':
        // Process each installment transaction
        const installmentData = operation.data as { transactions: any[]; total_installments: number };
        const createdIds: string[] = [];
        
        for (const txData of installmentData.transactions) {
          const { data: rpcData, error } = await supabase.rpc('atomic_create_transaction', {
            p_user_id: (await supabase.auth.getUser()).data.user!.id,
            p_description: txData.description,
            p_amount: txData.amount,
            p_date: txData.date,
            p_type: txData.type,
            p_category_id: txData.category_id,
            p_account_id: txData.account_id,
            p_status: txData.status,
            p_invoice_month: txData.invoice_month,
            p_invoice_month_overridden: !!txData.invoice_month,
          });
          
          if (error) throw error;
          
          const record = rpcData && Array.isArray(rpcData) ? rpcData[0] : null;
          if (record?.transaction_id) {
            createdIds.push(record.transaction_id);
          }
        }
        
        // Update installment metadata
        if (createdIds.length > 0) {
          const parentId = createdIds[0];
          await Promise.all(
            createdIds.map((id, index) =>
              supabase
                .from('transactions')
                .update({
                  installments: installmentData.total_installments,
                  current_installment: index + 1,
                  parent_transaction_id: parentId,
                })
                .eq('id', id)
            )
          );
        }
        break;

      case 'import_transactions':
        const importData = operation.data as { transactions: any[]; replace_ids: string[] };
        
        // Delete transactions to replace
        if (importData.replace_ids.length > 0) {
          await Promise.all(
            importData.replace_ids.map(txId =>
              supabase.functions.invoke('atomic-delete-transaction', {
                body: { transaction_id: txId, scope: 'current' }
              })
            )
          );
        }
        
        // Import transactions
        await Promise.all(
          importData.transactions.map(tx =>
            supabase.functions.invoke('atomic-transaction', {
              body: { transaction: tx }
            })
          )
        );
        break;

      case 'add_category':
        const { data: { user: categoryUser } } = await supabase.auth.getUser();
        if (!categoryUser) throw new Error('User not authenticated');
        
        await supabase
          .from('categories')
          .insert({
            ...operation.data,
            user_id: categoryUser.id,
          });
        break;

      case 'edit_category':
        await supabase
          .from('categories')
          .update(operation.data.updates)
          .eq('id', operation.data.category_id);
        break;

      case 'delete_category':
        await supabase
          .from('categories')
          .delete()
          .eq('id', operation.data.category_id);
        break;

      case 'import_categories':
        const catImportData = operation.data as { categories: any[]; replace_ids: string[] };
        const { data: { user: catUser } } = await supabase.auth.getUser();
        if (!catUser) throw new Error('User not authenticated');
        
        // Delete categories to replace
        if (catImportData.replace_ids.length > 0) {
          await supabase
            .from('categories')
            .delete()
            .in('id', catImportData.replace_ids)
            .eq('user_id', catUser.id);
        }
        
        // Import categories
        await supabase
          .from('categories')
          .insert(
            catImportData.categories.map(cat => ({
              ...cat,
              user_id: catUser.id,
            }))
          );
        break;

      case 'add_account':
        const { data: { user: addAccUser } } = await supabase.auth.getUser();
        if (!addAccUser) throw new Error('User not authenticated');

        await supabase
          .from('accounts')
          .insert({
            ...operation.data,
            user_id: addAccUser.id,
          });
        break;

      case 'edit_account':
        await supabase
          .from('accounts')
          .update(operation.data.updates)
          .eq('id', operation.data.account_id);
        break;

      case 'delete_account':
        await supabase
          .from('accounts')
          .delete()
          .eq('id', operation.data.account_id);
        break;

      case 'import_accounts':
        const accImportData = operation.data as { accounts: any[]; replace_ids: string[] };
        const { data: { user: accUser } } = await supabase.auth.getUser();
        if (!accUser) throw new Error('User not authenticated');
        
        // Delete accounts to replace
        if (accImportData.replace_ids.length > 0) {
          await supabase
            .from('accounts')
            .delete()
            .in('id', accImportData.replace_ids)
            .eq('user_id', accUser.id);
        }
        
        // Import accounts
        await supabase
          .from('accounts')
          .insert(
            accImportData.accounts.map(acc => ({
              ...acc,
              user_id: accUser.id,
            }))
          );
        break;

      default:
        logger.warn(`Unknown operation type: ${operation.type}`);
    }
  }
}

export const offlineSync = new OfflineSyncManager();
