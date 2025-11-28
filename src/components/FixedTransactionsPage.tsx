import { useState, useEffect, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Pencil, Trash2, TrendingUp, TrendingDown, Calendar, Search, CalendarPlus, DollarSign } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency } from "@/lib/formatters";
import { logger } from "@/lib/logger";
import { AddFixedTransactionModal } from "./AddFixedTransactionModal";
import { EditFixedTransactionModal } from "./EditFixedTransactionModal";
import { Skeleton } from "@/components/ui/skeleton";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryClient";
import { FixedTransactionPageActions } from "./fixedtransactions/FixedTransactionPageActions";
import { ImportFixedTransactionsModal } from "./ImportFixedTransactionsModal";
import * as XLSX from "xlsx";
import { formatBRNumber } from "@/lib/formatters";
import { useAuth } from "@/hooks/useAuth";
import { usePersistedFilters } from "@/hooks/usePersistedFilters";
import { FixedTransactionFilterDialog } from "@/components/fixedtransactions/FixedTransactionFilterDialog";
import { FixedTransactionFilterChips } from "@/components/fixedtransactions/FixedTransactionFilterChips";

interface FixedTransaction {
  id: string;
  description: string;
  amount: number;
  date: string;
  type: "income" | "expense";
  category_id: string | null;
  account_id: string;
  is_fixed: boolean;
  category?: { name: string; color: string } | null;
  account?: { name: string } | null;
}

interface Account {
  id: string;
  name: string;
  type: "checking" | "savings" | "credit" | "investment";
  balance: number;
  color: string;
}

interface FixedTransactionsFilters {
  searchTerm: string;
  filterType: "all" | "income" | "expense";
}

