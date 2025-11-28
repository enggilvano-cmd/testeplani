import { useState, useEffect, FormEvent } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CurrencyInput } from "@/components/forms/CurrencyInput";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { logger } from "@/lib/logger";
import { Account, PREDEFINED_COLORS, ACCOUNT_TYPE_LABELS } from "@/types";
import { ColorPicker } from "@/components/forms/ColorPicker";
import { EditAccountModalProps } from "@/types/formProps";

export function EditAccountModal({
  open,
  onOpenChange,
  onEditAccount,
  account,
}: EditAccountModalProps) {
  const [formData, setFormData] = useState({
    name: "",
    type: "" as "checking" | "savings" | "credit" | "investment" | "",
    limitInCents: 0,
    dueDate: "",
    closingDate: "",
    color: PREDEFINED_COLORS[0],
  });
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (account) {
      setFormData({
        name: account.name,
        type: account.type,
        limitInCents: account.limit_amount || 0,
        dueDate: account.due_date?.toString() || "",
        closingDate: account.closing_date?.toString() || "",
        color: account.color || PREDEFINED_COLORS[0],
      });
    }
  }, [account]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();

    if (!account) return;

    if (!formData.name.trim() || !formData.type) {
      toast({
        title: "Erro",
        description: "Preencha todos os campos obrigatórios",
        variant: "destructive",
      });
      return;
    }

    // Mantém o saldo atual da conta sem permitir edição
    const balanceInCents = account.balance;

    const dbLimitAmount =
      formData.limitInCents > 0 ? formData.limitInCents : null;

    let dueDate: number | undefined;
    if (formData.type === "credit" && formData.dueDate) {
      dueDate = parseInt(formData.dueDate);
      if (isNaN(dueDate) || dueDate < 1 || dueDate > 31) {
        toast({
          title: "Erro",
          description: "Data de vencimento inválida (1-31)",
          variant: "destructive",
        });
        return;
      }
    }

    let closingDate: number | undefined;
    if (formData.type === "credit" && formData.closingDate) {
      closingDate = parseInt(formData.closingDate);
      if (isNaN(closingDate) || closingDate < 1 || closingDate > 31) {
        toast({
          title: "Erro",
          description: "Data de fechamento inválida (1-31)",
          variant: "destructive",
        });
        return;
      }
    }

    const updatedAccount: Account = {
      id: account.id,
      user_id: account.user_id,
      name: formData.name.trim(),
      type: formData.type,
      balance: balanceInCents,
      limit_amount: dbLimitAmount ?? undefined,
      due_date: dueDate,
      closing_date: closingDate,
      color: formData.color,
    };

    setIsSubmitting(true);
    try {
      await onEditAccount(updatedAccount);

      toast({
        title: "Sucesso",
        description: "Conta atualizada com sucesso",
        variant: "default",
      });
    } catch (error) {
      logger.error("Failed to edit account:", error);
      // O toast de erro deve ser tratado dentro do onEditAccount ou aqui
    } finally {
      setIsSubmitting(false);
      onOpenChange(false);
    }
  };

  const handleColorChange = (color: string) => {
    setFormData((prev) => ({ ...prev, color }));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] max-w-[425px] p-4 sm:p-6">
        <DialogHeader className="space-y-2 pb-4">
          <DialogTitle className="text-headline">Editar Conta</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 sm:space-y-6">
          <div className="space-y-2">
            <Label
              htmlFor="name"
              className="text-caption"
            >
              Nome da Conta
            </Label>
            <Input
              id="name"
              placeholder="Ex: Conta Corrente, Poupança..."
              value={formData.name}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, name: e.target.value }))
              }
            />
          </div>

          <div className="space-y-2">
            <Label
              htmlFor="type"
              className="text-caption"
            >
              Tipo de Conta
            </Label>
            <Select
              value={formData.type}
              onValueChange={(value: "checking" | "savings" | "credit" | "investment") => {
                setFormData((prev) => ({ ...prev, type: value }));
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecione o tipo de conta" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="checking">
                  {ACCOUNT_TYPE_LABELS.checking}
                </SelectItem>
                <SelectItem value="savings">
                  {ACCOUNT_TYPE_LABELS.savings}
                </SelectItem>
                <SelectItem value="credit">
                  {ACCOUNT_TYPE_LABELS.credit}
                </SelectItem>
                <SelectItem value="investment">
                  {ACCOUNT_TYPE_LABELS.investment}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label
              htmlFor="limit"
              className="text-caption"
            >
              {formData.type === "credit" 
                ? "Limite do Cartão" 
                : formData.type === "checking" 
                ? "Limite de Cheque Especial (opcional)" 
                : "Limite (opcional)"}
            </Label>
            <CurrencyInput
              id="limit"
              value={formData.limitInCents}
              onValueChange={(value) =>
                setFormData((prev) => ({ ...prev, limitInCents: value || 0 }))
              }
            />
            {formData.type === "checking" && (
              <p className="text-caption text-muted-foreground">
                Informe o limite de cheque especial disponível na conta
              </p>
            )}
            {formData.type === "credit" && (
              <p className="text-caption text-muted-foreground">
                Limite total disponível no cartão de crédito
              </p>
            )}
          </div>

          {formData.type === "credit" && (
            <div className="space-y-4 sm:space-y-6 p-3 sm:p-4 bg-muted/50 rounded-lg border-l-4 border-primary/30">
              <h4 className="text-headline text-primary">
                Configurações do Cartão de Crédito
              </h4>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                <div className="space-y-2">
                  <Label
                    htmlFor="closingDate"
                    className="text-caption"
                  >
                    Data de Fechamento
                  </Label>
                  <Input
                    id="closingDate"
                    type="number"
                    min="1"
                    max="31"
                    placeholder="Ex: 15"
                    value={formData.closingDate}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        closingDate: e.target.value,
                      }))
                    }
                    className="text-financial-input"
                  />
                  <p className="text-caption text-muted-foreground">Dia do mês em que a fatura fecha</p>
                </div>

                <div className="space-y-2">
                  <Label
                    htmlFor="dueDate"
                    className="text-caption"
                  >
                    Data de Vencimento
                  </Label>
                  <Input
                    id="dueDate"
                    type="number"
                    min="1"
                    max="31"
                    placeholder="Ex: 20"
                    value={formData.dueDate}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        dueDate: e.target.value,
                      }))
                    }
                  />
                  <p className="text-caption text-muted-foreground">Dia do mês em que a fatura vence</p>
                </div>
              </div>
            </div>
          )}

          <ColorPicker value={formData.color} onChange={handleColorChange} />

          <div className="flex flex-col sm:flex-row gap-3 pt-4 border-t border-border/50">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="flex-1 text-body touch-target"
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              className="flex-1 text-body bg-primary hover:bg-primary/90 text-primary-foreground touch-target"
              disabled={isSubmitting}
            >
              {isSubmitting ? "Salvando..." : "Salvar Alterações"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}