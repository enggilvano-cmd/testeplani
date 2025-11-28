import { useMemo } from 'react';
import type { Account, Transaction, DateFilterType } from '@/types';
import { format, startOfMonth, endOfMonth, isWithinInterval } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { createDateFromString } from '@/lib/dateUtils';

export type ChartScaleType = 'daily' | 'monthly';

export function useDashboardChartData(
  transactions: Transaction[],
  accounts: Account[],
  chartScale: ChartScaleType,
  chartYear: number,
  dateFilter: DateFilterType,
  selectedMonth: Date,
  customStartDate: Date | undefined,
  customEndDate: Date | undefined
) {
  return useMemo(() => {
    const isTransferLike = (t: Transaction) =>
      t.type === 'transfer' || Boolean((t as any).to_account_id) || Boolean((t as any).linked_transaction_id);

    if (chartScale === 'daily') {
      let dailyFilteredTrans = transactions;

      if (dateFilter === 'current_month') {
        const now = new Date();
        const start = startOfMonth(now);
        const end = endOfMonth(now);
        dailyFilteredTrans = transactions.filter((t) => {
          const transactionDate = typeof t.date === 'string' 
            ? createDateFromString(t.date) 
            : t.date;
          return isWithinInterval(transactionDate, { start, end });
        });
      } else if (dateFilter === 'month_picker') {
        const start = startOfMonth(selectedMonth);
        const end = endOfMonth(selectedMonth);
        dailyFilteredTrans = transactions.filter((t) => {
          const transactionDate = typeof t.date === 'string' 
            ? createDateFromString(t.date) 
            : t.date;
          return isWithinInterval(transactionDate, { start, end });
        });
      } else if (dateFilter === 'custom' && customStartDate && customEndDate) {
        dailyFilteredTrans = transactions.filter((t) => {
          const transactionDate = typeof t.date === 'string' 
            ? createDateFromString(t.date) 
            : t.date;
          return isWithinInterval(transactionDate, {
            start: customStartDate,
            end: customEndDate,
          });
        });
      }

      if (dailyFilteredTrans.length === 0) return [];

      const dailyTotals = dailyFilteredTrans
        .filter(t => !isTransferLike(t)) // Excluir transferências (saída e entrada)
        .reduce((acc, transaction) => {
        const transactionDate = typeof transaction.date === 'string'
          ? createDateFromString(transaction.date)
          : transaction.date;
        const dateKey = format(transactionDate, 'yyyy-MM-dd');

        if (!acc[dateKey]) {
          acc[dateKey] = { income: 0, expenses: 0 };
        }

        if (transaction.type === 'income') {
          acc[dateKey].income += transaction.amount;
        } else if (transaction.type === 'expense') {
          acc[dateKey].expenses += Math.abs(transaction.amount);
        }

        return acc;
      }, {} as Record<string, { income: number; expenses: number }>);

      const sortedEntries = Object.entries(dailyTotals).sort(([a], [b]) =>
        a.localeCompare(b)
      );

      // BUG FIX: Incluir TODOS os tipos de conta no saldo inicial
      // Cartões de crédito têm saldo negativo (dívida), que deve ser incluído
      const saldoInicial = accounts.reduce((sum, acc) => sum + acc.balance, 0);

      let saldoAcumulado = saldoInicial;
      return sortedEntries.map(([dateKey, data]) => {
        saldoAcumulado = saldoAcumulado + data.income - data.expenses;
        const [year, month, day] = dateKey.split('-').map((num) => parseInt(num, 10));
        return {
          month: format(new Date(year, month - 1, day), 'dd/MM', {
            locale: ptBR,
          }),
          receitas: data.income,
          despesas: data.expenses,
          saldo: saldoAcumulado,
        };
      });
    } else {
      const monthlyTotals = transactions
        .filter(t => !isTransferLike(t)) // Excluir transferências (saída e entrada)
        .reduce((acc, transaction) => {
        const transactionDate = typeof transaction.date === 'string'
          ? createDateFromString(transaction.date)
          : transaction.date;
        const transactionYear = transactionDate.getFullYear();

        if (transactionYear === chartYear) {
          const monthKey = format(transactionDate, 'yyyy-MM');

          if (!acc[monthKey]) {
            acc[monthKey] = { income: 0, expenses: 0 };
          }

          if (transaction.type === 'income') {
            acc[monthKey].income += transaction.amount;
          } else if (transaction.type === 'expense') {
            acc[monthKey].expenses += Math.abs(transaction.amount);
          }
        }

        return acc;
      }, {} as Record<string, { income: number; expenses: number }>);

      const monthsToShow: string[] = [];
      for (let m = 1; m <= 12; m++) {
        const monthKey = `${chartYear}-${m.toString().padStart(2, '0')}`;
        monthsToShow.push(monthKey);
      }

      const previousYearBalance = transactions
        .filter(t => !isTransferLike(t)) // Excluir transferências (saída e entrada)
        .reduce((acc, transaction) => {
        const transactionDate = typeof transaction.date === 'string'
          ? createDateFromString(transaction.date)
          : transaction.date;
        const transactionYear = transactionDate.getFullYear();

        if (transactionYear < chartYear) {
          if (transaction.type === 'income') {
            return acc + transaction.amount;
          } else if (transaction.type === 'expense') {
            return acc + transaction.amount;
          }
        }

        return acc;
      }, 0);

      let saldoAcumulado = previousYearBalance;
      return monthsToShow.map((monthKey) => {
        const data = monthlyTotals[monthKey] || { income: 0, expenses: 0 };
        const saldoMensal = data.income - data.expenses;
        saldoAcumulado += saldoMensal;

        const [year, month] = monthKey.split('-').map((num) => parseInt(num, 10));

        return {
          month: format(new Date(year, month - 1, 1), 'MMM', { locale: ptBR }),
          receitas: data.income,
          despesas: data.expenses,
          saldo: saldoAcumulado,
          income: data.income,
          expenses: data.expenses,
          balance: saldoAcumulado,
        };
      });
    }
  }, [
    transactions,
    accounts,
    chartScale,
    dateFilter,
    selectedMonth,
    customStartDate,
    customEndDate,
    chartYear,
  ]);
}