export function FixedTransactionsPage() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  
  // Filters with persistence
  const [filters, setFilters] = usePersistedFilters<FixedTransactionsFilters>(
    'fixed-transactions-filters',
    {
      searchTerm: "",
      filterType: "all",
    }
  );

  const searchTerm = filters.searchTerm;
  const filterType = filters.filterType;

  const setSearchTerm = (value: string) => setFilters((prev) => ({ ...prev, searchTerm: value }));
  const setFilterType = (value: typeof filters.filterType) => setFilters((prev) => ({ ...prev, filterType: value }));
  
  // ✅ P0-7 FIX: Remover dual state - usar apenas React Query
  const { 
    data: transactions = [], 
    isLoading: loading, 
    refetch: loadFixedTransactions 
  } = useQuery({
    queryKey: [...queryKeys.transactions(), 'fixed'],
    queryFn: async () => {
      if (!user) return [];

      const { data, error } = await supabase
        .from("transactions")
        .select(`
          id,
          description,
          amount,
          date,
          type,
          category_id,
          account_id,
          is_fixed,
          parent_transaction_id,
          category:categories(name, color),
          account:accounts!transactions_account_id_fkey(name)
        `)
        .eq("user_id", user.id)
        .eq("is_fixed", true)
        .is("parent_transaction_id", null)
        .neq("type", "transfer")
        .order("date", { ascending: false });

      if (error) throw error;
      return data as FixedTransaction[];
    },
    enabled: !!user,
    staleTime: 30 * 1000,
  });

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [transactionToDelete, setTransactionToDelete] = useState<FixedTransaction | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [transactionToEdit, setTransactionToEdit] = useState<FixedTransaction | null>(null);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [filterDialogOpen, setFilterDialogOpen] = useState(false);
  const { toast } = useToast();

  // Generate filter chips
  const filterChips = useMemo(() => {
    const chips = [];
    
    if (filterType !== "all") {
      const typeLabels = {
        income: "Receita",
        expense: "Despesa"
      };
      chips.push({
        id: "type",
        label: typeLabels[filterType],
        value: filterType,
        onRemove: () => setFilterType("all"),
      });
    }

    return chips;
  }, [filterType]);

  const clearAllFilters = () => {
    setFilterType("all");
  };

  useEffect(() => {
    loadAccounts();
  }, []);


  const loadAccounts = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from("accounts")
        .select("id, name, type, balance, color, limit_amount, due_date, closing_date")
        .eq("user_id", user.id)
        .order("name", { ascending: true });

      if (error) throw error;
      setAccounts(data || []);
    } catch (error) {
      logger.error("Error loading accounts:", error);
    }
  };

  const handleAdd = async (transaction: Omit<FixedTransaction, "id"> & { status?: "pending" | "completed" }) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Usar edge function atômica para garantir integridade dos dados
      const { data, error } = await supabase.functions.invoke('atomic-create-fixed', {
        body: {
          description: transaction.description,
          amount: transaction.amount,
          date: transaction.date,
          type: transaction.type,
          category_id: transaction.category_id,
          account_id: transaction.account_id,
          status: transaction.status || "pending",
        },
      });

      if (error) throw error;

      const result = data?.[0];
      if (!result?.success) {
        throw new Error(result?.error_message || 'Erro ao criar transação fixa');
      }

      toast({
        title: "Transação fixa adicionada",
        description: `${result.created_count} transações foram geradas com sucesso`,
      });

      // 🔄 Sincronizar listas e dashboard imediatamente
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.transactionsBase }),
        queryClient.invalidateQueries({ queryKey: queryKeys.accounts }),
      ]);
      await Promise.all([
        queryClient.refetchQueries({ queryKey: queryKeys.transactionsBase }),
        queryClient.refetchQueries({ queryKey: queryKeys.accounts }),
      ]);

      loadFixedTransactions(); // Refetch fixed transactions
      setAddModalOpen(false);
    } catch (error) {
      logger.error("Error adding fixed transaction:", error);
      toast({
        title: "Erro ao adicionar transação",
        description: error instanceof Error ? error.message : "Não foi possível adicionar a transação fixa.",
        variant: "destructive",
      });
    }
  };

  const handleEditClick = async (transaction: FixedTransaction) => {
    setTransactionToEdit(transaction);
    setEditModalOpen(true);
  };

  const handleEdit = async (transaction: FixedTransaction) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      if (!transactionToEdit) return;

      // Comparar valores originais com editados e enviar apenas os campos alterados
      const updates: Record<string, unknown> = {};

      if (transaction.description !== transactionToEdit.description) {
        updates.description = transaction.description;
      }
      if (transaction.amount !== transactionToEdit.amount) {
        updates.amount = transaction.amount;
      }
      if (transaction.type !== transactionToEdit.type) {
        updates.type = transaction.type;
      }
      if (transaction.category_id !== transactionToEdit.category_id && transaction.category_id) {
        // Só envia category_id se houver um valor válido (string)
        updates.category_id = transaction.category_id;
      }
      if (transaction.account_id !== transactionToEdit.account_id) {
        updates.account_id = transaction.account_id;
      }
      if (transaction.date !== transactionToEdit.date) {
        updates.date = transaction.date;
      }

      // Se nenhum campo foi alterado, não fazer nada
      if (Object.keys(updates).length === 0) {
        toast({
          title: "Nenhuma alteração",
          description: "Nenhum campo foi modificado.",
        });
        setEditModalOpen(false);
        return;
      }

      // 1) Buscar status da transação principal
      const { data: mainTransaction, error: statusError } = await supabase
        .from("transactions")
        .select("status")
        .eq("id", transaction.id)
        .eq("user_id", user.id)
        .single();

      if (statusError) throw statusError;

      // Editar a transação principal SOMENTE se estiver PENDENTE
      if (mainTransaction?.status === "pending") {
        const { error: mainError } = await supabase.functions.invoke('atomic-edit-transaction', {
          body: {
            transaction_id: transaction.id,
            updates,
            scope: 'current',
          },
        });

        if (mainError) throw mainError;
      }

      // 2) Buscar e editar todas as filhas PENDENTES dessa fixa
      const { data: childTransactions, error: childError } = await supabase
        .from("transactions")
        .select("id, status")
        .eq("parent_transaction_id", transaction.id)
        .eq("user_id", user.id)
        .eq("status", "pending"); // Buscar APENAS pendentes

      if (childError) throw childError;

      // Editar apenas as filhas pendentes com os mesmos campos alterados
      if (childTransactions && childTransactions.length > 0) {
        for (const child of childTransactions) {
          await supabase.functions.invoke('atomic-edit-transaction', {
            body: {
              transaction_id: child.id,
              updates,
              scope: 'current',
            },
          });
        }
      }

      toast({
        title: "Transações atualizadas",
        description: "A transação fixa e todas as ocorrências pendentes foram atualizadas. As concluídas foram preservadas.",
      });

      // 🔄 Sincronizar listas e dashboard imediatamente
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.transactionsBase }),
        queryClient.invalidateQueries({ queryKey: queryKeys.accounts }),
      ]);
      await Promise.all([
        queryClient.refetchQueries({ queryKey: queryKeys.transactionsBase }),
        queryClient.refetchQueries({ queryKey: queryKeys.accounts }),
      ]);

      loadFixedTransactions();
      setEditModalOpen(false);
      setTransactionToEdit(null);
    } catch (error) {
      logger.error("Error updating transaction:", error);
      toast({
        title: "Erro ao atualizar",
        description: "Não foi possível atualizar a transação.",
        variant: "destructive",
      });
    }
  };

  const handleDeleteClick = async (transaction: FixedTransaction) => {
    setTransactionToDelete(transaction);
    setDeleteDialogOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!transactionToDelete) return;

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      // 1) Buscar transação principal (fixa) com status
      const { data: mainTransaction, error: mainError } = await supabase
        .from("transactions")
        .select("id, status")
        .eq("id", transactionToDelete.id)
        .eq("user_id", user.id)
        .single();

      if (mainError) throw mainError;

      // 2) Remover TODAS as filhas PENDENTES dessa fixa
      const { error: deleteChildrenError } = await supabase
        .from("transactions")
        .delete()
        .eq("parent_transaction_id", transactionToDelete.id)
        .eq("user_id", user.id)
        .eq("status", "pending");

      if (deleteChildrenError) throw deleteChildrenError;

      // 3) Se a principal estiver CONCLUÍDA, apenas desmarcar como fixa (is_fixed = false)
      //    para sumir da página Transações Fixas mas continuar aparecendo em Transações.
      if (mainTransaction?.status === "completed") {
        const { error: updateMainError } = await supabase
          .from("transactions")
          .update({ is_fixed: false })
          .eq("id", transactionToDelete.id)
          .eq("user_id", user.id);

        if (updateMainError) throw updateMainError;
      } else {
        // 4) Se a principal estiver PENDENTE, removê-la de fato
        const { error: deleteMainError } = await supabase
          .from("transactions")
          .delete()
          .eq("id", transactionToDelete.id)
          .eq("user_id", user.id)
          .eq("status", "pending");

        if (deleteMainError) throw deleteMainError;
      }

      toast({
        title: "Transações removidas",
        description:
          "Todas as ocorrências pendentes dessa transação fixa foram removidas. As concluídas foram preservadas na página Transações.",
      });

      // 🔄 Sincronizar listas e dashboard imediatamente
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.transactionsBase }),
        queryClient.invalidateQueries({ queryKey: queryKeys.accounts }),
      ]);
      await Promise.all([
        queryClient.refetchQueries({ queryKey: queryKeys.transactionsBase }),
        queryClient.refetchQueries({ queryKey: queryKeys.accounts }),
      ]);

      loadFixedTransactions();
    } catch (error) {
      logger.error("Error deleting transaction:", error);
      toast({
        title: "Erro ao remover",
        description: "Não foi possível remover a transação.",
        variant: "destructive",
      });
    } finally {
      setTransactionToDelete(null);
      setDeleteDialogOpen(false);
    }
  };

  const handleGenerateNext12Months = async (transactionId: string) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Buscar a transação fixa principal
      const { data: mainTransaction, error: fetchError } = await supabase
        .from("transactions")
        .select("*")
        .eq("id", transactionId)
        .single();

      if (fetchError || !mainTransaction) {
        throw new Error("Transação não encontrada");
      }

      // Buscar a última transação gerada (maior data)
      const { data: childTransactions, error: childError } = await supabase
        .from("transactions")
        .select("date")
        .eq("parent_transaction_id", transactionId)
        .order("date", { ascending: false })
        .limit(1);

      if (childError) throw childError;

      // Determinar a data inicial para os próximos 12 meses
      let startDate: Date;
      if (childTransactions && childTransactions.length > 0) {
        // Se existem transações filhas, começar do mês seguinte à última
        const lastDate = new Date(childTransactions[0].date);
        startDate = new Date(lastDate.getFullYear(), lastDate.getMonth() + 1, lastDate.getDate());
      } else {
        // Se não existem transações filhas, começar do mês seguinte à principal
        const mainDate = new Date(mainTransaction.date);
        startDate = new Date(mainDate.getFullYear(), mainDate.getMonth() + 1, mainDate.getDate());
      }

      const dayOfMonth = new Date(mainTransaction.date).getDate();
      const transactionsToGenerate = [];

      // Gerar 12 meses subsequentes
      for (let i = 0; i < 12; i++) {
        const nextDate = new Date(
          startDate.getFullYear(),
          startDate.getMonth() + i,
          dayOfMonth
        );

        // Ajustar para o dia correto do mês
        const targetMonth = nextDate.getMonth();
        nextDate.setDate(dayOfMonth);

        // Se o mês mudou, ajustar para o último dia do mês anterior
        if (nextDate.getMonth() !== targetMonth) {
          nextDate.setDate(0);
        }

        transactionsToGenerate.push({
          description: mainTransaction.description,
          amount: mainTransaction.amount,
          date: nextDate.toISOString().split("T")[0],
          type: mainTransaction.type,
          category_id: mainTransaction.category_id,
          account_id: mainTransaction.account_id,
          status: "pending" as const,
          user_id: user.id,
          is_fixed: false,
          parent_transaction_id: transactionId,
        });
      }

      // Inserir as novas transações
      const { error: insertError } = await supabase
        .from("transactions")
        .insert(transactionsToGenerate);

      if (insertError) throw insertError;

      toast({
        title: "Transações geradas",
        description: `12 novos meses foram gerados com sucesso.`,
      });

      // 🔄 Sincronizar listas e dashboard
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.transactionsBase }),
        queryClient.invalidateQueries({ queryKey: queryKeys.accounts }),
      ]);
      await Promise.all([
        queryClient.refetchQueries({ queryKey: queryKeys.transactionsBase }),
        queryClient.refetchQueries({ queryKey: queryKeys.accounts }),
      ]);

      loadFixedTransactions();
    } catch (error) {
      logger.error("Error generating next 12 months:", error);
      toast({
        title: "Erro ao gerar transações",
        description: "Não foi possível gerar os próximos 12 meses.",
        variant: "destructive",
      });
    }
  };

  const filteredTransactions = useMemo(() => {
    return transactions.filter((transaction) => {
      const matchesSearch = transaction.description
        .toLowerCase()
        .includes(searchTerm.toLowerCase());
      const matchesType =
        filterType === "all" || transaction.type === filterType;
      return matchesSearch && matchesType;
    });
  }, [transactions, searchTerm, filterType]);

  const stats = useMemo(() => {
    const totalFixed = filteredTransactions.length;
    const monthlyIncome = filteredTransactions
      .filter((t) => t.type === "income")
      .reduce((sum, t) => sum + Math.abs(Number(t.amount)), 0);
    const monthlyExpenses = filteredTransactions
      .filter((t) => t.type === "expense")
      .reduce((sum, t) => sum + Math.abs(Number(t.amount)), 0);
    const monthlyBalance = monthlyIncome - monthlyExpenses;

    return { totalFixed, monthlyIncome, monthlyExpenses, monthlyBalance };
  }, [filteredTransactions]);

  const handleExportToExcel = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Para cada parent, contar quantas children pending existem
      const exportDataPromises = filteredTransactions.map(async (transaction) => {
        const { count } = await supabase
          .from("transactions")
          .select("*", { count: 'exact', head: true })
          .eq("parent_transaction_id", transaction.id)
          .eq("status", "pending");

        return {
          Descrição: transaction.description,
          Valor: formatBRNumber(transaction.amount),
          Tipo: transaction.type === "income" ? "Receita" : "Despesa",
          Conta: transaction.account?.name || "",
          Categoria: transaction.category?.name || "",
          "Dia do Mês": parseInt(transaction.date.split('-')[2], 10),
          Status: "Pendente",
          "Meses Gerados": count || 0,
        };
      });

      const exportData = await Promise.all(exportDataPromises);

      const ws = XLSX.utils.json_to_sheet(exportData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Transações Fixas");
      
      const fileName = `transacoes_fixas_${new Date().toISOString().split('T')[0]}.xlsx`;
      XLSX.writeFile(wb, fileName);

      toast({
        title: "Exportação concluída",
        description: `${exportData.length} transação(ões) fixa(s) exportada(s) com sucesso.`,
      });
    } catch (error) {
      logger.error("Error exporting fixed transactions:", error);
      toast({
        title: "Erro ao exportar",
        description: "Não foi possível exportar as transações fixas.",
        variant: "destructive",
      });
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid gap-4 md:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  return (
    <div className="spacing-responsive-md fade-in pb-6 sm:pb-8">
      <FixedTransactionPageActions
        onImport={() => setImportModalOpen(true)}
        onExport={handleExportToExcel}
        onAdd={() => setAddModalOpen(true)}
        hasTransactions={transactions.length > 0}
      />

      {/* Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
        <Card className="financial-card">
          <CardContent className="p-3">
            <div className="flex flex-col items-center text-center gap-3">
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                <Calendar className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-caption text-muted-foreground">
                  Total de Fixas
                </p>
                <div className="balance-text">{stats.totalFixed}</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="financial-card">
          <CardContent className="p-3">
            <div className="flex flex-col items-center text-center gap-3">
              <div className="w-10 h-10 rounded-full bg-success/10 flex items-center justify-center">
                <TrendingUp className="h-5 w-5 text-success" />
              </div>
              <div>
                <p className="text-caption text-muted-foreground">
                  Receitas Mensais
                </p>
                <div className="balance-text balance-positive">
                  {formatCurrency(stats.monthlyIncome)}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="financial-card">
          <CardContent className="p-3">
            <div className="flex flex-col items-center text-center gap-3">
              <div className="w-10 h-10 rounded-full bg-destructive/10 flex items-center justify-center">
                <TrendingDown className="h-5 w-5 text-destructive" />
              </div>
              <div>
                <p className="text-caption text-muted-foreground">
                  Despesas Mensais
                </p>
                <div className="balance-text balance-negative">
                  {formatCurrency(stats.monthlyExpenses)}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="financial-card">
          <CardContent className="p-3">
            <div className="flex flex-col items-center text-center gap-3">
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                <DollarSign className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-caption text-muted-foreground">
                  Saldo Mensal
                </p>
                <div
                  className={`balance-text ${
                    stats.monthlyBalance >= 0
                      ? "balance-positive"
                      : "balance-negative"
                  }`}
                >
                  {formatCurrency(stats.monthlyBalance)}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters Card */}
      <Card className="mb-4">
        <CardContent className="p-4 space-y-4">
          <div className="flex flex-col gap-4">
            {/* Filter button and active chips */}
            <div className="flex flex-wrap items-center gap-3">
              <FixedTransactionFilterDialog
                open={filterDialogOpen}
                onOpenChange={setFilterDialogOpen}
                filterType={filterType}
                onFilterTypeChange={(value) => setFilterType(value as typeof filterType)}
                activeFiltersCount={filterChips.length}
              />
              
              <FixedTransactionFilterChips
                chips={filterChips}
                onClearAll={clearAllFilters}
              />
            </div>

            {/* Search */}
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar transações fixas..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Nota informativa sobre o botão de renovação */}
      <Card className="bg-primary/5 border-primary/20">
        <CardContent className="p-4">
          <div className="flex gap-3 items-start">
            <CalendarPlus className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
            <p className="text-body text-foreground">
              <strong>Dica:</strong> Use o botão <CalendarPlus className="h-4 w-4 inline mx-1" /> ao lado de cada transação 
              para adicionar automaticamente mais 12 transações no ano subsequente às já lançadas.
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-4">
        {filteredTransactions.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Calendar className="h-12 w-12 text-muted-foreground mb-4" />
              <p className="text-muted-foreground text-center">
                Nenhuma transação fixa encontrada.
                <br />
                Adicione transações fixas para gerenciar suas receitas e despesas mensais.
              </p>
            </CardContent>
          </Card>
        ) : (
          filteredTransactions.map((transaction) => (
            <Card key={transaction.id}>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="text-headline font-semibold">
                        {transaction.description}
                      </h3>
                      <Badge variant={transaction.type === "income" ? "default" : "destructive"}>
                        {transaction.type === "income" ? "Receita" : "Despesa"}
                      </Badge>
                    </div>
                    <div className="flex flex-wrap gap-4 text-body text-muted-foreground">
                      <span>💰 {formatCurrency(Number(transaction.amount))}</span>
                      {transaction.category && (
                        <span className="flex items-center gap-1">
                          <span
                            className="w-3 h-3 rounded-full"
                            style={{ backgroundColor: transaction.category.color }}
                          />
                          {transaction.category.name}
                        </span>
                      )}
                      {transaction.account && (
                        <span>🏦 {transaction.account.name}</span>
                      )}
                      <span>📅 Todo dia {parseInt(transaction.date.split('-')[2], 10)}</span>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => handleGenerateNext12Months(transaction.id)}
                      title="Gerar mais 12 meses"
                    >
                      <CalendarPlus className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => handleEditClick(transaction)}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => handleDeleteClick(transaction)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* AlertDialog para confirmação de exclusão */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir Transação Fixa?</AlertDialogTitle>
            <AlertDialogDescription>
              {transactionToDelete && (
                <>
                  Você está prestes a excluir a transação fixa &quot;{transactionToDelete.description}&quot;.
                  <br /><br />
                  <strong>Atenção:</strong> Esta ação removerá a transação principal e todas as transações 
                  <strong> pendentes</strong> associadas. As transações já concluídas não serão afetadas. 
                  Esta ação não pode ser desfeita.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AddFixedTransactionModal
        open={addModalOpen}
        onOpenChange={setAddModalOpen}
        onAddTransaction={handleAdd}
        accounts={accounts}
      />

      {transactionToEdit && (
        <EditFixedTransactionModal
          open={editModalOpen}
          onOpenChange={(open) => {
            setEditModalOpen(open);
            if (!open) setTransactionToEdit(null);
          }}
          onEditTransaction={handleEdit}
          transaction={transactionToEdit}
          accounts={accounts}
        />
      )}

      <ImportFixedTransactionsModal
        open={importModalOpen}
        onOpenChange={setImportModalOpen}
        onImportComplete={loadFixedTransactions}
        accounts={accounts}
      />
    </div>
  );
}
