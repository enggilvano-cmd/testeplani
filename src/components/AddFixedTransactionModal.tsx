import { useState, useEffect, useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { getTodayString, createDateFromString } from "@/lib/dateUtils";
import { useCategories } from "@/hooks/useCategories";
import { CurrencyInput } from "@/components/forms/CurrencyInput";
import { ACCOUNT_TYPE_LABELS } from "@/types";
import { DatePicker } from "@/components/ui/date-picker";

interface Account {
  id: string;
  name: string;
  type: "checking" | "savings" | "credit" | "investment";
  balance: number;
  color: string;
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
    }
  }, [open]);

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

    if (formData.amount <= 0) {
      toast({
        title: "Valor inválido",
        description: "O valor deve ser maior que zero.",
        variant: "destructive",
      });
      return;
    }

    if (!formData.type) {
      toast({
        title: "Campo obrigatório",
        description: "Por favor, selecione o tipo de transação.",
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

    onAddTransaction({
      description: formData.description,
      amount: formData.amount,
      date: formData.date,
      type: formData.type,
      category_id: formData.category_id || null,
      account_id: formData.account_id,
      status: formData.status,
      is_fixed: true,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-headline">Nova Transação Fixa</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="description">Descrição</Label>
            <Input
              id="description"
              value={formData.description}
              onChange={(e) =>
                setFormData({ ...formData, description: e.target.value })
              }
              placeholder="Ex: Salário, Aluguel, Netflix..."
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="amount">Valor</Label>
            <CurrencyInput
              value={formData.amount}
              onValueChange={(value) => setFormData({ ...formData, amount: value })}
              placeholder="R$ 0,00"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="type">Tipo</Label>
            <Select
              value={formData.type}
              onValueChange={(value: "income" | "expense") =>
                setFormData({ ...formData, type: value, category_id: "" })
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecione o tipo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="income">Receita</SelectItem>
                <SelectItem value="expense">Despesa</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {formData.type && (
            <div className="space-y-2">
              <Label htmlFor="category">Categoria</Label>
              <Select
                value={formData.category_id}
                onValueChange={(value) =>
                  setFormData({ ...formData, category_id: value })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione uma categoria" />
                </SelectTrigger>
                <SelectContent>
                  {filteredCategories.map((category) => (
                    <SelectItem key={category.id} value={category.id}>
                      <div className="flex items-center gap-2">
                        <span
                          className="w-3 h-3 rounded-full"
                          style={{ backgroundColor: category.color }}
                        />
                        {category.name}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="account">Conta</Label>
            <Select
              value={formData.account_id}
              onValueChange={(value) =>
                setFormData({ ...formData, account_id: value })
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecione uma conta" />
              </SelectTrigger>
              <SelectContent>
                {accounts.map((account) => (
                  <SelectItem key={account.id} value={account.id}>
                    <div className="flex justify-between items-center w-full">
                      <div className="flex items-center gap-2">
                        <div
                          className="w-3 h-3 rounded-full"
                          style={{ backgroundColor: account.color || "#6b7280" }}
                        />
                        <span>{account.name}</span>
                      </div>
                      <span className="ml-2 text-sm text-muted-foreground">
                        {ACCOUNT_TYPE_LABELS[account.type]}
                      </span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="date">Dia do Mês</Label>
            <DatePicker
              date={formData.date ? createDateFromString(formData.date) : undefined}
              onDateChange={(newDate) => {
                if (newDate) {
                  const year = newDate.getFullYear();
                  const month = String(newDate.getMonth() + 1).padStart(2, '0');
                  const day = String(newDate.getDate()).padStart(2, '0');
                  setFormData({ ...formData, date: `${year}-${month}-${day}` });
                }
              }}
              placeholder="Selecione o dia do mês"
            />
            <p className="text-caption text-muted-foreground">
              A transação será gerada automaticamente todo dia {new Date(formData.date).getDate()} de cada mês.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="status">Status Inicial</Label>
            <Select
              value={formData.status}
              onValueChange={(value: "pending" | "completed") =>
                setFormData({ ...formData, status: value })
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecione o status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="pending">Pendente</SelectItem>
                <SelectItem value="completed">Concluída</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex gap-3 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="flex-1"
            >
              Cancelar
            </Button>
            <Button type="submit" className="flex-1">
              Adicionar
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
