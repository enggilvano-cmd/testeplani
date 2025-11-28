import { useState, useMemo, useRef, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";

import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Upload, FileSpreadsheet, AlertCircle, MoreVertical, PlusCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { logger } from "@/lib/logger";
import { loadXLSX } from "@/lib/lazyImports";
import { parse, isValid } from "date-fns";
import { ptBR } from "date-fns/locale";
import { createDateFromString } from "@/lib/dateUtils";
import type { ImportTransactionData } from '@/types';
import { ImportSummaryCards } from "@/components/import/ImportSummaryCards";

interface Account {
  id: string;
  name: string;
  type: "checking" | "savings" | "credit" | "investment";
  balance: number;
  color: string;
}

interface Transaction {
  id: string;
  description: string;
  amount: number;
  date: Date | string;
  type: "income" | "expense" | "transfer";
  account_id: string;
  status: "pending" | "completed";
}

interface ImportTransactionsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  transactions: Transaction[];
  accounts: Account[];
  onImportTransactions: (transactions: ImportTransactionData[], transactionsToReplace: string[]) => void;
}

interface ImportedTransaction {
  data: string;
  descricao: string;
  categoria: string;
  tipo: string;
  conta: string;
  valor: number;
  status?: string;
  parcelas?: string; // Mantido como string para leitura inicial
  invoiceMonth?: string;
  isFixed?: boolean;
  isValid: boolean;
  errors: string[];
  accountId?: string;
  parsedDate?: Date;
  parsedType?: 'income' | 'expense' | 'transfer';
  parsedStatus?: 'completed' | 'pending';
  isDuplicate: boolean;
  existingTransactionId?: string;
  resolution: 'skip' | 'add' | 'replace'; // Ação para duplicatas
}

