import { Button } from "@/components/ui/button";
import { Plus, ArrowRightLeft } from "lucide-react";

interface TransactionHeaderProps {
  onAddTransaction: () => void;
  onTransfer: () => void;
}

export const TransactionHeader = ({ onAddTransaction, onTransfer }: TransactionHeaderProps) => {
  return (
    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
      <div>
        <h1 className="text-title font-bold">Transações</h1>
        <p className="text-body text-muted-foreground mt-1">
          Gerencie todas as suas transações financeiras
        </p>
      </div>
      
      <div className="flex gap-2">
        <Button onClick={onTransfer} variant="outline" size="sm">
          <ArrowRightLeft className="h-4 w-4 mr-2" />
          Transferência
        </Button>
        <Button onClick={onAddTransaction} size="sm">
          <Plus className="h-4 w-4 mr-2" />
          Nova Transação
        </Button>
      </div>
    </div>
  );
};
