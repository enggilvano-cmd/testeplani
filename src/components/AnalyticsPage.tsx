import { createDateFromString } from "@/lib/dateUtils";
import { logger } from "@/lib/logger";

import { useMemo, useState, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  BarChart3,
  PieChart,
  TrendingUp,
  TrendingDown,
  Download,
  Search,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { useChartResponsive } from "@/hooks/useChartResponsive";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
} from "@/components/ui/chart";
import {
  formatCurrencyForAxis,
  getBarChartAxisProps,
  getComposedChartMargins,
} from "@/lib/chartUtils";
import {
  Bar,
  BarChart,
  Cell,
  Pie,
  PieChart as RechartsPieChart,
  ResponsiveContainer,
  XAxis,
  YAxis,
  Line,
  ComposedChart,
} from "recharts";
import { loadHtmlToImage, loadJsPDF } from "@/lib/lazyImports";
import {
  startOfMonth,
  endOfMonth,
  isSameMonth,
  isSameYear,
  format,
  isWithinInterval,
  addMonths,
  subMonths,
} from "date-fns";
import { ptBR } from "date-fns/locale";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { useCategories } from "@/hooks/useCategories";
import { formatCurrency } from "@/lib/formatters";
import { TransactionFilterChips } from "@/components/transactions/TransactionFilterChips";
import { AnalyticsFilterDialog } from "@/components/analytics/AnalyticsFilterDialog";
import { usePersistedFilters } from "@/hooks/usePersistedFilters";

interface Account {
  id: string;
  name: string;
  type: "checking" | "savings" | "credit" | "investment";
  balance: number;
  color: string;
  limit_amount?: number;
  due_date?: number;
  closing_date?: number;
}

interface Transaction {
  id: string;
  description: string;
  amount: number;
  date: Date | string;
  type: "income" | "expense" | "transfer";
  category: string;
  category_id?: string;
  accountId?: string;
  account_id?: string;
  status: "pending" | "completed";
  to_account_id?: string;
  linked_transaction_id?: string;
}


interface AnalyticsPageProps {
  transactions: Transaction[];
  accounts: Account[];
  initialDateFilter?: "all" | "current_month" | "month_picker" | "custom";
  initialSelectedMonth?: Date;
  initialCustomStartDate?: Date;
  initialCustomEndDate?: Date;
}

interface AnalyticsFilters {
  searchTerm: string;
  filterType: "all" | "income" | "expense" | "transfer";
  filterAccount: string;
  filterCategory: string;
  filterStatus: "all" | "pending" | "completed";
  dateFilter: "all" | "current_month" | "month_picker" | "custom";
  selectedMonth: string;
  customStartDate?: string;
  customEndDate?: string;
  categoryChartType: "expense" | "income";
}

interface DotProps {
  cx?: number;
  cy?: number;
  payload?: {
    saldo?: number;
    month?: string;
  };
  index: number;
}

const COLORS = [
  "hsl(var(--primary))",
  "hsl(var(--success))",
  "hsl(var(--warning))",
  "hsl(var(--destructive))",
  "hsl(var(--accent))",
  "hsl(var(--muted))",
  "#8884d8",
  "#82ca9d",
  "#ffc658",
  "#ff7300",
];
// Cor de fallback caso uma categoria não tenha cor definida
const FALLBACK_COLOR = "#8884d8";