export function ImportTransactionsModal({ 
  open, 
  onOpenChange, 
  transactions,
  accounts, 
  onImportTransactions 
}: ImportTransactionsModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [importedData, setImportedData] = useState<ImportedTransaction[]>([]);
  const [excludedIndexes, setExcludedIndexes] = useState<Set<number>>(new Set());
  const [isProcessing, setIsProcessing] = useState(false);
  const { toast } = useToast();
  const previewSectionRef = useRef<HTMLDivElement>(null);

  // Auto-scroll para preview após processar
  useEffect(() => {
    if (importedData.length > 0 && previewSectionRef.current) {
      setTimeout(() => {
        previewSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 100);
    }
  }, [importedData.length]);

  // Suporte a cabeçalhos exportados em diferentes idiomas
  const HEADERS = {
    date: ['Data', 'Date', 'Fecha'],
    description: ['Descrição', 'Description', 'Descripción'],
    category: ['Categoria', 'Category', 'Categoría'],
    type: ['Tipo', 'Type', 'Tipo'],
    account: ['Conta', 'Account', 'Cuenta'],
    amount: ['Valor', 'Amount', 'Valor'],
    status: ['Status', 'Status', 'Estado'],
    installments: ['Parcelas', 'Installments', 'Cuotas'],
    invoiceMonth: ['Mês Fatura', 'Invoice Month', 'Mes Factura'],
    isFixed: ['Fixa', 'Fixed', 'Fija']
  } as const;

  const pick = (row: Record<string, unknown>, keys: readonly string[]) => {
    // Mapa normalizado de chaves do Excel -> valor
    const keyMap = new Map<string, unknown>();
    for (const k of Object.keys(row)) {
      keyMap.set(normalizeKey(k), row[k]);
    }
    for (const key of keys) {
      const candidates = [key, key.toLowerCase()];
      for (const c of candidates) {
        const nk = normalizeKey(c);
        if (keyMap.has(nk)) {
          return keyMap.get(nk);
        }
      }
    }
    return '';
  };

  // Função para normalizar strings (remover acentos, espaços extras, etc.)
  const normalizeString = (str: string): string => {
    return str
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // Remove diacríticos (acentos)
      .replace(/\s+/g, ' '); // Normaliza espaços
  };
  const normalizeKey = (str: string): string => normalizeString(str).replace(/[^a-z0-9]/g, '');

  const validateTransactionType = (tipo: string): 'income' | 'expense' | 'transfer' | null => {
    const normalizedType = normalizeString(tipo);
    // Suporte para PT-BR, EN-US, ES-ES (singular e plural)
    if (['receita', 'receitas', 'income', 'entrada', 'entradas', 'ingreso', 'ingresos'].includes(normalizedType)) return 'income';
    if (['despesa', 'despesas', 'expense', 'expenses', 'saida', 'saidas', 'gasto', 'gastos'].includes(normalizedType)) return 'expense';
    if (['transferencia', 'transfer', 'transferir'].includes(normalizedType)) return 'transfer';
    return null;
  };

  const validateStatus = (status: string): 'completed' | 'pending' | null => {
    if (!status) return 'completed'; // padrão
    const normalizedStatus = normalizeString(status);
    // Suporte para PT-BR, EN-US, ES-ES
    if (['concluida', 'completed', 'finalizada', 'completada'].includes(normalizedStatus)) return 'completed';
    if (['pendente', 'pending', 'em andamento'].includes(normalizedStatus)) return 'pending';
    return null;
  };

  const findAccountByName = (accountName: string): Account | null => {
    const normalizedName = accountName.toLowerCase().trim();
    // Busca por correspondência exata para evitar ambiguidades
    return accounts.find(acc => acc.name.toLowerCase().trim() === normalizedName) || null;
  };

  const parseDate = (dateString: string): Date | null => {
    // Tentar diferentes formatos de data
    const formats = [
      'dd/MM/yyyy',
      'dd/MM/yy',
      'yyyy-MM-dd',
      'MM/dd/yyyy',
      'dd-MM-yyyy'
    ];

    for (const dateFormat of formats) {
      try {
        const parsed = parse(dateString, dateFormat, new Date(), { locale: ptBR });
        if (isValid(parsed)) {
          return parsed;
        }
      } catch (error) {
        continue;
      }
    }

    // Tentar parseamento automático
    const autoDate = new Date(dateString);
    return isValid(autoDate) ? autoDate : null;
  };

  const validateAndCheckDuplicate = (row: Record<string, unknown>): ImportedTransaction => {
    const errors: string[] = [];
    let isValid = true;

    // Usar o mapeador de cabeçalhos para suportar diferentes idiomas
    const data = String(pick(row, HEADERS.date) || '');
    const descricao = String(pick(row, HEADERS.description) || '');
    const categoria = String(pick(row, HEADERS.category) || '');
    const tipo = String(pick(row, HEADERS.type) || '');
    const conta = String(pick(row, HEADERS.account) || '');
    // Parse valor com suporte ao formato brasileiro (ponto = milhar, vírgula = decimal)
    // SEMPRE positivo - o edge function aplica o sinal baseado no tipo
    const rawValor = String(pick(row, HEADERS.amount) || '0');
    const valor = Math.abs(Math.round(parseFloat(rawValor.replace(/\./g, '').replace(',', '.')) * 100));

    if (!data) {
      errors.push('Data é obrigatória');
      isValid = false;
    }

    if (!descricao) {
      errors.push('Descrição é obrigatória');
      isValid = false;
    }

    if (!categoria) {
      errors.push('Categoria é obrigatória');
      isValid = false;
    }

    if (!tipo) {
      errors.push('Tipo é obrigatório');
      isValid = false;
    }

    if (!conta) {
      errors.push('Conta é obrigatória');
      isValid = false;
    }

    if (isNaN(valor)) {
      errors.push('Valor inválido. Deve ser um número');
      isValid = false;
    } else if (valor <= 0) {
      errors.push('Valor deve ser maior que zero');
      isValid = false;
    }

    // Validações específicas (Bloco único e corrigido)
    const parsedDate = parseDate(data);
    if (!parsedDate) {
      errors.push('Formato de data inválido. Use dd/MM/yyyy');
      isValid = false;
    }

    const parsedType = validateTransactionType(tipo);
    if (!parsedType) {
      errors.push('Tipo inválido. Use: Receita, Despesa ou Transferência');
      isValid = false;
    }

    const account = findAccountByName(conta);
    const accountId = account?.id; // Definir accountId aqui
    if (!account) {
      errors.push('Conta não encontrada. Verifique se a conta existe');
      isValid = false;
    }

    const statusStr = String(pick(row, HEADERS.status) || 'completed');
    const parsedStatus = validateStatus(statusStr);
    if (!parsedStatus) {
      errors.push('Status inválido. Use: Concluída ou Pendente');
      isValid = false;
    }

    // Processar campos opcionais adicionais
    const invoiceMonth = String(pick(row, HEADERS.invoiceMonth) || '');
    const isFixedStr = String(pick(row, HEADERS.isFixed) || '').toLowerCase();
    const isFixed = isFixedStr === 'sim' || isFixedStr === 'yes' || isFixedStr === 'sí';

    // Normalização de data para evitar diferenças de fuso horário
    const normalizeToUTCDate = (d: Date) => new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), 12, 0, 0));

    // Verificação de duplicata
    let isDuplicate = false;
    let existingTransactionId: string | undefined;
    if (isValid && parsedDate && accountId) {
      // Valor já está em centavos, não precisa multiplicar novamente
      const valorInCents = Math.abs(valor);
      const parsedNorm = normalizeToUTCDate(parsedDate);
      
      const existingTx = transactions.find(tx => {
        const txDate = createDateFromString(tx.date);
        const isSameDate = 
          txDate.getUTCFullYear() === parsedNorm.getUTCFullYear() &&
          txDate.getUTCMonth() === parsedNorm.getUTCMonth() &&
          txDate.getUTCDate() === parsedNorm.getUTCDate();
        // Ambos valores já estão em centavos
        const isSameAmount = Math.abs(tx.amount) === valorInCents;
        const isSameDescription = (tx.description || '').trim().toLowerCase() === String(descricao).trim().toLowerCase();
        const isSameAccount = tx.account_id === accountId;
        return isSameAccount && isSameDate && isSameAmount && isSameDescription;
      });

      if (!existingTx) {
        // Logs de diagnóstico para entender por que não casou
        const sameAccDesc = transactions.filter(tx => {
          const isSameDescription = (tx.description || '').trim().toLowerCase() === String(descricao).trim().toLowerCase();
          const isSameAccount = tx.account_id === accountId;
          return isSameAccount && isSameDescription;
        }).map(tx => ({ id: tx.id, amount: tx.amount, date: (createDateFromString(tx.date)).toISOString().slice(0,10) }));
        logger.debug('[ImportTx] Sem duplicata. Contexto:', {
          descricao,
          valorInCents,
          data: parsedNorm.toISOString().slice(0,10),
          accountId,
          candidatos: sameAccDesc
        });
      }

      if (existingTx) {
        isDuplicate = true;
        existingTransactionId = existingTx.id;
      }
    }

    return {
      data,
      descricao,
      categoria,
      tipo,
      conta,
      valor: valor,
      status: statusStr,
      parcelas: String(pick(row, HEADERS.installments) || ''),
      invoiceMonth,
      isFixed,
      isValid,
      errors,
      accountId: accountId,
      parsedDate: parsedDate || undefined,
      parsedType: parsedType || undefined,
      parsedStatus: parsedStatus || undefined,
      isDuplicate,
      existingTransactionId,
      resolution: isDuplicate ? 'skip' : 'add',
    };
  };

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0];
    if (!selectedFile) return;

    if (!selectedFile.name.match(/\.(xlsx|xls)$/)) {
      toast({
        title: 'Erro',
        description: 'Arquivo inválido. Selecione um arquivo Excel (.xlsx ou .xls)',
        variant: "destructive"
      });
      return;
    }

    setFile(selectedFile);
    setIsProcessing(true);

    try{
      const XLSX = await loadXLSX();
      
      const fileBuffer = await selectedFile.arrayBuffer();
      const workbook = XLSX.read(fileBuffer, { type: 'array' });
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      const rawData = XLSX.utils.sheet_to_json(sheet);

      if (rawData.length === 0) {
        toast({
          title: 'Erro',
          description: 'O arquivo está vazio. Adicione dados antes de importar',
          variant: "destructive"
        });
        setIsProcessing(false);
        return;
      }

      // Validar cada transação
      const validatedData = rawData.map((row: unknown) => {
        return validateAndCheckDuplicate(row as Record<string, unknown>);
      });

      setImportedData(validatedData);

      const summary = validatedData.reduce((acc: { new: number; duplicates: number; invalid: number }, t: ImportedTransaction) => {
        if (!t.isValid) acc.invalid++;
        else if (t.isDuplicate) acc.duplicates++;
        else acc.new++;
        return acc;
      }, { new: 0, duplicates: 0, invalid: 0 });

      toast({
        title: 'Arquivo processado',
        description: `Encontradas: ${summary.new} novas, ${summary.duplicates} duplicadas, ${summary.invalid} com erros`,
      });

    } catch (error) {
      toast({
        title: 'Erro',
        description: 'Erro ao ler o arquivo. Verifique o formato e tente novamente',
        variant: "destructive"
      });
    }

    setIsProcessing(false);
  };

  const handleImport = () => {
    // Itens para adicionar: novos OU duplicatas com resolution='add' OU duplicatas com resolution='replace'
    const transactionsToAdd = importedData
      .filter((t, index) => 
        !excludedIndexes.has(index) && 
        t.isValid && 
        (t.resolution === 'add' || t.resolution === 'replace')
      )
      .map(t => {
        // Valores já estão em centavos e sempre positivos na validação
        const amount = Math.round(Math.abs(t.valor));
        
        return {
          description: t.descricao.trim(),        
          // Edge function + função SQL definem o sinal com base no tipo
          // Portanto, SEMPRE enviamos amount positivo para passar na validação Zod
          amount,
          category: t.categoria.trim(),
          type: t.parsedType as 'income' | 'expense' | 'transfer',
          account_id: t.accountId as string,
          date: t.parsedDate?.toISOString().split('T')[0] as string,
          status: t.parsedStatus as 'completed' | 'pending',
          installments: t.parcelas && t.parcelas.trim() && t.parcelas.includes('/') ? 
            parseInt(t.parcelas.split('/')[1], 10) || undefined : undefined,
          current_installment: t.parcelas && t.parcelas.trim() && t.parcelas.includes('/') ? 
            parseInt(t.parcelas.split('/')[0], 10) || undefined : undefined,
          invoice_month: t.invoiceMonth && t.invoiceMonth.trim() ? t.invoiceMonth.trim() : undefined,
          is_fixed: t.isFixed || undefined
        };
      });

    const transactionsToReplaceIds = importedData
      .filter((t, index) => {
        const shouldInclude = !excludedIndexes.has(index) && 
          t.isValid && 
          t.isDuplicate && 
          t.resolution === 'replace' && 
          t.existingTransactionId;
        
        if (shouldInclude) {
          logger.debug('[ImportTransactions] Item marcado para substituição:', {
            index,
            descricao: t.descricao,
            existingTransactionId: t.existingTransactionId,
            resolution: t.resolution,
            isDuplicate: t.isDuplicate
          });
        }
        
        return shouldInclude;
      })
      .map(t => t.existingTransactionId!);

    logger.debug('[ImportTransactions] Processando importação:', {
      total: importedData.length,
      transactionsToAdd: transactionsToAdd.length,
      transactionsToReplaceIds: transactionsToReplaceIds.length,
      transactionsToReplaceDetails: transactionsToReplaceIds,
      excluded: excludedIndexes.size
    });

    if (transactionsToAdd.length === 0 && transactionsToReplaceIds.length === 0) {
      toast({
        title: 'Erro',
        description: 'Nenhum item válido para importar',
        variant: "destructive",
      });
      return;
    }

    onImportTransactions(transactionsToAdd, transactionsToReplaceIds);
    
    toast({
      title: 'Sucesso',
      description: `${transactionsToAdd.length} transação(ões) importada(s) com sucesso`,
    });

    // Reset
    setFile(null);
    setImportedData([]);
    setExcludedIndexes(new Set());
    onOpenChange(false);
  };

  const handleCancel = () => {
    setFile(null);
    setImportedData([]);
    setExcludedIndexes(new Set());
    onOpenChange(false);
  };

  const handleToggleExclude = (index: number) => {
    setExcludedIndexes(prev => {
      const newSet = new Set(prev);
      if (newSet.has(index)) {
        newSet.delete(index);
      } else {
        newSet.add(index);
      }
      return newSet;
    });
  };

  const handleResolutionChange = (rowIndex: number, resolution: 'skip' | 'add' | 'replace') => {
    setImportedData(prev => prev.map((row, idx) => 
      idx === rowIndex ? { ...row, resolution } : row
    ));
  };

  const downloadTemplate = async () => {
    const XLSX = await loadXLSX();
    
    const templateData = [
      {
        'Data': '15/03/2024',
        'Descrição': 'Salário',
        'Categoria': 'Salário',
        'Tipo': 'Receita',
        'Conta': accounts[0]?.name || 'Conta Corrente',
        'Valor': 5000.00,
        'Status': 'Concluída',
        'Parcelas': '',
        'Mês Fatura': '',
        'Fixa': 'Não'
      },
      {
        'Data': '16/03/2024',
        'Descrição': 'Supermercado',
        'Categoria': 'Alimentação',
        'Tipo': 'Despesa',
        'Conta': accounts[0]?.name || 'Conta Corrente',
        'Valor': 150.50,
        'Status': 'Concluída',
        'Parcelas': '',
        'Mês Fatura': '',
        'Fixa': 'Não'
      },
      {
        'Data': '17/03/2024',
        'Descrição': 'Notebook',
        'Categoria': 'Eletrônicos',
        'Tipo': 'Despesa',
        'Conta': accounts.find(acc => acc.type === 'credit')?.name || 'Cartão de Crédito',
        'Valor': 400.00,
        'Status': 'Pendente',
        'Parcelas': '1/3',
        'Mês Fatura': '2024-03',
        'Fixa': 'Não'
      },
      {
        'Data': '17/03/2024',
        'Descrição': 'Notebook',
        'Categoria': 'Eletrônicos',
        'Tipo': 'Despesa',
        'Conta': accounts.find(acc => acc.type === 'credit')?.name || 'Cartão de Crédito',
        'Valor': 400.00,
        'Status': 'Pendente',
        'Parcelas': '2/3',
        'Mês Fatura': '2024-04',
        'Fixa': 'Não'
      },
      {
        'Data': '17/03/2024',
        'Descrição': 'Notebook',
        'Categoria': 'Eletrônicos',
        'Tipo': 'Despesa',
        'Conta': accounts.find(acc => acc.type === 'credit')?.name || 'Cartão de Crédito',
        'Valor': 400.00,
        'Status': 'Pendente',
        'Parcelas': '3/3',
        'Mês Fatura': '2024-05',
        'Fixa': 'Não'
      }
    ];

    const ws = XLSX.utils.json_to_sheet(templateData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Modelo");

    // Configurar largura das colunas
    const colWidths = [
      { wch: 12 }, // Data
      { wch: 30 }, // Descrição
      { wch: 20 }, // Categoria
      { wch: 15 }, // Tipo
      { wch: 25 }, // Conta
      { wch: 15 }, // Valor
      { wch: 12 }, // Status
      { wch: 12 }  // Parcelas
    ];
    ws['!cols'] = colWidths;

    XLSX.writeFile(wb, 'modelo-importacao-transacoes.xlsx');

    toast({
      title: 'Sucesso',
      description: 'Modelo de exemplo baixado com sucesso',
    });
  };

  const summary = useMemo(() => {
    return importedData.reduce((acc, t, index) => {
      if (excludedIndexes.has(index)) {
        acc.excluded++;
      } else if (!t.isValid) {
        acc.invalid++;
      } else if (t.isDuplicate) {
        acc.duplicates++;
      } else {
        acc.new++;
      }
      return acc;
    }, { new: 0, duplicates: 0, invalid: 0, excluded: 0 });
  }, [importedData, excludedIndexes]);

  const transactionsToImportCount = useMemo(() => {
    return importedData.filter((t, index) => 
      !excludedIndexes.has(index) && 
      t.isValid && 
      (t.resolution === 'add' || t.resolution === 'replace')
    ).length;
  }, [importedData, excludedIndexes]);


  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col" onInteractOutside={(e) => e.preventDefault()} onEscapeKeyDown={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" />
            Importar Transações
          </DialogTitle>
          <DialogDescription>
            Importe transações em lote a partir de um arquivo Excel
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-auto space-y-6">
          {/* File Upload */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Selecionar Arquivo</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex items-center gap-4">
                  <Input
                    type="file"
                    accept=".xlsx,.xls"
                    onChange={handleFileSelect}
                    disabled={isProcessing}
                    className="flex-1"
                  />
                  {file && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <FileSpreadsheet className="h-4 w-4" />
                      {file.name}
                    </div>
                  )}
                </div>

                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    <div className="space-y-2">
                      <p><strong>Formato esperado:</strong> O arquivo deve ter as colunas:</p>
                      <ul className="list-disc list-inside text-sm space-y-1">
                        <li><strong>Data:</strong> dd/MM/yyyy (ex: 15/03/2024)</li>
                        <li><strong>Descrição:</strong> Descrição da transação</li>
                        <li><strong>Categoria:</strong> Categoria da transação</li>
                        <li><strong>Tipo:</strong> Receita, Despesa ou Transferência</li>
                        <li><strong>Conta:</strong> Nome da conta (deve existir no sistema)</li>
                        <li><strong>Valor:</strong> Valor numérico positivo</li>
                        <li><strong>Status:</strong> Concluída ou Pendente (opcional)</li>
                        <li><strong>Parcelas:</strong> Formato 1/3 (opcional)</li>
                      </ul>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => downloadTemplate()}
                        className="mt-2"
                      >
                        Baixar Modelo de Exemplo
                      </Button>
                    </div>
                  </AlertDescription>
                </Alert>
              </div>
            </CardContent>
          </Card>

          {/* Summary Stats */}
          {importedData.length > 0 && (
            <ImportSummaryCards summary={summary} />
          )}

          {/* Banner de Ação para Duplicadas */}
          {importedData.length > 0 && summary.duplicates > 0 && (
            <Alert className="border-amber-500 bg-amber-50 dark:bg-amber-950/30" ref={previewSectionRef}>
              <AlertCircle className="h-5 w-5 text-amber-600" />
              <AlertDescription className="text-amber-900 dark:text-amber-200">
                <div className="space-y-2">
                  <p className="font-semibold text-base">
                    Duplicatas Encontradas: {summary.duplicates} transações
                  </p>
                  <p className="text-sm">
                    Para cada item duplicado, escolha uma ação clicando no menu ao lado: <strong>Pular</strong> (ignorar), <strong>Adicionar</strong> (criar novo) ou <strong>Substituir</strong> (sobrescrever existente).
                  </p>
                </div>
              </AlertDescription>
            </Alert>
          )}

          {/* Preview List */}
          {importedData.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Prévia das Transações ({importedData.length} total)</CardTitle>
              </CardHeader>
              <CardContent className="p-4">
                <div className="max-h-96 overflow-y-auto space-y-3">
                  {importedData.map((transaction, index) => {
                    const isExcluded = excludedIndexes.has(index);
                    
                    return (
                      <div 
                        key={index} 
                        className={`border rounded-lg p-3 space-y-2 ${
                          isExcluded ? "opacity-50 bg-muted/50" : "bg-card"
                        }`}
                      >
                        {/* Header: Status + Description + Actions */}
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2 flex-1 min-w-0">
                            {isExcluded ? (
                              <Badge variant="outline" className="bg-muted text-xs shrink-0">Excluída</Badge>
                            ) : !transaction.isValid ? (
                              <Badge variant="destructive" className="text-xs shrink-0">Erro</Badge>
                            ) : transaction.isDuplicate ? (
                              <Badge variant="secondary" className="bg-warning/10 text-warning text-xs shrink-0">Duplicata</Badge>
                            ) : (
                              <Badge variant="default" className="bg-success/10 text-success text-xs shrink-0">Nova</Badge>
                            )}
                            <span className="font-medium text-sm truncate" title={transaction.descricao}>
                              {transaction.descricao}
                            </span>
                          </div>
                          
                          <div className="flex items-center gap-1 shrink-0">
                            <Button
                              variant={isExcluded ? "outline" : "ghost"}
                              size="sm"
                              onClick={() => handleToggleExclude(index)}
                              className="h-7 px-2"
                              title={isExcluded ? "Incluir" : "Excluir"}
                            >
                              {isExcluded ? <PlusCircle className="h-3.5 w-3.5" /> : "×"}
                            </Button>
                            
                            {!isExcluded && transaction.isDuplicate && transaction.isValid && (
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button variant="outline" size="sm" className="h-7 px-2">
                                    <MoreVertical className="h-3.5 w-3.5" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="z-50 bg-popover">
                                  <DropdownMenuItem onClick={() => handleResolutionChange(index, 'skip')}>
                                    Pular (ignorar)
                                  </DropdownMenuItem>
                                  <DropdownMenuItem onClick={() => handleResolutionChange(index, 'add')}>
                                    Adicionar como nova
                                  </DropdownMenuItem>
                                  <DropdownMenuItem 
                                    onClick={() => handleResolutionChange(index, 'replace')} 
                                    className="text-destructive"
                                  >
                                    Substituir existente
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            )}
                          </div>
                        </div>

                        {/* Details Grid */}
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                          <div>
                            <span className="text-muted-foreground">Data:</span>
                            <span className="ml-1 font-medium">{transaction.data}</span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Valor:</span>
                            <span className="ml-1 font-medium">R$ {transaction.valor.toFixed(2)}</span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Tipo:</span>
                            <span className="ml-1 font-medium capitalize">{transaction.tipo}</span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Conta:</span>
                            <span className="ml-1 font-medium truncate" title={transaction.conta}>{transaction.conta}</span>
                          </div>
                        </div>

                        {/* Additional Info */}
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs pt-1 border-t">
                          {transaction.categoria && (
                            <div>
                              <span className="text-muted-foreground">Categoria:</span>
                              <span className="ml-1 truncate" title={transaction.categoria}>{transaction.categoria}</span>
                            </div>
                          )}
                          {transaction.status && (
                            <div>
                              <span className="text-muted-foreground">Status:</span>
                              <span className="ml-1 capitalize">{transaction.status}</span>
                            </div>
                          )}
                          {transaction.parcelas && (
                            <div>
                              <span className="text-muted-foreground">Parcela:</span>
                              <span className="ml-1">{transaction.parcelas}</span>
                            </div>
                          )}
                        </div>

                        {/* Resolution Badge for Duplicates */}
                        {!isExcluded && transaction.isDuplicate && (
                          <div className="pt-1 border-t">
                            <span className="text-xs text-muted-foreground">Ação: </span>
                            {transaction.resolution === 'skip' && (
                              <Badge variant="outline" className="text-xs">Pular</Badge>
                            )}
                            {transaction.resolution === 'add' && (
                              <Badge variant="default" className="bg-primary/10 text-primary text-xs">Adicionar nova</Badge>
                            )}
                            {transaction.resolution === 'replace' && (
                              <Badge variant="destructive" className="text-xs">Substituir</Badge>
                            )}
                          </div>
                        )}

                        {/* Errors */}
                        {!isExcluded && !transaction.isValid && transaction.errors.length > 0 && (
                          <Alert variant="destructive" className="py-2">
                            <AlertCircle className="h-3 w-3" />
                            <AlertDescription className="text-xs">
                              <div className="space-y-0.5">
                                {transaction.errors.map((error, i) => (
                                  <div key={i}>• {error}</div>
                                ))}
                              </div>
                            </AlertDescription>
                          </Alert>
                        )}
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-3 pt-4 border-t">
          <Button variant="outline" onClick={handleCancel}>
            Cancelar
          </Button>
          <Button 
            onClick={handleImport}
            disabled={transactionsToImportCount === 0 || isProcessing}
          >
            Importar {transactionsToImportCount} transação{transactionsToImportCount !== 1 ? 'ões' : ''}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}