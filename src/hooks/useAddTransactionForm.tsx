import { useState, useEffect, useMemo, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { logger } from "@/lib/logger";
import { getTodayString, createDateFromString, calculateInvoiceMonthByDue, addMonthsToDate } from "@/lib/dateUtils";
import { Account, TransactionInput, InstallmentTransactionInput } from "@/types";
import { addTransactionSchema } from "@/lib/validationSchemas";
import { z } from "zod";
import { queryKeys } from "@/lib/queryClient";
import { supabase } from "@/integrations/supabase/client";
import { getErrorMessage } from "@/types/errors";

import { useCategories } from "@/hooks/useCategories";

interface FormData {
  description: string;
  amount: number;
  date: string;
  type: "income" | "expense" | "transfer" | "";
  category_id: string;
  account_id: string;
  status: "pending" | "completed";
  isInstallment: boolean;
  installments: string;
  invoiceMonth: string;
  isRecurring: boolean;
  recurrenceType: "daily" | "weekly" | "monthly" | "yearly";
  recurrenceEndDate: string;
  isFixed: boolean;
}

interface UseAddTransactionFormParams {
  open: boolean;
  initialType?: string;
  accounts: Account[];
  onAddTransaction: (data: TransactionInput) => Promise<void>;
  onAddInstallmentTransactions?: (data: InstallmentTransactionInput[]) => Promise<void>;
  onSuccess?: () => void;
  onClose: () => void;
}

const initialFormState: FormData = {
  description: "",
  amount: 0,
  date: getTodayString(),
  type: "" as "" | "income" | "expense" | "transfer",
  category_id: "",
  account_id: "",
  status: "completed",
  isInstallment: false,
  installments: "2",
  invoiceMonth: "",
  isRecurring: false,
  recurrenceType: "monthly",
  recurrenceEndDate: "",
  isFixed: false,
};

export function useAddTransactionForm({
  open,
  initialType,
  accounts,
  onAddTransaction,
  onAddInstallmentTransactions,
  onSuccess,
  onClose,
}: UseAddTransactionFormParams) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { categories } = useCategories();
  const [formData, setFormData] = useState<FormData>({ ...initialFormState, type: (initialType || "") as "" | "income" | "expense" });
  const [customInstallments, setCustomInstallments] = useState("");
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const [manualStatusChange, setManualStatusChange] = useState(false);
  const [manualInvoiceMonthChange, setManualInvoiceMonthChange] = useState(false);

  // Reset form quando o modal abre
  useEffect(() => {
    if (open) {
      setFormData({ ...initialFormState, type: (initialType || "") as "" | "income" | "expense" });
      setCustomInstallments("");
      setValidationErrors({});
      setManualStatusChange(false);
      setManualInvoiceMonthChange(false);
    }
  }, [open, initialType]);

  // Recalcula o mês da fatura quando a data ou conta mudam (apenas se não foi alterado manualmente)
  useEffect(() => {
    if (!formData.account_id || !formData.date) return;
    
    const selectedAccount = accounts.find(acc => acc.id === formData.account_id);
    if (!selectedAccount || selectedAccount.type !== "credit" || !selectedAccount.closing_date) {
      // Só atualiza se o invoiceMonth não estiver vazio
      if (formData.invoiceMonth !== "") {
        setFormData(prev => ({ ...prev, invoiceMonth: "" }));
        setManualInvoiceMonthChange(false);
      }
      return;
    }
    
    // Só recalcula automaticamente se não houve alteração manual
    if (!manualInvoiceMonthChange) {
      const transactionDate = createDateFromString(formData.date);
      const calculatedMonth = calculateInvoiceMonthByDue(
        transactionDate,
        selectedAccount.closing_date,
        selectedAccount.due_date || 1
      );
      
      // Só atualiza se o invoiceMonth mudou
      if (formData.invoiceMonth !== calculatedMonth) {
        setFormData(prev => ({ ...prev, invoiceMonth: calculatedMonth }));
      }
    }
  }, [formData.date, formData.account_id, formData.invoiceMonth, accounts, manualInvoiceMonthChange]);

  // Reset flag de alteração manual quando a data muda
  useEffect(() => {
    setManualStatusChange(false);
  }, [formData.date]);

  // Reset flag de alteração manual do invoice month quando a conta muda
  useEffect(() => {
    setManualInvoiceMonthChange(false);
  }, [formData.account_id]);

  // Define status automaticamente baseado na data (apenas se não foi alterado manualmente)
  useEffect(() => {
    if (formData.date && !manualStatusChange) {
      const transactionDateStr = formData.date;
      const todayStr = getTodayString();
      const newStatus = transactionDateStr <= todayStr ? "completed" : "pending";

      if (formData.status !== newStatus) {
        setFormData((prev) => ({ ...prev, status: newStatus }));
      }
    }
  }, [formData.date, formData.status, manualStatusChange]);

  const filteredCategories = useMemo(() => {
    if (!formData.type || formData.type === "transfer") return [];
    return categories.filter(
      (cat) => cat.type === formData.type || cat.type === "both"
    );
  }, [categories, formData.type]);

  const selectedAccount = useMemo(
    () => accounts.find(acc => acc.id === formData.account_id),
    [accounts, formData.account_id]
  );

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    setValidationErrors({});

    // Validação com Zod
    try {
      const validationData = {
        description: formData.description,
        amount: formData.amount,
        date: formData.date,
        type: formData.type || undefined,
        category_id: formData.category_id,
        account_id: formData.account_id,
        status: formData.status,
        isInstallment: formData.isInstallment,
        installments: formData.installments,
        customInstallments: customInstallments,
        invoiceMonth: formData.invoiceMonth,
        isRecurring: formData.isRecurring,
        recurrenceType: formData.recurrenceType,
        recurrenceEndDate: formData.recurrenceEndDate,
        isFixed: formData.isFixed,
      };

      addTransactionSchema.parse(validationData);
    } catch (error) {
      if (error instanceof z.ZodError) {
        const errors: Record<string, string> = {};
        error.errors.forEach((err) => {
          const path = err.path.join(".");
          errors[path] = err.message;
        });
        setValidationErrors(errors);

        const firstError = error.errors[0];
        toast({
          title: "Erro de validação",
          description: firstError.message,
          variant: "destructive",
        });
        
        logger.error("Validation errors:", errors);
        return;
      }
    }

    const { isInstallment } = formData;
    const installments = parseInt(
      formData.installments === "custom" ? customInstallments : formData.installments
    );

    if (isInstallment && (isNaN(installments) || installments < 2 || installments > 360)) {
      toast({
        title: "Erro",
        description: "Número de parcelas deve estar entre 2 e 360",
        variant: "destructive",
      });
      return;
    }

    if (!selectedAccount) {
      toast({
        title: "Erro",
        description: "Conta não encontrada",
        variant: "destructive",
      });
      return;
    }

    try {
      if (isInstallment) {
        await handleInstallmentTransaction(installments);
      } else if (formData.isFixed) {
        await handleFixedTransaction();
      } else {
        await handleSingleTransaction();
      }

      // Reset form e fechar modal
      setFormData(initialFormState);
      setCustomInstallments("");
      onClose();
    } catch (error: unknown) {
      logger.error("Error creating transaction(s):", error);
      toast({
        title: "Erro",
        description: getErrorMessage(error) || "Erro ao criar transação",
        variant: "destructive",
      });
    }
  }, [formData, customInstallments, selectedAccount, toast, onClose]);

  const handleInstallmentTransaction = async (installments: number) => {
    if (!onAddInstallmentTransactions) {
      throw new Error("Função de parcelamento não disponível");
    }

    const baseDate = createDateFromString(formData.date);
    const todayStr = getTodayString();
    const transactionsToCreate: InstallmentTransactionInput[] = [];

    if (selectedAccount!.type === 'credit') {
      const baseInstallmentCents = Math.floor(formData.amount / installments);
      const remainderCents = formData.amount % installments;

      for (let i = 0; i < installments; i++) {
        const installmentAmount = i === 0 
          ? baseInstallmentCents + remainderCents 
          : baseInstallmentCents;
        const installmentDate = addMonthsToDate(baseDate, i);
        
        logger.debug(`Parcela ${i + 1}/${installments}:`, {
          baseDate: baseDate.toISOString(),
          installmentDate: installmentDate.toISOString(),
          monthsAdded: i
        });

        const installmentStatus: "completed" | "pending" = "completed";
        const invoiceMonth = (selectedAccount!.closing_date && selectedAccount!.due_date)
          ? calculateInvoiceMonthByDue(installmentDate, selectedAccount!.closing_date, selectedAccount!.due_date)
          : undefined;

        transactionsToCreate.push({
          description: formData.description,
          amount: installmentAmount,
          date: installmentDate,
          type: formData.type as "income" | "expense",
          category_id: formData.category_id,
          account_id: formData.account_id,
          status: installmentStatus,
          currentInstallment: i + 1,
          invoiceMonth: invoiceMonth,
        });
      }
    } else {
      const baseInstallmentCents = Math.floor(formData.amount / installments);
      const remainderCents = formData.amount % installments;

      for (let i = 0; i < installments; i++) {
        const installmentAmount = i === 0 
          ? baseInstallmentCents + remainderCents 
          : baseInstallmentCents;
        const installmentDate = addMonthsToDate(baseDate, i);
        const installmentDateStr = installmentDate.toISOString().split("T")[0];
        
        const installmentStatus: "completed" | "pending" =
          installmentDateStr <= todayStr ? formData.status : "pending";

        transactionsToCreate.push({
          description: formData.description,
          amount: installmentAmount,
          date: installmentDate,
          type: formData.type as "income" | "expense",
          category_id: formData.category_id,
          account_id: formData.account_id,
          status: installmentStatus,
          currentInstallment: i + 1,
          invoiceMonth: undefined,
        });
      }
    }

    await onAddInstallmentTransactions(transactionsToCreate);
    toast({
      title: "Sucesso",
      description: `${installments} parcelas criadas com sucesso`,
      variant: "default",
    });
  };

  const handleFixedTransaction = useCallback(async () => {
    try {
      const { data, error } = await supabase.functions.invoke('atomic-create-fixed', {
        body: {
          description: formData.description,
          amount: formData.amount,
          date: formData.date,
          type: formData.type,
          category_id: formData.category_id,
          account_id: formData.account_id,
          status: formData.status,
        },
      });

      if (error) {
        logger.error('Failed to create fixed transaction:', error);
        toast({
          title: 'Erro',
          description: error.message || 'Erro ao criar transação fixa',
          variant: 'destructive',
        });
        return;
      }

      if (!data.success) {
        toast({
          title: 'Erro',
          description: data.error || 'Erro ao criar transação fixa',
          variant: 'destructive',
        });
        return;
      }

      toast({
        title: 'Sucesso',
        description: `Transação fixa criada com ${data.created_count} ocorrências`,
      });

      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      onSuccess?.();
      onClose();
    } catch (error: unknown) {
      logger.error('Unexpected error creating fixed transaction:', error);
      toast({
        title: 'Erro',
        description: getErrorMessage(error) || 'Erro inesperado ao criar transação fixa',
        variant: 'destructive',
      });
    }
  }, [formData, onClose, onSuccess, queryClient]);

  const handleSingleTransaction = async () => {
    // Se for transação recorrente, usar edge function atômico
    if (formData.isRecurring) {
      const { data, error } = await supabase.functions.invoke('atomic-create-recurring', {
        body: {
          description: formData.description,
          amount: Math.abs(formData.amount),
          date: formData.date,
          type: formData.type,
          category_id: formData.category_id,
          account_id: formData.account_id,
          status: formData.status,
          recurrence_type: formData.recurrenceType,
          recurrence_end_date: formData.recurrenceEndDate || undefined,
        },
      });

      if (error) {
        logger.error('Error creating recurring transaction:', error);
        throw new Error(error.message || 'Erro ao criar transação recorrente');
      }

      if (!data?.success) {
        throw new Error(data?.error || 'Erro ao criar transação recorrente');
      }

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.transactionsBase }),
        queryClient.invalidateQueries({ queryKey: queryKeys.accounts }),
      ]);
      await Promise.all([
        queryClient.refetchQueries({ queryKey: queryKeys.transactionsBase }),
        queryClient.refetchQueries({ queryKey: queryKeys.accounts }),
      ]);

      toast({
        title: "Transação Recorrente Criada",
        description: `${data.created_count} transações foram geradas com sucesso`,
        variant: "default",
      });

      if (onSuccess) {
        onSuccess();
      }
      return;
    }

    // Transação simples
    const transactionPayload = {
      description: formData.description,
      amount: Math.abs(formData.amount),
      date: createDateFromString(formData.date),
      type: formData.type as "income" | "expense",
      category_id: formData.category_id,
      account_id: formData.account_id,
      status: formData.status,
      invoiceMonth: formData.invoiceMonth || undefined,
      invoiceMonthOverridden: Boolean(formData.invoiceMonth),
      is_recurring: false,
    };

    await onAddTransaction(transactionPayload);

    toast({
      title: "Sucesso",
      description: "Transação criada com sucesso",
      variant: "default",
    });
  };

  return {
    formData,
    setFormData,
    customInstallments,
    setCustomInstallments,
    validationErrors,
    filteredCategories,
    selectedAccount,
    handleSubmit,
    setManualStatusChange,
    setManualInvoiceMonthChange,
  };
}
