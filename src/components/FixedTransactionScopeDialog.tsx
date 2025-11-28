import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { AlertCircle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

export type FixedScope = "current" | "current-and-remaining" | "all";

interface FixedTransactionScopeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onScopeSelected: (scope: FixedScope) => void;
  mode?: "edit" | "delete";
  hasCompleted?: boolean;
  pendingCount?: number;
}

export function FixedTransactionScopeDialog({
  open,
  onOpenChange,
  onScopeSelected,
  mode = "edit",
  hasCompleted = false,
  pendingCount = 0,
}: FixedTransactionScopeDialogProps) {
  const handleScopeSelection = (scope: FixedScope) => {
    onScopeSelected(scope);
    onOpenChange(false);
  };

  const isDelete = mode === "delete";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>
            {isDelete ? "Excluir Transação Fixa" : "Editar Transação Fixa"}
          </DialogTitle>
          <DialogDescription>
            Esta transação fixa gerou {pendingCount > 0 ? `${pendingCount} transação(ões) pendente(s)` : 'transações adicionais'}. 
            Escolha quais transações você deseja {isDelete ? "excluir" : "editar"}:
          </DialogDescription>
        </DialogHeader>
        
        {hasCompleted && (
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              Algumas transações já foram concluídas e não poderão ser {isDelete ? "excluídas" : "editadas"} em alguns escopos.
            </AlertDescription>
          </Alert>
        )}

        <div className="space-y-3 pt-4">
          <Button 
            variant="outline" 
            className="w-full justify-start h-auto p-4 hover:bg-accent"
            onClick={() => handleScopeSelection("current")}
          >
            <div className="text-left">
              <div className="font-medium">Apenas Esta Transação</div>
              <div className="text-sm text-muted-foreground">
                {isDelete 
                  ? "Excluir somente esta transação específica (a principal)"
                  : "Editar somente esta transação específica (a principal)"
                }
              </div>
            </div>
          </Button>

          <Button 
            variant="outline" 
            className="w-full justify-start h-auto p-4 hover:bg-accent"
            onClick={() => handleScopeSelection("current-and-remaining")}
          >
            <div className="text-left">
              <div className="font-medium">Esta e Todas as Pendentes Futuras</div>
              <div className="text-sm text-muted-foreground">
                {isDelete 
                  ? `Excluir esta transação principal e as ${pendingCount} transação(ões) pendente(s) geradas`
                  : `Editar esta transação principal e as ${pendingCount} transação(ões) pendente(s) geradas`
                }
              </div>
            </div>
          </Button>

          <Button 
            variant="outline" 
            className="w-full justify-start h-auto p-4 hover:bg-accent"
            onClick={() => handleScopeSelection("all")}
          >
            <div className="text-left">
              <div className="font-medium">Todas (Incluindo Concluídas)</div>
              <div className="text-sm text-muted-foreground">
                {isDelete 
                  ? `Excluir a transação principal e TODAS as transações geradas, incluindo as já concluídas`
                  : `Editar a transação principal e TODAS as transações geradas, incluindo as já concluídas`
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
