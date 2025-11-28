import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useCategories } from "@/hooks/useCategories";
import { TransactionScopeDialog, EditScope } from "./TransactionScopeDialog";
import { FixedTransactionScopeDialog, FixedScope } from "./FixedTransactionScopeDialog";
import { EditTransactionModalProps } from "@/types/formProps";
import { useEditTransactionScope } from "@/hooks/edit-transaction/useEditTransactionScope";
import { useEditTransactionForm } from "@/hooks/edit-transaction/useEditTransactionForm";
import { EditTransactionFormFields } from "./edit-transaction/EditTransactionFormFields";

export function EditTransactionModal({
  open,
  onOpenChange,
  onEditTransaction,
  transaction,
  accounts
}: EditTransactionModalProps) {
  const { toast } = useToast();
  const { categories } = useCategories();
  
  // Detectar se é uma transação de transferência
  const isTransfer = Boolean(transaction?.to_account_id || transaction?.linked_transaction_id);
  
  const {
    scopeDialogOpen,
    setScopeDialogOpen,
    pendingTransactionsCount,
    hasCompletedTransactions,
    isInstallment,
    isFixed,
    checkScopeRequired,
  } = useEditTransactionScope(transaction);

  const {
    formData,
    setFormData,
    validateForm,
    getUpdates,
  } = useEditTransactionForm(transaction, accounts, open, isTransfer);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!transaction) return;
    
    if (!await validateForm()) return;
    
    const requiresScope = await checkScopeRequired();
    if (requiresScope) {
      setScopeDialogOpen(true);
      return;
    }

    processEdit("current");
  };

  const processEdit = async (editScope: EditScope) => {
    if (!transaction) return;

    const updates = getUpdates();
    if (!updates) {
      onOpenChange(false);
      return;
    }

    onEditTransaction({ id: transaction.id, ...updates } as typeof transaction, editScope);
    
    const scopeDescription = editScope === "current" ? "Transação atual atualizada com sucesso" : 
                             editScope === "all" ? "Todas as parcelas atualizadas com sucesso" :
                             "Parcelas selecionadas atualizadas com sucesso";
    
    toast({
      title: "Sucesso",
      description: scopeDescription,
    });

    onOpenChange(false);
    setScopeDialogOpen(false);
  };

  const filteredCategories = categories.filter(cat => 
    cat.type === formData.type || cat.type === "both"
  );

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle className="text-headline">
              Editar Transação
              {isInstallment && (
                <span className="text-body font-normal text-muted-foreground block">
                  Parcela {transaction?.current_installment} de {transaction?.installments}
                </span>
              )}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <EditTransactionFormFields
              formData={formData}
              onFormDataChange={(updates) => setFormData({ ...formData, ...updates })}
              accounts={accounts}
              filteredCategories={filteredCategories}
              isTransfer={isTransfer}
            />

            <div className="flex gap-3 pt-4">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} className="flex-1 text-body">
                Cancelar
              </Button>
              <Button type="submit" className="flex-1 text-body">
                Salvar Alterações
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {isFixed && (
        <FixedTransactionScopeDialog
          open={scopeDialogOpen}
          onOpenChange={setScopeDialogOpen}
          onScopeSelected={(scope: FixedScope) => {
            const editScope: EditScope =
              scope === "current"
                ? "current"
                : scope === "current-and-remaining"
                  ? "current-and-remaining"
                  : "all";
            processEdit(editScope);
          }}
          mode="edit"
          hasCompleted={hasCompletedTransactions}
          pendingCount={pendingTransactionsCount}
        />
      )}

      {!isFixed && isInstallment && (
        <TransactionScopeDialog
          open={scopeDialogOpen}
          onOpenChange={setScopeDialogOpen}
          onScopeSelected={processEdit}
          currentInstallment={transaction?.current_installment || 1}
          totalInstallments={transaction?.installments || 1}
          isRecurring={Boolean(transaction?.is_recurring)}
          mode="edit"
        />
      )}
    </>
  );
}
