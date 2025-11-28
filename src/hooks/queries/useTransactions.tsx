import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Transaction } from '@/types';
import { logger } from '@/lib/logger';
import { queryKeys } from '@/lib/queryClient';
import { createDateFromString } from '@/lib/dateUtils';
import { addTransactionSchema, editTransactionSchema } from '@/lib/validationSchemas';
import { z } from 'zod';

interface UseTransactionsParams {
  page?: number;
  pageSize?: number | null; // null = todas as transações
  search?: string;
  type?: 'income' | 'expense' | 'transfer' | 'all';
  accountId?: string;
  categoryId?: string;
  status?: 'pending' | 'completed' | 'all';
  accountType?: 'checking' | 'savings' | 'credit' | 'investment' | 'all';
  dateFrom?: string;
  dateTo?: string;
  sortBy?: 'date' | 'amount';
  sortOrder?: 'asc' | 'desc';
  enabled?: boolean;
}

interface AddTransactionParams {
  description: string;
  amount: number;
  date: Date;
  type: 'income' | 'expense' | 'transfer';
  category_id: string;
  account_id: string;
  status: 'pending' | 'completed';
  invoiceMonth?: string;
}

interface EditTransactionParams {
  id: string;
  updates: Partial<Transaction>;
  scope?: 'current' | 'all';
}

interface DeleteTransactionParams {
  id: string;
  scope?: 'current' | 'all';
}

interface TransactionWithRelations extends Transaction {
  category?: {
    id: string;
    name: string;
    type: 'income' | 'expense' | 'both';
    color: string;
  };
  account?: {
    id: string;
    name: string;
    type: 'checking' | 'savings' | 'credit' | 'investment';
    color: string;
  };
  to_account?: {
    id: string;
    name: string;
    type: 'checking' | 'savings' | 'credit' | 'investment';
    color: string;
  };
}

