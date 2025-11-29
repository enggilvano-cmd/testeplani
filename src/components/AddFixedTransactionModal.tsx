import { useState, useEffect, useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { getTodayString, createDateFromString } from "@/lib/dateUtils";
import { useCategories } from "@/hooks/useCategories";
import { TransactionFormFields } from "./add-transaction/TransactionFormFields";
import { AccountCategoryFields } from "./add-transaction/AccountCategoryFields";

interface Account {
  id: string;
  name: string;
  type: "checking" | "savings" | "credit" | "investment";
  balance: number;
  color: string;
  limit_amount?: number;
}

interface FixedTransactionInput {
  description: string;
  amount: number;
  type: 'income' | 'expense';
  category_id: string | null;
  account_id: string;
  date: string;
  is_fixed: boolean;
  status?: 'pending' | 'completed';
}

interface AddFixedTransactionModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAddTransaction: (transaction: FixedTransactionInput) => void;
  accounts: Account[];
}

export function AddFixedTransactionModal({
  open,
  onOpenChange,
  onAddTransaction,
  accounts,
}: AddFixedTransactionModalProps) {
  const [formData, setFormData] = useState({
    description: "",
    amount: 0,
    date: getTodayString(),
    type: "" as "income" | "expense" | "",
    category_id: "",
    account_id: "",
    status: "pending" as "pending" | "completed",
  });
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const { toast } = useToast();
  const { categories } = useCategories();

  useEffect(() => {
    if (open) {
      setFormData({
        description: "",
        amount: 0,
        date: getTodayString(),
        type: "",
        category_id: "",
        account_id: "",
        status: "pending",
      });
      setValidationErrors({});
    }
  }, [open]);

  const filteredCategories = useMemo(() => {
    if (!formData.type) return categories;
    return categories.filter(
      (cat) => cat.type === formData.type || cat.type === "both"
    );
  }, [categories, formData.type]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const errors: Record<string, string> = {};

    if (!formData.description.trim()) {
      errors.description = "Descrição é obrigatória";
    }

    if (formData.amount <= 0) {
      errors.amount = "Valor deve ser maior que zero";
    }

    if (!formData.type) {
      errors.type = "Tipo é obrigatório";
    }

    if (!formData.account_id) {
      errors.account_id = "Conta é obrigatória";
    }
    
    if (!formData.date) {
      errors.date = "Data é obrigatória";
    }

    setValidationErrors(errors);

    if (Object.keys(errors).length > 0) {
      toast({
        title: "Erro de validação",
        description: "Por favor, corrija os erros no formulário.",
        variant: "destructive",
      });
      return;
    }

    onAddTransaction({
      description: formData.description,
      amount: formData.amount,
      date: formData.date,
      type: formData.type as "income" | "expense",
      category_id: formData.category_id || null,
      account_id: formData.account_id,
      status: formData.status,
      is_fixed: true,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="text-headline">Nova Transação Fixa</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-6">
          <TransactionFormFields
            description={formData.description}
            type={formData.type}
            amount={formData.amount}
            date={formData.date}
            status={formData.status}
            validationErrors={validationErrors}
            onDescriptionChange={(value) =>
              setFormData((prev) => ({ ...prev, description: value }))
            }
            onTypeChange={(value) =>
              setFormData((prev) => ({
                ...prev,
                type: value as "income" | "expense",
                category_id: "",
              }))
            }
            onAmountChange={(value) =>
              setFormData((prev) => ({ ...prev, amount: value }))
            }
            onDateChange={(value) =>
              setFormData((prev) => ({ ...prev, date: value }))
            }
            onStatusChange={(value) =>
              setFormData((prev) => ({ ...prev, status: value }))
            }
          />

          <AccountCategoryFields
            accountId={formData.account_id}
            categoryId={formData.category_id}
            type={formData.type}
            accounts={accounts}
            categories={filteredCategories}
            validationErrors={validationErrors}
            onAccountChange={(value) =>
              setFormData((prev) => ({ ...prev, account_id: value }))
            }
            onCategoryChange={(value) => {
              const selectedCategory = categories.find(c => c.id === value);
              setFormData((prev) => {
                let newType = prev.type;
                if (!newType && selectedCategory && selectedCategory.type !== 'both') {
                  newType = selectedCategory.type as "income" | "expense";
                }
                return { ...prev, category_id: value, type: newType };
              });
            }}
          />

          <div className="text-caption text-muted-foreground bg-muted/50 p-3 rounded-md">
            A transação será gerada automaticamente todo dia <strong>{createDateFromString(formData.date).getDate()}</strong> de cada mês.
          </div>

          <div className="flex gap-3 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="flex-1 text-body"
            >
              Cancelar
            </Button>
            <Button type="submit" className="flex-1 text-body">
              Adicionar
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
