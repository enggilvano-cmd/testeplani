import { useState, useEffect, useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useCategories } from "@/hooks/useCategories";
import { createDateFromString } from "@/lib/dateUtils";
import { EditTransactionFormFields } from "./edit-transaction/EditTransactionFormFields";

interface FixedTransaction {
  id: string;
  description: string;
  amount: number;
  date: string;
  type: "income" | "expense";
  category_id: string | null;
  account_id: string;
  is_fixed: boolean;
}

interface Account {
  id: string;
  name: string;
  type: "checking" | "savings" | "credit" | "investment";
  balance: number;
  color: string;
}

interface EditFixedTransactionModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEditTransaction: (transaction: FixedTransaction) => void;
  transaction: FixedTransaction;
  accounts: Account[];
}

export function EditFixedTransactionModal({
  open,
  onOpenChange,
  onEditTransaction,
  transaction,
  accounts,
}: EditFixedTransactionModalProps) {
  const [formData, setFormData] = useState({
    description: "",
    amountInCents: 0,
    date: new Date(),
    type: "income" as "income" | "expense",
    category_id: "",
    account_id: "",
    status: "pending" as "pending" | "completed",
    invoiceMonth: "",
  });
  const { toast } = useToast();
  const { categories } = useCategories();

  useEffect(() => {
    if (open && transaction) {
      setFormData({
        description: transaction.description,
        amountInCents: Math.round(Math.abs(Number(transaction.amount)) * 100),
        date: createDateFromString(transaction.date),
        type: transaction.type,
        category_id: transaction.category_id || "",
        account_id: transaction.account_id,
        status: "pending", // Fixed transactions don't have status in definition, default to pending
        invoiceMonth: "",
      });
    }
  }, [open, transaction]);

  const filteredCategories = useMemo(() => {
    if (!formData.type) return [];
    return categories.filter(
      (cat) => cat.type === formData.type || cat.type === "both"
    );
  }, [categories, formData.type]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.description.trim()) {
      toast({
        title: "Campo obrigatório",
        description: "Por favor, preencha a descrição.",
        variant: "destructive",
      });
      return;
    }

    if (formData.amountInCents <= 0) {
      toast({
        title: "Valor inválido",
        description: "O valor deve ser maior que zero.",
        variant: "destructive",
      });
      return;
    }

    if (!formData.account_id) {
      toast({
        title: "Campo obrigatório",
        description: "Por favor, selecione uma conta.",
        variant: "destructive",
      });
      return;
    }

    const year = formData.date.getFullYear();
    const month = String(formData.date.getMonth() + 1).padStart(2, '0');
    const day = String(formData.date.getDate()).padStart(2, '0');
    const dateString = `${year}-${month}-${day}`;

    onEditTransaction({
      id: transaction.id,
      description: formData.description,
      amount: formData.amountInCents / 100,
      date: dateString,
      type: formData.type,
      category_id: formData.category_id || null,
      account_id: formData.account_id,
      is_fixed: true,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="text-headline">Editar Transação Fixa</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <div className="text-body font-medium">
              Transação Fixa
            </div>
          </div>

          <EditTransactionFormFields
            formData={formData}
            onFormDataChange={(updates) => setFormData({ ...formData, ...updates })}
            accounts={accounts}
            filteredCategories={filteredCategories}
            isTransfer={false}
          />

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
              Salvar Alterações
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