export default function AnalyticsPage({
  transactions,
  accounts,
  initialDateFilter = "all",
  initialSelectedMonth = new Date(),
  initialCustomStartDate = undefined,
  initialCustomEndDate = undefined,
}: AnalyticsPageProps) {
  // Filters with persistence
  const [filters, setFilters] = usePersistedFilters<AnalyticsFilters>(
    'analytics-filters',
    {
      searchTerm: "",
      filterType: "all",
      filterAccount: "all",
      filterCategory: "all",
      filterStatus: "all",
      dateFilter: initialDateFilter,
      selectedMonth: initialSelectedMonth.toISOString(),
      customStartDate: initialCustomStartDate?.toISOString(),
      customEndDate: initialCustomEndDate?.toISOString(),
      categoryChartType: "expense",
    }
  );

  // Extract values for easier access
  const searchTerm = filters.searchTerm;
  const filterType = filters.filterType;
  const filterAccount = filters.filterAccount;
  const filterCategory = filters.filterCategory;
  const filterStatus = filters.filterStatus;
  const dateFilter = filters.dateFilter;
  const selectedMonth = new Date(filters.selectedMonth);
  const customStartDate = filters.customStartDate ? new Date(filters.customStartDate) : undefined;
  const customEndDate = filters.customEndDate ? new Date(filters.customEndDate) : undefined;
  const categoryChartType = filters.categoryChartType;

  // Setters
  const setSearchTerm = (value: string) => setFilters((prev) => ({ ...prev, searchTerm: value }));
  const setFilterType = (value: typeof filters.filterType) => setFilters((prev) => ({ ...prev, filterType: value }));
  const setFilterAccount = (value: string) => setFilters((prev) => ({ ...prev, filterAccount: value }));
  const setFilterCategory = (value: string) => setFilters((prev) => ({ ...prev, filterCategory: value }));
  const setFilterStatus = (value: typeof filters.filterStatus) => setFilters((prev) => ({ ...prev, filterStatus: value }));
  const setDateFilter = (value: typeof filters.dateFilter) => setFilters((prev) => ({ ...prev, dateFilter: value }));
  const setSelectedMonth = (value: Date) => setFilters((prev) => ({ ...prev, selectedMonth: value.toISOString() }));
  const setCustomStartDate = (value: Date | undefined) => setFilters((prev) => ({ ...prev, customStartDate: value?.toISOString() }));
  const setCustomEndDate = (value: Date | undefined) => setFilters((prev) => ({ ...prev, customEndDate: value?.toISOString() }));
  const setCategoryChartType = (value: typeof filters.categoryChartType) => setFilters((prev) => ({ ...prev, categoryChartType: value }));

  const [filterDialogOpen, setFilterDialogOpen] = useState(false);
  const { toast } = useToast();
  const {
    chartConfig: responsiveConfig,
    isMobile,
  } = useChartResponsive();
  const { categories } = useCategories();
  
  const contentRef = useRef<HTMLDivElement>(null);


  const getTransactionAccountId = (transaction: Transaction) => {
    return transaction.account_id || transaction.accountId || "";
  };

  const getTransactionCategory = (transaction: Transaction) => {
    // Check if it's a transfer
    if (transaction.type === "transfer" || transaction.to_account_id) {
      return "Transferência";
    }

    // Prioritize category_id for more reliable mapping
    if (transaction.category_id) {
      const category = categories.find(
        (cat) => cat.id === transaction.category_id
      );
      return category?.name || "Sem categoria";
    }

    // Fallback to transaction.category if it exists and is not an ID-like string
    if (
      transaction.category &&
      typeof transaction.category === "string" &&
      !transaction.category.match(/^[0-9a-f-]{36}$/i)
    ) {
      return transaction.category;
    }

    return "Sem categoria";
  };

  const filteredTransactions = useMemo(() => {
    return transactions.filter((transaction) => {
      const transactionDate =
        typeof transaction.date === "string"
          ? createDateFromString(transaction.date)
          : transaction.date;

      const matchesSearch =
        !searchTerm ||
        transaction.description
          .toLowerCase()
          .includes(searchTerm.toLowerCase()) ||
        getTransactionCategory(transaction)
          .toLowerCase()
          .includes(searchTerm.toLowerCase());
      const matchesType = filterType === "all" || transaction.type === filterType;
      const matchesAccount =
        filterAccount === "all" ||
        getTransactionAccountId(transaction) === filterAccount;
      const matchesCategory =
        filterCategory === "all" ||
        transaction.category_id === filterCategory;
      const matchesStatus =
        filterStatus === "all" || transaction.status === filterStatus;

      let matchesPeriod = true;
      if (dateFilter === "current_month") {
        matchesPeriod =
          isSameMonth(transactionDate, new Date()) &&
          isSameYear(transactionDate, new Date());
      } else if (dateFilter === "month_picker") {
        const start = startOfMonth(selectedMonth);
        const end = endOfMonth(selectedMonth);
        matchesPeriod = isWithinInterval(transactionDate, { start, end });
      } else if (dateFilter === "custom" && customStartDate && customEndDate) {
        matchesPeriod =
          transactionDate >= customStartDate && transactionDate <= customEndDate;
      }

      return (
        matchesSearch &&
        matchesType &&
        matchesAccount &&
        matchesCategory &&
        matchesStatus &&
        matchesPeriod
      );
    });
  }, [
    transactions,
    searchTerm,
    filterType,
    filterAccount,
    filterCategory,
    filterStatus,
    dateFilter,
    selectedMonth,
    customStartDate,
    customEndDate,
    categories,
  ]);

  // Helper para identificar transações de transferência (ambos os lados)
  const isTransferLike = (transaction: Transaction) =>
    transaction.type === "transfer" ||
    Boolean(transaction.to_account_id) ||
    Boolean(transaction.linked_transaction_id);

  // Lista base para gráficos/relatórios: sempre sem transferências
  const nonTransferFilteredTransactions = useMemo(
    () => filteredTransactions.filter((t) => !isTransferLike(t)),
    [filteredTransactions]
  );


  const categoryData = useMemo(() => {
    const typeFilteredTransactions = nonTransferFilteredTransactions.filter(
      (t) => t.type === categoryChartType
    );

    const categoryFilteredTransactions = typeFilteredTransactions.filter(
      (transaction) => {
        const category = getTransactionCategory(transaction);
        return category !== "Pagamento de Fatura";
      }
    );

    if (categoryFilteredTransactions.length === 0) {
      return [];
    }

    const categoryTotals = categoryFilteredTransactions.reduce(
      (acc, transaction) => {
        const categoryObj = categories.find(
          (c) => c.id === transaction.category_id
        );
        const categoryName = categoryObj?.name || "Sem categoria";
        const categoryColor = categoryObj?.color || FALLBACK_COLOR;

        if (!acc[categoryName]) {
          acc[categoryName] = { amount: 0, color: categoryColor };
        }

        const value =
          categoryChartType === "expense"
            ? Math.abs(transaction.amount)
            : transaction.amount;
        acc[categoryName].amount += value;

        return acc;
      },
      {} as Record<string, { amount: number; color: string }>
    );

    const totalAmount = Object.values(categoryTotals).reduce(
      (sum, data) => sum + data.amount,
      0
    );

    const report = Object.entries(categoryTotals)
      .map(([category, data]) => ({
        category,
        amount: data.amount,
        color: data.color,
        percentage: totalAmount > 0 ? (data.amount / totalAmount) * 100 : 0,
      }))
      .sort((a, b) => b.amount - a.amount);

    return report.map((item, index) => ({
      ...item,
      fill: item.color || COLORS[index % COLORS.length],
    }));
  }, [nonTransferFilteredTransactions, categoryChartType, categories]);

  // Dados separados para despesas
  const expenseData = useMemo(() => {
    const expenseTransactions = nonTransferFilteredTransactions.filter(
      (t) => t.type === "expense"
    );

    const categoryFilteredTransactions = expenseTransactions.filter(
      (transaction) => {
        const category = getTransactionCategory(transaction);
        return category !== "Pagamento de Fatura";
      }
    );

    if (categoryFilteredTransactions.length === 0) {
      return [];
    }

    const categoryTotals = categoryFilteredTransactions.reduce(
      (acc, transaction) => {
        const categoryObj = categories.find(
          (c) => c.id === transaction.category_id
        );
        const categoryName = categoryObj?.name || "Sem categoria";
        const categoryColor = categoryObj?.color || FALLBACK_COLOR;

        if (!acc[categoryName]) {
          acc[categoryName] = { amount: 0, color: categoryColor };
        }

        acc[categoryName].amount += Math.abs(transaction.amount);

        return acc;
      },
      {} as Record<string, { amount: number; color: string }>
    );

    const totalAmount = Object.values(categoryTotals).reduce(
      (sum, data) => sum + data.amount,
      0
    );

    const report = Object.entries(categoryTotals)
      .map(([category, data]) => ({
        category,
        amount: data.amount,
        color: data.color,
        percentage: totalAmount > 0 ? (data.amount / totalAmount) * 100 : 0,
      }))
      .sort((a, b) => b.amount - a.amount);

    return report.map((item, index) => ({
      ...item,
      fill: item.color || COLORS[index % COLORS.length],
    }));
  }, [nonTransferFilteredTransactions, categories]);

  // Dados separados para receitas
  const incomeData = useMemo(() => {
    const incomeTransactions = nonTransferFilteredTransactions.filter(
      (t) => t.type === "income"
    );

    const categoryFilteredTransactions = incomeTransactions.filter(
      (transaction) => {
        const category = getTransactionCategory(transaction);
        return category !== "Pagamento de Fatura";
      }
    );

    if (categoryFilteredTransactions.length === 0) {
      return [];
    }

    const categoryTotals = categoryFilteredTransactions.reduce(
      (acc, transaction) => {
        const categoryObj = categories.find(
          (c) => c.id === transaction.category_id
        );
        const categoryName = categoryObj?.name || "Sem categoria";
        const categoryColor = categoryObj?.color || FALLBACK_COLOR;

        if (!acc[categoryName]) {
          acc[categoryName] = { amount: 0, color: categoryColor };
        }

        acc[categoryName].amount += transaction.amount;

        return acc;
      },
      {} as Record<string, { amount: number; color: string }>
    );

    const totalAmount = Object.values(categoryTotals).reduce(
      (sum, data) => sum + data.amount,
      0
    );

    const report = Object.entries(categoryTotals)
      .map(([category, data]) => ({
        category,
        amount: data.amount,
        color: data.color,
        percentage: totalAmount > 0 ? (data.amount / totalAmount) * 100 : 0,
      }))
      .sort((a, b) => b.amount - a.amount);

    return report.map((item, index) => ({
      ...item,
      fill: item.color || COLORS[index % COLORS.length],
    }));
  }, [nonTransferFilteredTransactions, categories]);


  const monthlyData = useMemo(() => {
    const monthlyTotals = nonTransferFilteredTransactions.reduce(
      (acc, transaction) => {
        const transactionDate =
          typeof transaction.date === "string"
            ? createDateFromString(transaction.date)
            : transaction.date;
        const monthKey = format(transactionDate, "yyyy-MM");

        if (!acc[monthKey]) {
          acc[monthKey] = { income: 0, expenses: 0 };
        }

        if (transaction.type === "income") {
          acc[monthKey].income += transaction.amount;
        } else if (transaction.type === "expense") {
          acc[monthKey].expenses -= transaction.amount;
        }

        return acc;
      },
      {} as Record<string, { income: number; expenses: number }>
    );

    const sortedEntries = Object.entries(monthlyTotals).sort(([a], [b]) =>
      a.localeCompare(b)
    );

    const firstMonthKey = sortedEntries.length > 0 ? sortedEntries[0][0] : null;
    const previousBalance = firstMonthKey
      ? transactions
          .filter((t) => !isTransferLike(t as Transaction))
          .reduce((acc, transaction) => {
            const transactionDate =
              typeof transaction.date === "string"
                ? createDateFromString(transaction.date)
                : transaction.date;
            const monthKey = format(transactionDate, "yyyy-MM");

            if (monthKey < firstMonthKey) {
              if (transaction.type === "income") {
                return acc + transaction.amount;
              } else if (transaction.type === "expense") {
                return acc - transaction.amount;
              }
            }

            return acc;
          }, 0)
      : 0;

    let saldoAcumulado = previousBalance;

    const sortedMonths = sortedEntries.map(([monthKey, data]) => {
      const saldoMensal = data.income + data.expenses;
      saldoAcumulado += saldoMensal;
      const [year, month] = monthKey
        .split("-")
        .map((num) => parseInt(num, 10));

      return {
        month: format(new Date(year, month - 1, 1), "MMM/yy", {
          locale: ptBR,
        }),
        receitas: data.income,
        despesas: Math.abs(data.expenses),
        saldo: saldoAcumulado,
      };
    });

    return sortedMonths;
  }, [nonTransferFilteredTransactions, transactions]);


  const totalsByType = useMemo(() => {
    return nonTransferFilteredTransactions.reduce(
      (acc, transaction) => {
        const amount = Math.abs(Number(transaction.amount) || 0);
        if (transaction.type === "income") {
          acc.income += amount;
        } else if (transaction.type === "expense") {
          acc.expenses += amount;
        }
        return acc;
      },
      { income: 0, expenses: 0 }
    );
  }, [nonTransferFilteredTransactions]);


  const accountBalanceData = useMemo(() => {
    return accounts
      .filter((acc) => acc.type !== "credit" && acc.balance !== 0)
      .map((account) => ({
        name: account.name.split(" - ")[0] || account.name,
        balance: account.balance,
        positiveBalance: account.balance > 0 ? account.balance : 0,
        negativeBalance: account.balance < 0 ? account.balance : 0,
        type: account.type,
        color: account.color || "hsl(var(--primary))",
      }));
  }, [accounts]);

  // Chart config específico para o gráfico de saldos de contas
  const accountChartConfig = useMemo(() => {
    const config: Record<string, { label: string; color: string }> = {};
    accountBalanceData.forEach((account) => {
      config[account.name] = {
        label: account.name,
        color: account.color,
      };
    });
    return config;
  }, [accountBalanceData]);

  // Dados para o gráfico de saldos de cartões de crédito
  const creditCardBalanceData = useMemo(() => {
    return accounts
      .filter((acc) => acc.type === "credit")
      .map((account) => {
        const usedCredit = account.balance < 0 ? Math.abs(account.balance) : 0;
        const availableCredit = (account.limit_amount || 0) - usedCredit;
        
        return {
          name: account.name.split(" - ")[0] || account.name,
          balance: availableCredit,
          positiveBalance: availableCredit > 0 ? availableCredit : 0,
          negativeBalance: availableCredit < 0 ? availableCredit : 0,
          type: account.type,
          color: account.color || "hsl(var(--primary))",
          usedCredit,
          limitAmount: account.limit_amount || 0,
        };
      })
      .filter((card) => card.balance !== 0);
  }, [accounts]);

  // Chart config específico para o gráfico de cartões de crédito
  const creditCardChartConfig = useMemo(() => {
    const config: Record<string, { label: string; color: string }> = {};
    creditCardBalanceData.forEach((card) => {
      config[card.name] = {
        label: card.name,
        color: card.color,
      };
    });
    return config;
  }, [creditCardBalanceData]);

  // Dados para o gráfico de limite usado dos cartões
  const creditCardUsedData = useMemo(() => {
    return accounts
      .filter((acc) => acc.type === "credit")
      .map((account) => {
        const usedCredit = account.balance < 0 ? Math.abs(account.balance) : 0;
        
        return {
          name: account.name.split(" - ")[0] || account.name,
          balance: usedCredit,
          positiveBalance: usedCredit > 0 ? usedCredit : 0,
          negativeBalance: 0,
          type: account.type,
          color: account.color || "hsl(var(--primary))",
          limitAmount: account.limit_amount || 0,
        };
      })
      .filter((card) => card.balance !== 0);
  }, [accounts]);

  // Chart config para o gráfico de limite usado
  const creditCardUsedChartConfig = useMemo(() => {
    const config: Record<string, { label: string; color: string }> = {};
    creditCardUsedData.forEach((card) => {
      config[card.name] = {
        label: card.name,
        color: card.color,
      };
    });
    return config;
  }, [creditCardUsedData]);

  const handleExportPDF = async () => {
    if (!contentRef.current) {
      toast({
        title: "Erro",
        description: "Conteúdo não encontrado para exportação.",
        variant: "destructive",
      });
      return;
    }

    toast({
      title: "Gerando PDF...",
      description: "Aguarde enquanto preparamos o relatório completo.",
    });

    try {
      window.scrollTo(0, 0);
      window.dispatchEvent(new Event("resize"));
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // Lazy load dependencies
      const { jsPDF } = await loadJsPDF();
      const htmlToImage = await loadHtmlToImage();

      const pdf = new jsPDF("p", "mm", "a4");
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const margin = 15;
      const contentWidth = pageWidth - 2 * margin;
      const maxContentHeight = pageHeight - 2 * margin;

      // Header
      pdf.setFontSize(18);
      pdf.setFont("helvetica", "bold");
      pdf.text("Relatório de Análises Financeiras", pageWidth / 2, margin, { align: "center" });
      
      pdf.setFontSize(10);
      pdf.setFont("helvetica", "normal");
      const dateText = `Gerado em: ${format(new Date(), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}`;
      pdf.text(dateText, pageWidth / 2, margin + 7, { align: "center" });

      let currentY = margin + 15;

      // Captura os cards de resumo
      const summaryCards = contentRef.current.querySelectorAll(".analytics-section")[0];
      if (summaryCards && summaryCards instanceof HTMLElement) {
        const rect = summaryCards.getBoundingClientRect();
        const dataUrl = await htmlToImage.toPng(summaryCards, {
          pixelRatio: 2,
          cacheBust: true,
          backgroundColor: "#ffffff",
          filter: (node: HTMLElement | HTMLCanvasElement) => {
            if (node instanceof HTMLCanvasElement && (node.width === 0 || node.height === 0)) {
              return false;
            }
            return true;
          },
        });

        const imgWidth = contentWidth;
        const imgHeight = (rect.height * imgWidth) / rect.width;
        if (currentY + imgHeight > pageHeight - margin) {
          pdf.addPage();
          currentY = margin;
        }

        pdf.addImage(dataUrl, "PNG", margin, currentY, imgWidth, imgHeight);
        currentY += imgHeight + 10;
      }

      // Captura cada gráfico individualmente
      const chartCards = contentRef.current.querySelectorAll(".financial-card");
      
      for (let i = 0; i < chartCards.length; i++) {
        const card = chartCards[i] as HTMLElement;
        
        // Pular os cards de resumo (primeiros 3)
        if (i < 3) continue;
        
        if (card.offsetWidth === 0 || card.offsetHeight === 0) continue;

        const rect = card.getBoundingClientRect();
        const dataUrl = await htmlToImage.toPng(card, {
          pixelRatio: 2,
          cacheBust: true,
          backgroundColor: "#ffffff",
          filter: (node: Node) => {
            if (node instanceof HTMLCanvasElement && (node.width === 0 || node.height === 0)) {
              return false;
            }
            return true;
          },
        });

        let imgWidth = contentWidth;
        let imgHeight = (rect.height * imgWidth) / rect.width;

        if (imgHeight > maxContentHeight) {
          imgHeight = maxContentHeight;
          imgWidth = (rect.width * imgHeight) / rect.height;
        }

        // Adiciona nova página se necessário
        if (currentY + imgHeight > pageHeight - margin) {
          pdf.addPage();
          currentY = margin;
        }

        // Centraliza imagens menores
        const xPos = imgWidth < contentWidth ? margin + (contentWidth - imgWidth) / 2 : margin;
        
        pdf.addImage(dataUrl, "PNG", xPos, currentY, imgWidth, imgHeight);
        currentY += imgHeight + 8;
      }

      const periodLabel =
        dateFilter === "current_month"
          ? format(new Date(), "MMMM-yyyy", { locale: ptBR })
          : dateFilter === "month_picker"
          ? format(selectedMonth, "MMMM-yyyy", { locale: ptBR })
          : "completo";
      
      pdf.save(`relatorio-analises-${periodLabel}.pdf`);

      toast({
        title: "Relatório Exportado",
        description: "PDF baixado com sucesso",
      });
    } catch (error) {
      logger.error("Erro ao gerar PDF:", error);
      toast({
        title: "Erro ao Gerar PDF",
        description: "Não foi possível criar o arquivo PDF. Tente novamente.",
        variant: "destructive",
      });
    }
  };

  const chartConfig = {
    receitas: {
      label: "Receitas",
      color: "hsl(var(--success))",
    },
    despesas: {
      label: "Despesas",
      color: "hsl(var(--destructive))",
    },
    saldo: {
      label: "Saldo",
      color: "hsl(var(--primary))",
    },
  };

  // Chart config específico para o gráfico de categorias
  // Memoize tooltip formatters to prevent re-renders
  const categoryTooltipFormatter = useMemo(
    () => (value: number, name: string) => [formatCurrency(value), name],
    [formatCurrency]
  );

  const accountTooltipFormatter = useMemo(
    () => (value: number, _name: string, props: any) => {
      // Show only the actual balance value, not the split values
      if (props?.payload?.balance !== undefined) {
        return [formatCurrency(props.payload.balance), "Saldo"];
      }
      return [formatCurrency(value), "Saldo"];
    },
    [formatCurrency]
  );

  const monthlyTooltipFormatter = useMemo(
    () => (value: number, name: string) => [
      formatCurrency(value),
      name === "receitas"
        ? "Receitas"
        : name === "despesas"
        ? "Despesas"
        : name === "saldo"
        ? "Saldo Acumulado"
        : name,
    ],
    [formatCurrency]
  );

  // Memoize custom dot renderer with unique keys for Line chart
  const renderMonthlyDot = useMemo(
    () => (props: DotProps) => {
      const { cx, cy, payload, index } = props;
      const saldo = payload?.saldo || 0;
      const uniqueKey = `monthly-dot-${index}-${payload?.month || index}`;
      return (
        <circle
          key={uniqueKey}
          cx={cx}
          cy={cy}
          r={isMobile ? 3 : 4}
          fill={
            saldo >= 0
              ? "hsl(var(--primary))"
              : "hsl(var(--destructive))"
          }
          stroke="hsl(var(--background))"
          strokeWidth={2}
        />
      );
    },
    [isMobile]
  );

  const categoryChartConfig = useMemo(() => {
    const config: Record<string, { label: string; color: string }> = {};
    categoryData.forEach((item, index) => {
      config[item.category] = {
        label: item.category,
        color: item.fill || COLORS[index % COLORS.length],
      };
    });
    return config;
  }, [categoryData]);

  // Filter chips configuration
  const filterChips = useMemo(() => {
    const chips: Array<{
      id: string;
      label: string;
      value: string;
      color?: string;
      onRemove: () => void;
    }> = [];

    if (searchTerm) {
      chips.push({
        id: "search",
        label: `Busca: ${searchTerm}`,
        value: searchTerm,
        onRemove: () => setSearchTerm(""),
      });
    }

    if (filterType !== "all") {
      const typeLabels = {
        income: "Receitas",
        expense: "Despesas",
        transfer: "Transferências",
      };
      chips.push({
        id: "type",
        label: `Tipo: ${typeLabels[filterType as keyof typeof typeLabels]}`,
        value: filterType,
        onRemove: () => setFilterType("all"),
      });
    }

    if (filterAccount !== "all") {
      const account = accounts.find((a) => a.id === filterAccount);
      chips.push({
        id: "account",
        label: `Conta: ${account?.name || filterAccount}`,
        value: filterAccount,
        color: account?.color,
        onRemove: () => setFilterAccount("all"),
      });
    }

    if (filterCategory !== "all") {
      const category = categories.find((c) => c.id === filterCategory);
      chips.push({
        id: "category",
        label: `Categoria: ${category?.name || filterCategory}`,
        value: filterCategory,
        color: category?.color,
        onRemove: () => setFilterCategory("all"),
      });
    }

    if (filterStatus !== "all") {
      const statusLabels = {
        completed: "Concluídas",
        pending: "Pendentes",
      };
      chips.push({
        id: "status",
        label: `Status: ${statusLabels[filterStatus as keyof typeof statusLabels]}`,
        value: filterStatus,
        onRemove: () => setFilterStatus("all"),
      });
    }

    if (dateFilter !== "all") {
      const periodLabels = {
        current_month: "Mês Atual",
        month_picker: "Navegar por Mês",
        custom: "Personalizado",
      };
      chips.push({
        id: "period",
        label: `Período: ${periodLabels[dateFilter as keyof typeof periodLabels]}`,
        value: dateFilter,
        onRemove: () => setDateFilter("all"),
      });
    }

    return chips;
  }, [searchTerm, filterType, filterAccount, filterCategory, filterStatus, dateFilter, accounts, categories]);

  const clearAllFilters = () => {
    setSearchTerm("");
    setFilterType("all");
    setFilterAccount("all");
    setFilterCategory("all");
    setFilterStatus("all");
    setDateFilter("all");
  };

  return (
    <div ref={contentRef} className="spacing-responsive-lg fade-in pb-6 sm:pb-8">{/*  Header */}
      <div className="flex flex-col gap-3">
        <div className="grid grid-cols-1 gap-2 w-full md:grid-cols-1 lg:flex lg:flex-nowrap lg:gap-2 lg:w-auto lg:ml-auto">
          <Button
            variant="outline"
            onClick={handleExportPDF}
            className="gap-1.5 apple-interaction h-9 text-xs sm:text-sm px-3"
          >
            <Download className="h-3.5 w-3.5 sm:h-4 sm:w-4 flex-shrink-0" />
            <span className="truncate whitespace-nowrap">Exportar PDF</span>
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="analytics-section grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mt-6">
        <Card className="financial-card">
          <CardContent className="p-4">
            <div className="flex flex-col items-center gap-2 text-center">
              <div className="w-12 h-12 rounded-full bg-success/10 flex items-center justify-center">
                <TrendingUp className="h-6 w-6 text-success" />
              </div>
              <div>
                <p className="text-caption font-medium">Receitas</p>
                <p className="text-caption text-muted-foreground">Período filtrado</p>
              </div>
              <div className="balance-text balance-positive">
                {formatCurrency(totalsByType.income)}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="financial-card">
          <CardContent className="p-4">
            <div className="flex flex-col items-center gap-2 text-center">
              <div className="w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center">
                <TrendingDown className="h-6 w-6 text-destructive" />
              </div>
              <div>
                <p className="text-caption font-medium">Despesas</p>
                <p className="text-caption text-muted-foreground">Período filtrado</p>
              </div>
              <div className="balance-text balance-negative">
                {formatCurrency(totalsByType.expenses)}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="financial-card md:col-span-2 lg:col-span-1">
          <CardContent className="p-4">
            <div className="flex flex-col items-center gap-2 text-center">
              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                <BarChart3 className="h-6 w-6 text-primary" />
              </div>
              <div>
                <p className="text-caption font-medium">Saldo Líquido</p>
                <p className="text-caption text-muted-foreground">Período filtrado</p>
              </div>
              <div className={`balance-text ${
                totalsByType.income - totalsByType.expenses >= 0 ? "balance-positive" : "balance-negative"
              }`}>
                {formatCurrency(totalsByType.income - totalsByType.expenses)}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card className="mt-6">
        <CardContent className="p-4 space-y-4">
          <div className="flex flex-col gap-4">
            {/* Filter button and active chips */}
            <div className="flex flex-wrap items-center gap-3">
              <AnalyticsFilterDialog
                open={filterDialogOpen}
                onOpenChange={setFilterDialogOpen}
                filterType={filterType}
                onFilterTypeChange={(value) => setFilterType(value as typeof filterType)}
                filterStatus={filterStatus}
                onFilterStatusChange={(value) => setFilterStatus(value as typeof filterStatus)}
                filterAccount={filterAccount}
                onFilterAccountChange={setFilterAccount}
                filterCategory={filterCategory}
                onFilterCategoryChange={setFilterCategory}
                dateFilter={dateFilter}
                onDateFilterChange={(value) => setDateFilter(value as typeof dateFilter)}
                customStartDate={customStartDate}
                onCustomStartDateChange={setCustomStartDate}
                customEndDate={customEndDate}
                onCustomEndDateChange={setCustomEndDate}
                accounts={accounts}
                categories={categories}
                activeFiltersCount={filterChips.length}
              />
              
              <TransactionFilterChips
                chips={filterChips}
                onClearAll={clearAllFilters}
              />
            </div>

            {/* Search and Period Filter */}
            <div className="flex flex-col sm:flex-row gap-3">
              {/* Search */}
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar transações..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>

              {/* Period Navigation - visível apenas quando selecionado */}
              {dateFilter === "month_picker" && (
                <div className="flex items-center gap-2 px-3 border border-input rounded-md bg-background min-w-[220px]">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setSelectedMonth(subMonths(selectedMonth, 1))}
                    className="h-8 w-8 p-0 flex-shrink-0"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <span className="flex-1 text-center text-sm font-medium">
                    {format(selectedMonth, "MMM/yyyy", { locale: ptBR })}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setSelectedMonth(addMonths(selectedMonth, 1))}
                    className="h-8 w-8 p-0 flex-shrink-0"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              )}

              {/* Custom Date Range Display */}
              {dateFilter === "custom" && customStartDate && customEndDate && (
                <div className="flex items-center gap-2 px-3 border border-input rounded-md bg-background min-w-[220px]">
                  <span className="text-sm font-medium whitespace-nowrap">
                    {format(customStartDate, "dd/MM/yyyy", { locale: ptBR })} - {format(customEndDate, "dd/MM/yyyy", { locale: ptBR })}
                  </span>
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Charts Grid */}
      <div className="analytics-section grid grid-cols-1 gap-3 sm:gap-4 mt-6">
        {/* Category Pie Chart */}
        <Card className="financial-card">
          {/* 2. BOTÕES DE ALTERNÂNCIA ATUALIZADOS COM CORES */}
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 px-3 pt-3 sm:px-4 sm:pt-4">
            <CardTitle className="text-headline flex items-center gap-2">
              <PieChart className="h-4 w-4 sm:h-5 sm:w-5" />
              {categoryChartType === "income" ? "Receitas" : "Despesas"} por Categoria
            </CardTitle>

            <div className="flex gap-1 rounded-lg bg-muted p-1">
              <Button
                size="sm"
                variant={
                  categoryChartType === "expense" ? "destructive" : "ghost"
                }
                onClick={() => setCategoryChartType("expense")}
                className="h-6 px-2 text-caption sm:h-7 sm:px-3"
              >
                Despesas
              </Button>
              <Button
                size="sm"
                variant={categoryChartType === "income" ? "default" : "ghost"}
                onClick={() => setCategoryChartType("income")}
                className={cn(
                  "h-6 px-2 text-caption sm:h-7 sm:px-3",
                  categoryChartType === "income" &&
                    "bg-success text-success-foreground hover:bg-success/90"
                )}
              >
                Receitas
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-2 sm:p-3">
            <div className="relative w-full">
              <ChartContainer
                config={categoryChartConfig}
                className={`${responsiveConfig.containerHeight} w-full overflow-hidden`}
              >
               <RechartsPieChart width={undefined} height={undefined}>
                <ChartTooltip
                  content={<ChartTooltipContent />}
                  formatter={categoryTooltipFormatter}
                />
                <Pie
                  data={categoryData.map((item) => ({
                    ...item,
                    name: item.category,
                    value: item.amount,
                  }))}
                  cx={isMobile ? "50%" : "35%"}
                  cy="50%"
                  labelLine={false}
                  label={false}
                  outerRadius={responsiveConfig.outerRadius}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {categoryData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.fill} />
                  ))}
                </Pie>
              </RechartsPieChart>
              
              {/* Custom Legend - desktop/tablet (ao lado do gráfico) */}
              {!isMobile && categoryData.length > 0 && (
                <div 
                  className={cn(
                    "flex flex-col gap-2 px-4 absolute right-4 top-1/2 -translate-y-1/2",
                  )}
                  style={{ maxWidth: "35%" }}
                >
                  {categoryData.map((item, index) => (
                    <div 
                      key={`legend-${index}`} 
                      className="flex items-center justify-between gap-2 text-caption"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <div 
                          className="w-3 h-3 rounded-full flex-shrink-0" 
                          style={{ backgroundColor: item.fill }}
                        />
                        <span className="truncate text-foreground">
                          {item.category}
                        </span>
                      </div>
                      <span className="text-muted-foreground font-medium flex-shrink-0">
                        {item.percentage.toFixed(1)}%
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </ChartContainer>
            </div>

            {/* Custom Legend - mobile (abaixo do gráfico) */}
            {isMobile && categoryData.length > 0 && (
              <div className="mt-4 flex flex-col gap-2 px-2">
                {categoryData.map((item, index) => (
                  <div 
                    key={`legend-mobile-${index}`} 
                    className="flex items-center justify-between gap-2 text-caption"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <div 
                        className="w-3 h-3 rounded-full flex-shrink-0" 
                        style={{ backgroundColor: item.fill }}
                      />
                      <span className="truncate text-foreground">
                        {item.category}
                      </span>
                    </div>
                    <span className="text-muted-foreground font-medium flex-shrink-0">
                      {item.percentage.toFixed(1)}%
                    </span>
                  </div>
                ))}
              </div>
            )}
            {categoryData.length === 0 && (
              <div className="text-body text-center text-muted-foreground py-8">
                Nenhuma transação encontrada para o período selecionado
              </div>
            )}
          </CardContent>
        </Card>

        {/* Account Balances */}
        <Card className="financial-card">
          <CardHeader className="px-3 pt-3 pb-2 sm:px-4 sm:pt-4">
            <CardTitle className="text-headline flex items-center gap-2">
              <BarChart3 className="h-4 w-4 sm:h-5 sm:w-5" />
              Saldos por Conta
            </CardTitle>
          </CardHeader>
          <CardContent className="px-2 pb-2 pt-18 sm:px-3 sm:pb-3 sm:pt-27">
            <div className="relative w-full">
              <ChartContainer
                config={accountChartConfig}
                className="min-h-[336px] sm:min-h-[128px] lg:min-h-[624px] w-full overflow-hidden"
              >
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={accountBalanceData}
                    margin={{
                      top: 20,
                      right: isMobile ? 15 : 240,
                      bottom: isMobile ? 20 : 30,
                      left: isMobile ? 10 : 20
                    }}
                  >
                  <XAxis
                    dataKey="name"
                    tick={false}
                    axisLine={false}
                    height={0}
                  />
                  <YAxis
                    tickFormatter={(value) =>
                      formatCurrencyForAxis(value / 100, isMobile)
                    }
                    tick={{ fontSize: isMobile ? 9 : 11 }}
                  />
                  <ChartTooltip
                    content={<ChartTooltipContent />}
                    formatter={accountTooltipFormatter}
                   />
                   <Bar dataKey="positiveBalance" stackId="balance" fill="hsl(var(--success))">
                     {accountBalanceData.map((entry, index) => (
                       <Cell key={`cell-positive-${index}`} fill={entry.balance > 0 ? entry.color : "transparent"} />
                     ))}
                   </Bar>
                   <Bar dataKey="negativeBalance" stackId="balance" fill="hsl(var(--destructive))">
                     {accountBalanceData.map((entry, index) => (
                       <Cell key={`cell-negative-${index}`} fill={entry.balance < 0 ? entry.color : "transparent"} />
                     ))}
                   </Bar>
                 </BarChart>
              </ResponsiveContainer>
            </ChartContainer>

            {/* Legenda de Contas - desktop/tablet (dentro do container) */}
            {!isMobile && accountBalanceData.length > 0 && (
              <div 
                className="flex flex-col gap-2 px-4 absolute right-2 top-1/2 -translate-y-1/2 z-10"
                style={{ maxWidth: "38%" }}
              >
                {accountBalanceData.map((account, index) => (
                  <div 
                    key={`legend-account-desktop-${index}`} 
                    className="flex items-center justify-between gap-2 text-caption"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <div 
                        className="w-3 h-3 rounded-full flex-shrink-0" 
                        style={{ backgroundColor: account.color }}
                      />
                      <span className="truncate text-foreground">
                        {account.name}
                      </span>
                    </div>
                    <span className={`font-medium flex-shrink-0 ${
                      account.balance >= 0 ? 'text-success' : 'text-destructive'
                    }`}>
                      {formatCurrency(account.balance)}
                    </span>
                  </div>
                ))}
              </div>
            )}
            </div>

            {/* Legenda de Contas - mobile (abaixo do gráfico) */}
            {isMobile && accountBalanceData.length > 0 && (
              <div className="mt-4 flex flex-col gap-2 px-2">
                {accountBalanceData.map((account, index) => (
                  <div 
                    key={`legend-account-mobile-${index}`} 
                    className="flex items-center justify-between gap-2 text-caption"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <div 
                        className="w-3 h-3 rounded-full flex-shrink-0" 
                        style={{ backgroundColor: account.color }}
                      />
                      <span className="truncate text-foreground">
                        {account.name}
                      </span>
                    </div>
                    <span className={`font-medium flex-shrink-0 ${
                      account.balance >= 0 ? 'text-success' : 'text-destructive'
                    }`}>
                      {formatCurrency(account.balance)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Credit Card Balances */}
        {creditCardBalanceData.length > 0 && (
          <Card className="financial-card">
            <CardHeader className="px-3 pt-3 pb-2 sm:px-4 sm:pt-4">
              <CardTitle className="text-headline flex items-center gap-2">
                <BarChart3 className="h-4 w-4 sm:h-5 sm:w-5" />
                Crédito Disponível - Cartões
              </CardTitle>
            </CardHeader>
            <CardContent className="px-2 pb-2 pt-18 sm:px-3 sm:pb-3 sm:pt-27">
              <div className="relative w-full">
                <ChartContainer
                  config={creditCardChartConfig}
                  className="min-h-[336px] sm:min-h-[128px] lg:min-h-[624px] w-full overflow-hidden"
                >
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={creditCardBalanceData}
                      margin={{
                        top: 20,
                        right: isMobile ? 15 : 240,
                        bottom: isMobile ? 20 : 30,
                        left: isMobile ? 10 : 20
                      }}
                    >
                    <XAxis
                      dataKey="name"
                      tick={false}
                      axisLine={false}
                      height={0}
                    />
                    <YAxis
                      tickFormatter={(value) =>
                        formatCurrencyForAxis(value / 100, isMobile)
                      }
                      tick={{ fontSize: isMobile ? 9 : 11 }}
                    />
                    <ChartTooltip
                      content={<ChartTooltipContent />}
                      formatter={(value: number, _name: string, props: any) => {
                        if (props?.payload?.balance !== undefined) {
                          return [formatCurrency(props.payload.balance), "Crédito Disponível"];
                        }
                        return [formatCurrency(value), "Crédito Disponível"];
                      }}
                     />
                     <Bar dataKey="positiveBalance" stackId="balance" fill="hsl(var(--success))">
                       {creditCardBalanceData.map((entry, index) => (
                         <Cell key={`cell-credit-positive-${index}`} fill={entry.balance > 0 ? entry.color : "transparent"} />
                       ))}
                     </Bar>
                     <Bar dataKey="negativeBalance" stackId="balance" fill="hsl(var(--destructive))">
                       {creditCardBalanceData.map((entry, index) => (
                         <Cell key={`cell-credit-negative-${index}`} fill={entry.balance < 0 ? entry.color : "transparent"} />
                       ))}
                     </Bar>
                   </BarChart>
                </ResponsiveContainer>
              </ChartContainer>

              {/* Legenda de Cartões - desktop/tablet (dentro do container) */}
              {!isMobile && creditCardBalanceData.length > 0 && (
                <div 
                  className="flex flex-col gap-2 px-4 absolute right-2 top-1/2 -translate-y-1/2 z-10"
                  style={{ maxWidth: "38%" }}
                >
                  {creditCardBalanceData.map((card, index) => (
                    <div 
                      key={`legend-credit-desktop-${index}`} 
                      className="flex items-center justify-between gap-2 text-caption"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <div 
                          className="w-3 h-3 rounded-full flex-shrink-0" 
                          style={{ backgroundColor: card.color }}
                        />
                        <span className="truncate text-foreground">
                          {card.name}
                        </span>
                      </div>
                      <span className={`font-medium flex-shrink-0 ${
                        card.balance >= 0 ? 'text-success' : 'text-destructive'
                      }`}>
                        {formatCurrency(card.balance)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
              </div>

              {/* Legenda de Cartões - mobile (abaixo do gráfico) */}
              {isMobile && creditCardBalanceData.length > 0 && (
                <div className="mt-4 flex flex-col gap-2 px-2">
                  {creditCardBalanceData.map((card, index) => (
                    <div 
                      key={`legend-credit-mobile-${index}`} 
                      className="flex items-center justify-between gap-2 text-caption"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <div 
                          className="w-3 h-3 rounded-full flex-shrink-0" 
                          style={{ backgroundColor: card.color }}
                        />
                        <span className="truncate text-foreground">
                          {card.name}
                        </span>
                      </div>
                      <span className={`font-medium flex-shrink-0 ${
                        card.balance >= 0 ? 'text-success' : 'text-destructive'
                      }`}>
                        {formatCurrency(card.balance)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Credit Card Used Limit */}
        {creditCardUsedData.length > 0 && (
          <Card className="financial-card">
            <CardHeader className="px-3 pt-3 pb-2 sm:px-4 sm:pt-4">
              <CardTitle className="text-headline flex items-center gap-2">
                <BarChart3 className="h-4 w-4 sm:h-5 sm:w-5" />
                Limite Usado - Cartões
              </CardTitle>
            </CardHeader>
            <CardContent className="px-2 pb-2 pt-18 sm:px-3 sm:pb-3 sm:pt-27">
              <div className="relative w-full">
                <ChartContainer
                  config={creditCardUsedChartConfig}
                  className="min-h-[336px] sm:min-h-[128px] lg:min-h-[624px] w-full overflow-hidden"
                >
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={creditCardUsedData}
                      margin={{
                        top: 20,
                        right: isMobile ? 15 : 240,
                        bottom: isMobile ? 20 : 30,
                        left: isMobile ? 10 : 20
                      }}
                    >
                    <XAxis
                      dataKey="name"
                      tick={false}
                      axisLine={false}
                      height={0}
                    />
                    <YAxis
                      tickFormatter={(value) =>
                        formatCurrencyForAxis(value / 100, isMobile)
                      }
                      tick={{ fontSize: isMobile ? 9 : 11 }}
                    />
                    <ChartTooltip
                      content={<ChartTooltipContent />}
                      formatter={(value: number, _name: string, props: any) => {
                        if (props?.payload?.balance !== undefined) {
                          return [formatCurrency(props.payload.balance), "Limite Usado"];
                        }
                        return [formatCurrency(value), "Limite Usado"];
                      }}
                     />
                     <Bar dataKey="positiveBalance" stackId="balance" fill="hsl(var(--destructive))">
                       {creditCardUsedData.map((entry, index) => (
                         <Cell key={`cell-used-positive-${index}`} fill={entry.color} />
                       ))}
                     </Bar>
                   </BarChart>
                </ResponsiveContainer>
              </ChartContainer>

              {/* Legenda de Limite Usado - desktop/tablet */}
              {!isMobile && creditCardUsedData.length > 0 && (
                <div 
                  className="flex flex-col gap-2 px-4 absolute right-2 top-1/2 -translate-y-1/2 z-10"
                  style={{ maxWidth: "38%" }}
                >
                  {creditCardUsedData.map((card, index) => (
                    <div 
                      key={`legend-used-desktop-${index}`} 
                      className="flex items-center justify-between gap-2 text-caption"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <div 
                          className="w-3 h-3 rounded-full flex-shrink-0" 
                          style={{ backgroundColor: card.color }}
                        />
                        <span className="truncate text-foreground">
                          {card.name}
                        </span>
                      </div>
                      <span className="font-medium flex-shrink-0 text-destructive">
                        {formatCurrency(card.balance)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
              </div>

              {/* Legenda de Limite Usado - mobile */}
              {isMobile && creditCardUsedData.length > 0 && (
                <div className="mt-4 flex flex-col gap-2 px-2">
                  {creditCardUsedData.map((card, index) => (
                    <div 
                      key={`legend-used-mobile-${index}`} 
                      className="flex items-center justify-between gap-2 text-caption"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <div 
                          className="w-3 h-3 rounded-full flex-shrink-0" 
                          style={{ backgroundColor: card.color }}
                        />
                        <span className="truncate text-foreground">
                          {card.name}
                        </span>
                      </div>
                      <span className="font-medium flex-shrink-0 text-destructive">
                        {formatCurrency(card.balance)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Monthly Trend */}
        <Card className="financial-card">
          <CardHeader className="px-3 pt-3 pb-2 sm:px-4 sm:pt-4">
            <CardTitle className="text-headline flex items-center gap-2">
              <TrendingUp className="h-4 w-4 sm:h-5 sm:w-5" />
              Evolução Mensal - Receitas vs Despesas
            </CardTitle>
          </CardHeader>
          <CardContent className="p-2 sm:p-3">
            <ChartContainer
              config={chartConfig}
              className={`${responsiveConfig.containerHeight} w-full overflow-hidden`}
            >
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart
                  data={monthlyData}
                  margin={getComposedChartMargins(responsiveConfig)}
                >
                  <XAxis
                    dataKey="month"
                    {...getBarChartAxisProps(responsiveConfig).xAxis}
                  />
                  <YAxis
                    tickFormatter={(value) =>
                      formatCurrencyForAxis(value / 100, isMobile)
                    }
                    {...getBarChartAxisProps(responsiveConfig).yAxis}
                  />
                  <ChartTooltip
                    content={<ChartTooltipContent />}
                    formatter={monthlyTooltipFormatter}
                    labelFormatter={(label) => `Mês de ${label}`}
                  />

                  {/* Legenda apenas no desktop */}
                  {!isMobile && (
                    <ChartLegend
                      content={
                        <ChartLegendContent className="flex justify-center gap-6" />
                      }
                      verticalAlign="top"
                    />
                  )}

                  {/* Barras de Receitas com cor sólida */}
                  <Bar
                    dataKey="receitas"
                    fill="hsl(var(--success))"
                    radius={[4, 4, 0, 0]}
                    name="Receitas"
                  />

                  {/* Barras de Despesas com cor sólida */}
                  <Bar
                    dataKey="despesas"
                    fill="hsl(var(--destructive))"
                    radius={[4, 4, 0, 0]}
                    name="Despesas"
                  />

                  {/* Linha de saldo com pontos condicionais */}
                  <Line
                    type="monotone"
                    dataKey="saldo"
                    stroke="hsl(var(--primary))"
                    strokeWidth={isMobile ? 2 : 3}
                    dot={renderMonthlyDot}
                    activeDot={{
                      r: isMobile ? 5 : 6,
                      strokeWidth: 2,
                      fill: "hsl(var(--primary))",
                      stroke: "hsl(var(--background))",
                    }}
                    connectNulls={false}
                    name="Saldo Acumulado"
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </ChartContainer>

            {/* Indicadores visuais no mobile */}
            {isMobile && monthlyData.length > 0 && (
              <div className="grid grid-cols-3 gap-2 mt-3 text-caption">
                <div className="flex items-center gap-1 justify-center">
                  <div className="w-3 h-3 rounded bg-success flex-shrink-0"></div>
                  <span className="text-muted-foreground truncate">Receitas</span>
                </div>
                <div className="flex items-center gap-1 justify-center">
                  <div className="w-3 h-3 rounded bg-destructive flex-shrink-0"></div>
                  <span className="text-muted-foreground truncate">Despesas</span>
                </div>
                <div className="flex items-center gap-1 justify-center">
                  <div className="w-3 h-0.5 bg-primary flex-shrink-0"></div>
                  <span className="text-muted-foreground truncate">Saldo</span>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>


      {/* Expense Details Table */}
      <Card className="financial-card">
        <CardHeader>
          <CardTitle className="text-headline">
            <span className="block sm:hidden">Detalhes - Despesas</span>
            <span className="hidden sm:block">Detalhes por Categoria - Despesas</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {expenseData.length === 0 ? (
            <div className="text-body text-center py-8 text-muted-foreground">
              <PieChart className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p className="text-body">
                Nenhuma despesa no período selecionado
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto -mx-2 px-2 sm:mx-0 sm:px-0">
              <table className="w-full min-w-max sm:min-w-0">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 text-caption">
                      Categoria
                    </th>
                    <th className="text-right py-2 text-caption">
                      Valor
                    </th>
                    <th className="text-right py-2 text-caption hidden sm:table-cell">
                      %
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {expenseData.map((item) => (
                    <tr key={item.category} className="border-b last:border-b-0">
                      <td className="py-2 sm:py-3">
                        <div className="flex items-center gap-2 sm:gap-3">
                          <div
                            className="w-3 h-3 sm:w-4 sm:h-4 rounded-full flex-shrink-0"
                            style={{ backgroundColor: item.fill }}
                          />
                          <span className="text-body truncate max-w-[120px] sm:max-w-none">
                            {item.category}
                          </span>
                        </div>
                      </td>
                      <td className="text-right py-2 sm:py-3 font-medium text-body">
                        <div className="flex flex-col sm:block">
                          <span>{formatCurrency(item.amount)}</span>
                          <span className="text-caption text-muted-foreground sm:hidden">
                            {item.percentage.toFixed(1)}%
                          </span>
                        </div>
                      </td>
                      <td className="text-right py-2 sm:py-3 text-body hidden sm:table-cell">
                        {item.percentage.toFixed(1)}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Income Details Table */}
      <Card className="financial-card">
        <CardHeader>
          <CardTitle className="text-headline">
            <span className="block sm:hidden">Detalhes - Receitas</span>
            <span className="hidden sm:block">Detalhes por Categoria - Receitas</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {incomeData.length === 0 ? (
            <div className="text-body text-center py-8 text-muted-foreground">
              <PieChart className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p className="text-body">
                Nenhuma receita no período selecionado
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto -mx-2 px-2 sm:mx-0 sm:px-0">
              <table className="w-full min-w-max sm:min-w-0">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 text-caption">
                      Categoria
                    </th>
                    <th className="text-right py-2 text-caption">
                      Valor
                    </th>
                    <th className="text-right py-2 text-caption hidden sm:table-cell">
                      %
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {incomeData.map((item) => (
                    <tr key={item.category} className="border-b last:border-b-0">
                      <td className="py-2 sm:py-3">
                        <div className="flex items-center gap-2 sm:gap-3">
                          <div
                            className="w-3 h-3 sm:w-4 sm:h-4 rounded-full flex-shrink-0"
                            style={{ backgroundColor: item.fill }}
                          />
                          <span className="text-body truncate max-w-[120px] sm:max-w-none">
                            {item.category}
                          </span>
                        </div>
                      </td>
                      <td className="text-right py-2 sm:py-3 font-medium text-body">
                        <div className="flex flex-col sm:block">
                          <span>{formatCurrency(item.amount)}</span>
                          <span className="text-caption text-muted-foreground sm:hidden">
                            {item.percentage.toFixed(1)}%
                          </span>
                        </div>
                      </td>
                      <td className="text-right py-2 sm:py-3 text-body hidden sm:table-cell">
                        {item.percentage.toFixed(1)}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}