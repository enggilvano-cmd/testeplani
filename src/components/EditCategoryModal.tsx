import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Category, PREDEFINED_COLORS } from "@/types";
import { ColorPicker } from "@/components/forms/ColorPicker";
import { EditCategoryModalProps } from "@/types/formProps";
import { useChartOfAccounts } from "@/hooks/useChartOfAccounts";

export function EditCategoryModal({ open, onOpenChange, onEditCategory, category }: EditCategoryModalProps) {
  const [formData, setFormData] = useState({
    name: "",
    type: "" as Category["type"] | "",
    color: PREDEFINED_COLORS[0],
    chart_account_id: "" as string | undefined
  });
  const { toast } = useToast();
  
  // Carregar contas contábeis baseado no tipo selecionado
  const categoryFilter = formData.type === "income" ? "revenue" : formData.type === "expense" ? "expense" : undefined;
  const { chartAccounts } = useChartOfAccounts(categoryFilter);

  useEffect(() => {
    if (category) {
      setFormData({
        name: category.name,
        type: category.type,
        color: category.color,
        chart_account_id: category.chart_account_id || "_none_"
      });
    }
  }, [category]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!category) return;
    
    if (!formData.name.trim() || !formData.type) {
      toast({
        title: "Erro",
        description: "Preencha todos os campos obrigatórios",
        variant: "destructive"
      });
      return;
    }

    onEditCategory({
      ...category,
      name: formData.name.trim(),
      type: formData.type,
      color: formData.color,
      chart_account_id: formData.chart_account_id === "_none_" ? null : formData.chart_account_id || null
    });

    onOpenChange(false);
  };

  const handleCancel = () => {
    if (category) {
      setFormData({
        name: category.name,
        type: category.type,
        color: category.color,
        chart_account_id: category.chart_account_id || "_none_"
      });
    }
    onOpenChange(false);
  };

  const handleColorChange = (color: string) => {
    setFormData(prev => ({ ...prev, color }));
  };

  if (!category) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="text-headline">Editar Categoria</DialogTitle>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="name" className="text-caption">Nome da Categoria</Label>
            <Input
              id="name"
              placeholder="Ex: Alimentação, Salário, Lazer..."
              value={formData.name}
              onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
              maxLength={50}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="type" className="text-caption">Tipo de Categoria</Label>
            <Select value={formData.type} onValueChange={(value: Category["type"]) => setFormData(prev => ({ ...prev, type: value }))}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione o tipo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="income">Receita</SelectItem>
                <SelectItem value="expense">Despesa</SelectItem>
                <SelectItem value="both">Ambos</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <ColorPicker
            value={formData.color}
            onChange={handleColorChange}
          />

          {formData.type && formData.type !== "both" && (
            <div className="space-y-2">
              <Label htmlFor="chart_account" className="text-caption">
                Conta Contábil (Opcional)
              </Label>
              <Select 
                value={formData.chart_account_id} 
                onValueChange={(value) => setFormData(prev => ({ ...prev, chart_account_id: value }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione a conta contábil" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none_">Nenhuma</SelectItem>
                  {chartAccounts.map(account => (
                    <SelectItem key={account.id} value={account.id}>
                      {account.code} - {account.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Vincule esta categoria a uma conta do plano de contas para que apareça corretamente no DRE
              </p>
            </div>
          )}

          <div className="flex gap-3 pt-4">
            <Button type="button" variant="outline" onClick={handleCancel} className="flex-1 text-body">
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