export function useTransactions(params: UseTransactionsParams = {}) {
  const {
    page = 0,
    pageSize = 50,
    search = '',
    type = 'all',
    accountId = 'all',
    categoryId = 'all',
    status = 'all',
    accountType = 'all',
    dateFrom,
    dateTo,
    sortBy = 'date',
    sortOrder = 'desc',
    enabled = true
  } = params;
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // Query for total count with filters
  const countQuery = useQuery({
    queryKey: [...queryKeys.transactions(), 'count', search, type, accountId, categoryId, status, accountType, dateFrom, dateTo],
    queryFn: async () => {
      if (!user) return 0;

      let query = supabase
        .from('transactions')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)
        // Excluir apenas o PAI das transações fixas (mantém as filhas)
        .or('parent_transaction_id.not.is.null,is_fixed.neq.true,is_fixed.is.null');

      // Apply filters
      if (search) {
        query = query.ilike('description', `%${search}%`);
      }

      if (type !== 'all') {
        if (type === 'transfer') {
          query = query.not('to_account_id', 'is', null);
        } else {
          query = query.eq('type', type).is('to_account_id', null);
        }
      }

      if (accountId !== 'all') {
        query = query.eq('account_id', accountId);
      }

      if (categoryId !== 'all') {
        query = query.eq('category_id', categoryId);
      }

      if (status !== 'all') {
        query = query.eq('status', status);
      }

      if (dateFrom) {
        query = query.gte('date', dateFrom);
      }

      if (dateTo) {
        query = query.lte('date', dateTo);
      }

      const { count, error } = await query;

      if (error) throw error;
      return count || 0;
    },
    enabled: !!user && enabled,
    // Otimização: staleTime de 30s evita refetches desnecessários
    staleTime: 30 * 1000, // 30 segundos
    gcTime: 2.5 * 60 * 1000,
    // Keep previous data while fetching new data
    placeholderData: (previousData) => previousData,
    // Refetch only when data is stale (não forçar sempre)
    refetchOnMount: true, // Default: refetch se stale
    refetchOnWindowFocus: true,
  });

  // Query for paginated data with filters
  const query = useQuery({
    queryKey: [...queryKeys.transactions(), page, pageSize, search, type, accountId, categoryId, status, accountType, dateFrom, dateTo, sortBy, sortOrder],
    queryFn: async () => {
      if (!user) return [];

      let query = supabase
        .from('transactions')
        .select(`
          id,
          description,
          amount,
          date,
          type,
          status,
          category_id,
          account_id,
          to_account_id,
          installments,
          current_installment,
          parent_transaction_id,
          linked_transaction_id,
          is_recurring,
          is_fixed,
          recurrence_type,
          recurrence_end_date,
          invoice_month,
          invoice_month_overridden,
          reconciled,
          created_at,
          updated_at,
          categories:category_id (
            id,
            name,
            type,
            color
          ),
          accounts:account_id!inner (
            id,
            name,
            type,
            color
          ),
          to_accounts:to_account_id (
            id,
            name,
            type,
            color
          )
        `)
        .eq('user_id', user.id)
        // Excluir apenas o PAI das transações fixas (mantém as filhas)
        .or('parent_transaction_id.not.is.null,is_fixed.neq.true,is_fixed.is.null');

      // Apply filters
      if (search) {
        query = query.ilike('description', `%${search}%`);
      }

      if (type !== 'all') {
        if (type === 'transfer') {
          query = query.not('to_account_id', 'is', null);
        } else {
          query = query.eq('type', type).is('to_account_id', null);
        }
      }

      if (accountId !== 'all') {
        query = query.eq('account_id', accountId);
      }

      if (categoryId !== 'all') {
        query = query.eq('category_id', categoryId);
      }

      if (status !== 'all') {
        query = query.eq('status', status);
      }

      if (dateFrom) {
        query = query.gte('date', dateFrom);
      }

      if (dateTo) {
        query = query.lte('date', dateTo);
      }

      // ✅ Server-side filter for accountType (optimized with INNER JOIN)
      if (accountType !== 'all') {
        query = query.eq('accounts.type', accountType);
      }

      // Apply sorting
      const ascending = sortOrder === 'asc';
      if (sortBy === 'date') {
        query = query.order('date', { ascending }).order('created_at', { ascending });
      } else if (sortBy === 'amount') {
        query = query.order('amount', { ascending });
      }

      // Apply pagination (apenas se pageSize não for null)
      if (pageSize !== null) {
        const from = page * pageSize;
        const to = from + pageSize - 1;
        query = query.range(from, to);
      }

      const { data, error } = await query;

      if (error) throw error;

      const results = (data || []).map((trans) => ({
        ...trans,
        date: createDateFromString(trans.date),
        category: Array.isArray(trans.categories) ? trans.categories[0] : trans.categories,
        account: Array.isArray(trans.accounts) ? trans.accounts[0] : trans.accounts,
        to_account: Array.isArray(trans.to_accounts) ? trans.to_accounts[0] : trans.to_accounts,
      })) as TransactionWithRelations[];

      return results;
    },
    enabled: !!user && enabled,
    // Otimização: staleTime de 30s evita refetches desnecessários de transações
    staleTime: 30 * 1000, // 30 segundos
    gcTime: 2.5 * 60 * 1000,
    // Keep previous data while fetching new data (prevents loading states)
    placeholderData: (previousData) => previousData,
    // Refetch only when data is stale (não forçar sempre)
    refetchOnMount: true, // Default: refetch se stale
    refetchOnWindowFocus: true,
  });

  const addMutation = useMutation({
    mutationFn: async (transactionData: AddTransactionParams) => {
      if (!user) throw new Error('User not authenticated');

      // ✅ Validate with Zod before sending to edge function
      const validated = addTransactionSchema.parse({
        description: transactionData.description,
        amount: transactionData.amount,
        date: transactionData.date.toISOString().split('T')[0],
        type: transactionData.type,
        category_id: transactionData.category_id,
        account_id: transactionData.account_id,
        status: transactionData.status,
      });

      const { data, error } = await supabase.functions.invoke('atomic-transaction', {
        body: {
          transaction: {
            description: validated.description,
            amount: validated.amount,
            date: validated.date,
            type: validated.type,
            category_id: validated.category_id,
            account_id: validated.account_id,
            status: validated.status,
            invoice_month: transactionData.invoiceMonth || null,
            invoice_month_overridden: !!transactionData.invoiceMonth,
          },
        },
      });

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      // ✅ Invalidação imediata dispara refetch automático sem delay
      queryClient.invalidateQueries({ queryKey: queryKeys.transactionsBase });
      queryClient.invalidateQueries({ queryKey: queryKeys.accounts });
    },
    onError: (error) => {
      logger.error('Error adding transaction:', error);
    },
  });

  const editMutation = useMutation({
    mutationFn: async ({ id, updates, scope = 'current' }: EditTransactionParams) => {
      if (!user) throw new Error('User not authenticated');

      // ✅ Validate updates with Zod (partial schema)
      const partialSchema = editTransactionSchema.partial().required({ id: true });
      const validated = partialSchema.parse({ 
        id, 
        ...updates,
        date: updates.date ? new Date(updates.date).toISOString().split('T')[0] : undefined,
      });

      const { data, error } = await supabase.functions.invoke('atomic-edit-transaction', {
        body: {
          transaction_id: validated.id,
          updates: validated,
          scope,
        },
      });

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      // ✅ Invalidação imediata dispara refetch automático sem delay
      queryClient.invalidateQueries({ queryKey: queryKeys.transactionsBase });
      queryClient.invalidateQueries({ queryKey: queryKeys.accounts });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async ({ id, scope = 'current' }: DeleteTransactionParams) => {
      if (!user) throw new Error('User not authenticated');

      // ✅ Validate transaction ID
      const validated = z.object({
        id: z.string().uuid({ message: 'ID da transação inválido' }),
        scope: z.enum(['current', 'current-and-remaining', 'all']).optional(),
      }).parse({ id, scope });

      const { data, error } = await supabase.functions.invoke('atomic-delete-transaction', {
        body: { transaction_id: validated.id, scope: validated.scope || 'current' },
      });

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      // ✅ Invalidação imediata dispara refetch automático sem delay
      queryClient.invalidateQueries({ queryKey: queryKeys.transactionsBase });
      queryClient.invalidateQueries({ queryKey: queryKeys.accounts });
    },
  });

  const importMutation = useMutation({
    mutationFn: async (transactionsData: Array<Omit<Transaction, 'id' | 'user_id' | 'created_at' | 'updated_at'>>) => {
      if (!user) throw new Error('User not authenticated');

      const transactionsToInsert = await Promise.all(
        transactionsData.map(async (data) => {
          let category_id = data.category_id || null;
          if (!category_id && data.description) {
            const { data: existingCategory } = await supabase
              .from('categories')
              .select('id')
              .eq('user_id', user.id)
              .eq('name', data.description)
              .maybeSingle();
            if (existingCategory) {
              category_id = existingCategory.id;
            }
          }
          return {
            description: data.description,
            amount: data.amount,
            category_id,
            type: data.type,
            account_id: data.account_id,
            date: typeof data.date === 'string' ? data.date : new Date(data.date).toISOString().split('T')[0],
            status: data.status || 'completed',
            user_id: user.id,
          };
        })
      );

      const { data: newTransactions, error } = await supabase
        .from('transactions')
        .insert(transactionsToInsert)
        .select();

      if (error) throw error;
      return newTransactions;
    },
    onSuccess: () => {
      // ✅ Invalidação imediata dispara refetch automático sem delay
      queryClient.invalidateQueries({ queryKey: queryKeys.transactionsBase });
      queryClient.invalidateQueries({ queryKey: queryKeys.accounts });
      queryClient.invalidateQueries({ queryKey: queryKeys.categories });
    },
  });

  return {
    transactions: query.data || [],
    isLoading: query.isLoading || countQuery.isLoading,
    error: query.error || countQuery.error,
    refetch: query.refetch,
    totalCount: countQuery.data || 0,
    pageCount: pageSize === null ? 1 : Math.ceil((countQuery.data || 0) / pageSize),
    hasMore: pageSize === null ? false : (page + 1) * pageSize < (countQuery.data || 0),
    currentPage: page,
    pageSize,
    addTransaction: addMutation.mutateAsync,
    editTransaction: editMutation.mutateAsync,
    deleteTransaction: deleteMutation.mutateAsync,
    importTransactions: importMutation.mutateAsync,
  };
}
