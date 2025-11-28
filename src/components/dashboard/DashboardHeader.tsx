import { Button } from '@/components/ui/button';
import { ArrowRightLeft, TrendingDown, TrendingUp, CreditCard } from 'lucide-react';

interface DashboardHeaderProps {
  onTransfer: () => void;
  onAddExpense: () => void;
  onAddIncome: () => void;
  onAddCreditExpense: () => void;
}

export function DashboardHeader({
  onTransfer,
  onAddExpense,
  onAddIncome,
  onAddCreditExpense,
}: DashboardHeaderProps) {
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-2 w-full md:grid-cols-4 lg:flex lg:flex-nowrap lg:gap-2 lg:w-auto lg:ml-auto">
        <Button
          onClick={onTransfer}
          variant="outline"
          className="gap-1.5 apple-interaction h-9 text-body px-3"
          aria-label="Transferência"
        >
          <ArrowRightLeft className="h-3.5 w-3.5 sm:h-4 sm:w-4 flex-shrink-0" aria-hidden="true" />
          <span className="truncate">Transferência</span>
        </Button>
        <Button
          onClick={onAddExpense}
          variant="destructive"
          className="gap-1.5 apple-interaction h-9 text-body px-3"
          aria-label="Despesa"
        >
          <TrendingDown className="h-3.5 w-3.5 sm:h-4 sm:w-4 flex-shrink-0" aria-hidden="true" />
          <span className="truncate">Despesa</span>
        </Button>
        <Button
          onClick={onAddIncome}
          variant="default"
          className="gap-1.5 apple-interaction h-9 text-body bg-success hover:bg-success/90 px-3"
          aria-label="Receita"
        >
          <TrendingUp className="h-3.5 w-3.5 sm:h-4 sm:w-4 flex-shrink-0" aria-hidden="true" />
          <span className="truncate">Receita</span>
        </Button>
        <Button
          onClick={onAddCreditExpense}
          variant="outline"
          className="gap-1.5 apple-interaction h-9 text-body border-warning text-warning hover:bg-warning hover:text-warning-foreground px-2 sm:px-3"
          aria-label="Cartão de Crédito"
        >
          <CreditCard className="h-3.5 w-3.5 sm:h-4 sm:w-4 flex-shrink-0" aria-hidden="true" />
          <span className="truncate whitespace-nowrap">
            <span className="hidden sm:inline">Cartão de Crédito</span>
            <span className="sm:hidden">Cartão</span>
          </span>
        </Button>
      </div>
    </div>
  );
}
