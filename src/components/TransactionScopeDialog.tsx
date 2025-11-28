import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

export type EditScope = "current" | "current-and-remaining" | "all";

interface TransactionScopeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onScopeSelected: (scope: EditScope) => void;
  currentInstallment?: number;
  totalInstallments?: number;
  isRecurring?: boolean;
  mode?: "edit" | "delete";
}

export function TransactionScopeDialog({
  open,
  onOpenChange,
  onScopeSelected,
  currentInstallment = 1,
  totalInstallments = 1,
  isRecurring = false,
  mode = "edit"
}: TransactionScopeDialogProps) {
  const handleScopeSelection = (scope: EditScope) => {
    onScopeSelected(scope);
    onOpenChange(false);
  };

  const isDelete = mode === "delete";

  // Textos para transações recorrentes
  if (isRecurring) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>
              {isDelete ? "Escolher escopo da exclusão" : "Escolher escopo da edição"}
            </DialogTitle>
            <DialogDescription>
              {isDelete 
                ? "Defina se deseja excluir apenas esta ocorrência ou toda a série de recorrências."
                : "Defina se deseja editar apenas esta ocorrência ou toda a série de recorrências."
              }
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-3 pt-4">
            <Button 
              variant="outline" 
              className="w-full justify-start h-auto p-4"
              onClick={() => handleScopeSelection("current")}
            >
              <div className="text-left">
                <div className="font-medium">Apenas Esta Ocorrência</div>
                <div className="text-sm text-muted-foreground">
                  {isDelete 
                    ? "Deletar apenas esta transação recorrente"
                    : "Editar apenas esta transação recorrente"
                  }
                </div>
              </div>
            </Button>

            <Button 
              variant="outline" 
              className="w-full justify-start h-auto p-4"
              onClick={() => handleScopeSelection("current-and-remaining")}
            >
              <div className="text-left">
                <div className="font-medium">Esta e Próximas Ocorrências</div>
                <div className="text-sm text-muted-foreground">
                  {isDelete 
                    ? "Deletar esta e todas as próximas transações recorrentes"
                    : "Editar esta e todas as próximas transações recorrentes"
                  }
                </div>
              </div>
            </Button>

            <Button 
              variant="outline" 
              className="w-full justify-start h-auto p-4"
              onClick={() => handleScopeSelection("all")}
            >
              <div className="text-left">
                <div className="font-medium">Todas as Ocorrências</div>
                <div className="text-sm text-muted-foreground">
                  {isDelete 
                    ? "Deletar toda a série de transações recorrentes"
                    : "Editar toda a série de transações recorrentes"
                  }
                </div>
              </div>
            </Button>
          </div>

          <div className="flex gap-3 pt-4">
            <Button variant="ghost" onClick={() => onOpenChange(false)} className="flex-1">
              Cancelar
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  // Textos para transações parceladas
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>
            {isDelete ? "Escolher escopo da exclusão" : "Escolher escopo da edição"}
          </DialogTitle>
          <DialogDescription>
            {isDelete 
              ? `Defina se deseja excluir apenas esta ocorrência ou toda a série (atual: ${currentInstallment} de ${totalInstallments}).`
              : `Defina se deseja editar apenas esta ocorrência ou toda a série (atual: ${currentInstallment} de ${totalInstallments}).`
            }
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-3 pt-4">
          <Button 
            variant="outline" 
            className="w-full justify-start h-auto p-4"
            onClick={() => handleScopeSelection("current")}
          >
            <div className="text-left">
              <div className="font-medium">Apenas Esta Parcela</div>
              <div className="text-sm text-muted-foreground">
                {isDelete 
                  ? `Deletar apenas a parcela ${currentInstallment} de ${totalInstallments}`
                  : `Editar apenas a parcela ${currentInstallment} de ${totalInstallments}`
                }
              </div>
            </div>
          </Button>

          {currentInstallment < totalInstallments && (
            <Button 
              variant="outline" 
              className="w-full justify-start h-auto p-4"
              onClick={() => handleScopeSelection("current-and-remaining")}
            >
              <div className="text-left">
                <div className="font-medium">Esta e Próximas Parcelas</div>
                <div className="text-sm text-muted-foreground">
                  {isDelete 
                    ? `Deletar da parcela ${currentInstallment} até a ${totalInstallments}`
                    : `Editar da parcela ${currentInstallment} até a ${totalInstallments}`
                  }
                </div>
              </div>
            </Button>
          )}

          <Button 
            variant="outline" 
            className="w-full justify-start h-auto p-4"
            onClick={() => handleScopeSelection("all")}
          >
            <div className="text-left">
              <div className="font-medium">Todas as Parcelas</div>
              <div className="text-sm text-muted-foreground">
                {isDelete 
                  ? `Deletar todas as ${totalInstallments} parcelas`
                  : `Editar todas as ${totalInstallments} parcelas`
                }
              </div>
            </div>
          </Button>
        </div>

        <div className="flex gap-3 pt-4">
          <Button variant="ghost" onClick={() => onOpenChange(false)} className="flex-1">
            Cancelar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
