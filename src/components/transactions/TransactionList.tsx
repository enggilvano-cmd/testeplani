import { Badge } from "@/components/ui/badge";
import { TrendingUp, TrendingDown, ArrowLeftRight } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { formatCurrency } from "@/lib/formatters";
import { TransactionActions } from "./TransactionActions";
import { EditScope } from "../TransactionScopeDialog";
import type { Transaction, Account, Category } from "@/types";

interface TransactionListProps {
  transactions: Transaction[];
  accounts: Account[];
  categories: Category[];
  currency: string;
  onEdit: (transaction: Transaction) => void;
  onDelete: (transactionId: string, scope?: EditScope) => void;
  onMarkAsPaid?: (transaction: Transaction) => void;
}

export function TransactionList({
  transactions,
  accounts,
  categories,
  currency,
  onEdit,
  onDelete,
  onMarkAsPaid,
}: TransactionListProps) {
  const getAccountName = (accountId: string) => {
    const account = accounts.find((a) => a.id === accountId);
    return account?.name || "Conta Desconhecida";
  };

  const getCategoryName = (categoryId: string | null) => {
    if (!categoryId) return "-";
    const category = categories.find((c) => c.id === categoryId);
    return category?.name || "-";
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case "income":
        return <TrendingUp className="h-4 w-4 text-success" />;
      case "expense":
        return <TrendingDown className="h-4 w-4 text-destructive" />;
      case "transfer":
        return <ArrowLeftRight className="h-4 w-4 text-primary" />;
      default:
        return null;
    }
  };

  if (transactions.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        Nenhuma transação encontrada
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {transactions.map((transaction) => (
        <div
          key={transaction.id}
          className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 border rounded-lg hover:bg-muted/50 transition-colors bg-background"
        >
          <div className="flex items-start gap-3 flex-1 min-w-0">
            <div className="flex-shrink-0 mt-1">{getTypeIcon(transaction.type)}</div>
            
            <div className="flex-1 min-w-0 space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-medium truncate">{transaction.description}</span>
                {transaction.installments && transaction.installments > 1 && (
                  <Badge variant="secondary" className="text-xs">
                    {transaction.current_installment}/{transaction.installments}
                  </Badge>
                )}
                {transaction.status === "pending" && (
                  <Badge variant="destructive" className="text-xs">
                    Pendente
                  </Badge>
                )}
              </div>
              
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                <span className="truncate">{format(transaction.date, "dd/MM/yyyy", { locale: ptBR })}</span>
                <span className="truncate">{getCategoryName(transaction.category_id)}</span>
                <span className="truncate">{getAccountName(transaction.account_id)}</span>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between sm:justify-end gap-3 flex-shrink-0">
            <span
              className={`font-semibold text-lg ${
                transaction.type === "income"
                  ? "text-success"
                  : transaction.type === "expense"
                  ? "text-destructive"
                  : "text-primary"
              }`}
            >
              {transaction.type === "income" ? "+" : transaction.type === "expense" ? "-" : ""}
              {formatCurrency(Math.abs(transaction.amount), currency)}
            </span>

            <TransactionActions
              transaction={transaction}
              onEdit={onEdit}
              onDelete={onDelete}
              onMarkAsPaid={onMarkAsPaid}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
