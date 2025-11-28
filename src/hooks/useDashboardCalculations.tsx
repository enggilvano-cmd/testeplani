import { useMemo, useEffect, useState } from 'react';
import type { Account, DateFilterType } from '@/types';
import { format, startOfMonth, endOfMonth } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/lib/logger';

export function useDashboardCalculations(
  accounts: Account[],
  dateFilter: DateFilterType,
  selectedMonth: Date,
  customStartDate: Date | undefined,
  customEndDate: Date | undefined
) {
  // Saldo total das contas (excluindo credit e investment)
  const totalBalance = useMemo(() => 
    accounts
      .filter((acc) => acc.type !== 'credit' && acc.type !== 'investment')
      .reduce((sum, acc) => sum + acc.balance, 0),
    [accounts]
  );

  const creditAvailable = useMemo(() => 
    accounts
      .filter((acc) => acc.type === 'credit')
      .reduce((sum, acc) => {
        const limit = acc.limit_amount || 0;
        const used = Math.abs(acc.balance);
        return sum + (limit - used);
      }, 0),
    [accounts]
  );

  // Buscar todos os dados via SQL independente dos filtros da página de Transações
  const [aggregatedTotals, setAggregatedTotals] = useState({
    periodIncome: 0,
    periodExpenses: 0,
    balance: 0,
    creditCardExpenses: 0,
    pendingExpenses: 0,
    pendingIncome: 0,
    pendingExpensesCount: 0,
    pendingIncomeCount: 0,
  });

  // Calcular date range baseado no filtro (memoizado para estabilidade)
  const dateRange = useMemo(() => {
    if (dateFilter === 'all') {
      return { dateFrom: undefined, dateTo: undefined };
    } else if (dateFilter === 'current_month') {
      const now = new Date();
      return {
        dateFrom: format(startOfMonth(now), 'yyyy-MM-dd'),
        dateTo: format(endOfMonth(now), 'yyyy-MM-dd'),
      };
    } else if (dateFilter === 'month_picker') {
      return {
        dateFrom: format(startOfMonth(selectedMonth), 'yyyy-MM-dd'),
        dateTo: format(endOfMonth(selectedMonth), 'yyyy-MM-dd'),
      };
    } else if (dateFilter === 'custom' && customStartDate && customEndDate) {
      return {
        dateFrom: format(customStartDate, 'yyyy-MM-dd'),
        dateTo: format(customEndDate, 'yyyy-MM-dd'),
      };
    }
    return { dateFrom: undefined, dateTo: undefined };
  }, [dateFilter, selectedMonth, customStartDate, customEndDate]);

  useEffect(() => {
    const fetchAggregatedTotals = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        // Buscar totais gerais do período
        const { data: totalsData, error: totalsError } = await supabase.rpc('get_transactions_totals', {
          p_user_id: user.id,
          p_type: 'all',
          p_status: 'all',
          p_account_id: undefined,
          p_category_id: undefined,
          p_account_type: 'all',
          p_date_from: dateRange.dateFrom,
          p_date_to: dateRange.dateTo,
          p_search: undefined,
        });

        if (totalsError) {
          logger.error("Error fetching aggregated totals:", totalsError);
          return;
        }

        // Buscar despesas de cartão de crédito do período
        const { data: creditData, error: creditError } = await supabase.rpc('get_transactions_totals', {
          p_user_id: user.id,
          p_type: 'expense',
          p_status: 'all',
          p_account_id: undefined,
          p_category_id: undefined,
          p_account_type: 'credit',
          p_date_from: dateRange.dateFrom,
          p_date_to: dateRange.dateTo,
          p_search: undefined,
        });

        if (creditError) {
          logger.error("Error fetching credit card expenses:", creditError);
        }

        // Buscar despesas pendentes do período
        const { data: pendingExpData, error: pendingExpError } = await supabase.rpc('get_transactions_totals', {
          p_user_id: user.id,
          p_type: 'expense',
          p_status: 'pending',
          p_account_id: undefined,
          p_category_id: undefined,
          p_account_type: 'all',
          p_date_from: dateRange.dateFrom,
          p_date_to: dateRange.dateTo,
          p_search: undefined,
        });

        if (pendingExpError) {
          logger.error("Error fetching pending expenses:", pendingExpError);
        }

        // Buscar receitas pendentes do período
        const { data: pendingIncData, error: pendingIncError } = await supabase.rpc('get_transactions_totals', {
          p_user_id: user.id,
          p_type: 'income',
          p_status: 'pending',
          p_account_id: undefined,
          p_category_id: undefined,
          p_account_type: 'all',
          p_date_from: dateRange.dateFrom,
          p_date_to: dateRange.dateTo,
          p_search: undefined,
        });

        if (pendingIncError) {
          logger.error("Error fetching pending income:", pendingIncError);
        }

        // Contar transações pendentes (despesas)
        const { count: pendingExpCount, error: pendingExpCountError } = await supabase
          .from('transactions')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', user.id)
          .eq('type', 'expense')
          .eq('status', 'pending')
          .is('to_account_id', null)
          .is('linked_transaction_id', null)
          // Excluir apenas o PAI das transações fixas (mantém as filhas)
          .or('parent_transaction_id.not.is.null,is_fixed.neq.true,is_fixed.is.null')
          .gte('date', dateRange.dateFrom || '1900-01-01')
          .lte('date', dateRange.dateTo || '2100-12-31');

        if (pendingExpCountError) {
          logger.error("Error counting pending expenses:", pendingExpCountError);
        }

        // Contar transações pendentes (receitas)
        const { count: pendingIncCount, error: pendingIncCountError } = await supabase
          .from('transactions')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', user.id)
          .eq('type', 'income')
          .eq('status', 'pending')
          .is('to_account_id', null)
          .is('linked_transaction_id', null)
          // Excluir apenas o PAI das transações fixas (mantém as filhas)
          .or('parent_transaction_id.not.is.null,is_fixed.neq.true,is_fixed.is.null')
          .gte('date', dateRange.dateFrom || '1900-01-01')
          .lte('date', dateRange.dateTo || '2100-12-31');

        if (pendingIncCountError) {
          logger.error("Error counting pending income:", pendingIncCountError);
        }
        
        setAggregatedTotals({
          periodIncome: totalsData?.[0]?.total_income || 0,
          periodExpenses: totalsData?.[0]?.total_expenses || 0,
          balance: totalsData?.[0]?.balance || 0,
          creditCardExpenses: creditData?.[0]?.total_expenses || 0,
          pendingExpenses: pendingExpData?.[0]?.total_expenses || 0,
          pendingIncome: pendingIncData?.[0]?.total_income || 0,
          pendingExpensesCount: pendingExpCount || 0,
          pendingIncomeCount: pendingIncCount || 0,
        });
      } catch (error) {
        logger.error("Error fetching aggregated totals:", error);
      }
    };

    fetchAggregatedTotals();
  }, [dateRange]);


  const getPeriodLabel = () => {
    if (dateFilter === 'all') {
      return 'Todas as transações';
    } else if (dateFilter === 'current_month') {
      return new Date().toLocaleDateString('pt-BR', {
        month: 'long',
        year: 'numeric',
      });
    } else if (dateFilter === 'month_picker') {
      return selectedMonth.toLocaleDateString('pt-BR', {
        month: 'long',
        year: 'numeric',
      });
    } else if (dateFilter === 'custom' && customStartDate && customEndDate) {
      return `${format(customStartDate, 'dd/MM/yyyy', {
        locale: ptBR,
      })} - ${format(customEndDate, 'dd/MM/yyyy', { locale: ptBR })}`;
    }
    return 'Período Selecionado';
  };

  return {
    totalBalance,
    creditAvailable,
    periodIncome: aggregatedTotals.periodIncome,
    periodExpenses: aggregatedTotals.periodExpenses,
    creditCardExpenses: aggregatedTotals.creditCardExpenses,
    pendingExpenses: aggregatedTotals.pendingExpenses,
    pendingIncome: aggregatedTotals.pendingIncome,
    pendingExpensesCount: aggregatedTotals.pendingExpensesCount,
    pendingIncomeCount: aggregatedTotals.pendingIncomeCount,
    getPeriodLabel,
  };
}
