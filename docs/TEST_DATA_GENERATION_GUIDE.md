# Guia de Geração de Dados de Teste e Validação de Performance

## Visão Geral

Sistema completo para gerar dados de teste e validar a performance dos índices criados no banco de dados.

---

## 🚀 Como Usar

### 1. Via Interface (Recomendado)

1. **Acessar**: Configurações do Sistema → Aba "Performance"
2. **Configurar**: Escolher quantidade de transações (1000-50000)
3. **Gerar**: Clicar em "Gerar Dados"
4. **Testar**: Clicar em "Executar Testes de Performance"
5. **Analisar**: Ver resultados em tempo real

### 2. Via Edge Function Direta

```typescript
const { data, error } = await supabase.functions.invoke('generate-test-data', {
  body: {
    transactionCount: 10000,
    startDate: '2024-01-01',
    endDate: '2025-11-21',
    clearExisting: false,
  },
});
```

### 3. Via SQL Editor (Manual)

```sql
-- Gerar 1000 transações de teste
INSERT INTO transactions (user_id, description, amount, date, type, category_id, account_id, status)
SELECT 
  auth.uid(),
  'TEST: Transaction #' || generate_series,
  (RANDOM() * 900 + 100)::numeric(10,2),
  CURRENT_DATE - (RANDOM() * 365)::int,
  CASE 
    WHEN RANDOM() < 0.6 THEN 'expense'::transaction_type
    WHEN RANDOM() < 0.9 THEN 'income'::transaction_type
    ELSE 'transfer'::transaction_type
  END,
  (SELECT id FROM categories WHERE user_id = auth.uid() LIMIT 1),
  (SELECT id FROM accounts WHERE user_id = auth.uid() LIMIT 1),
  CASE WHEN RANDOM() < 0.8 THEN 'completed'::transaction_status ELSE 'pending'::transaction_status END
FROM generate_series(1, 1000);

-- Atualizar estatísticas
ANALYZE transactions;
```

---

## 📊 Edge Function: generate-test-data

### Funcionalidades

✅ Gera transações de teste realistas com distribuição balanceada
✅ Suporta diferentes quantidades (100-50000 transações)
✅ Range de datas configurável
✅ Inserção em lotes (100 por vez) para melhor performance
✅ Logging detalhado de progresso
✅ Tratamento de erros por lote
✅ Estatísticas de performance (taxa de inserção)

### Parâmetros

```typescript
interface GenerateTestDataRequest {
  transactionCount?: number;    // Default: 1000
  startDate?: string;           // Default: 1 ano atrás
  endDate?: string;             // Default: hoje
  clearExisting?: boolean;      // Default: false
}
```

### Distribuição dos Dados Gerados

**Tipos de Transação**:
- 60% Despesas (expense)
- 30% Receitas (income)
- 10% Transferências (transfer)

**Valores**:
- 90% entre R$ 10 - R$ 500
- 10% entre R$ 500 - R$ 5000 (outliers)

**Status**:
- 80% Completas (completed)
- 20% Pendentes (pending)

**Datas**:
- Distribuição uniforme entre startDate e endDate

**Descrições**:
- 20 descrições realistas (Supermercado, Uber, Netflix, etc.)
- Prefixo "TEST:" para fácil identificação e limpeza

### Resposta de Sucesso

```json
{
  "success": true,
  "created": 1000,
  "errors": 0,
  "duration": "2.45s",
  "rate": "408 transactions/second",
  "totalTransactions": 1000,
  "message": "Successfully created 1000 test transactions in 2.45s. Please run ANALYZE transactions; in SQL Editor for optimal index performance."
}
```

### Performance Esperada

| Quantidade | Tempo Esperado | Taxa |
|------------|---------------|------|
| 1,000 | 2-3s | 400-500/s |
| 10,000 | 20-30s | 350-450/s |
| 50,000 | 100-120s | 400-500/s |

---

## 🧪 Componente: DatabasePerformanceTest

### Funcionalidades

1. **Geração de Dados**
   - Interface intuitiva para configurar quantidade
   - Feedback em tempo real de progresso
   - Validação de pré-requisitos (contas e categorias)

2. **Testes de Performance**
   - Query de Paginação (50 registros com ORDER BY)
   - Query de Contagem (COUNT com filtro)
   - Query de Filtro (WHERE type = 'expense')
   - Medição de tempo em milliseconds

3. **Limpeza de Dados**
   - Remove apenas transações de teste (prefixo "TEST:")
   - Confirmação antes de executar
   - Preserva dados reais do usuário

4. **Visualização de Resultados**
   - Badges coloridos baseados em performance
   - Interpretação automática (✅ Excelente, ⚠️ Aceitável, ❌ Lento)
   - Estatísticas detalhadas

### Interpretação dos Resultados

#### Performance Excelente ✅
- **Paginação**: < 50ms
- **Contagem**: < 50ms
- **Filtro**: < 50ms

**Significado**: Índices funcionando perfeitamente. Sistema pronto para produção.

#### Performance Aceitável ⚠️
- **Paginação**: 50-200ms
- **Contagem**: 50-200ms
- **Filtro**: 50-200ms

**Significado**: Performance adequada para a maioria dos casos. Considerar otimização se volume crescer muito.

#### Performance Lenta ❌
- **Qualquer query**: > 200ms

**Significado**: Possível problema com índices ou estatísticas desatualizadas. Verificar:
1. Execute `ANALYZE transactions;`
2. Verifique se índices estão sendo usados com EXPLAIN
3. Considere VACUUM se houver muitas atualizações/deleções

---

## 📈 Queries EXPLAIN ANALYZE para Análise Detalhada

### 1. Query de Paginação com Índice

```sql
EXPLAIN (ANALYZE, BUFFERS, COSTS, TIMING) 
SELECT 
  id, description, amount, date, type, status,
  category_id, account_id, created_at
FROM transactions
WHERE user_id = auth.uid()
ORDER BY date DESC, created_at DESC
LIMIT 50 OFFSET 0;
```

**O que procurar**:
```
✅ Index Scan using idx_transactions_pagination on transactions
   (cost=0.42..120.45 rows=50 width=129) 
   (actual time=0.025..0.140 rows=50 loops=1)
   Index Cond: (user_id = 'xxx'::uuid)
   Buffers: shared hit=55
```

**Métricas importantes**:
- **Method**: `Index Scan` (✅) vs `Seq Scan` (❌)
- **actual time**: Tempo real de execução
- **Buffers: shared hit**: Alto número = dados em cache (bom)
- **rows**: Deve ser 50 (conforme LIMIT)

---

### 2. Query de Contagem com Index-Only Scan

```sql
EXPLAIN (ANALYZE, BUFFERS, VERBOSE) 
SELECT COUNT(*)
FROM transactions
WHERE user_id = auth.uid();
```

**O que procurar**:
```
✅ Aggregate (actual time=0.088..0.089 rows=1 loops=1)
   ->  Index Only Scan using idx_transactions_user_count
       (cost=0.42..245.67 rows=10000 width=0)
       (actual time=0.013..0.056 rows=10000 loops=1)
       Index Cond: (user_id = 'xxx'::uuid)
       Heap Fetches: 0
       Buffers: shared hit=28
```

**Métricas importantes**:
- **Index Only Scan**: Melhor possível (não acessa tabela)
- **Heap Fetches: 0**: Confirma que não acessou tabela principal
- **actual time**: Deve ser < 1ms para 10k registros

---

### 3. Query Filtrada por Tipo

```sql
EXPLAIN (ANALYZE, BUFFERS) 
SELECT *
FROM transactions
WHERE user_id = auth.uid() 
  AND type = 'expense'
ORDER BY date DESC, created_at DESC
LIMIT 50;
```

**O que procurar**:
```
✅ Limit (actual time=0.042..0.165 rows=50 loops=1)
   ->  Index Scan using idx_transactions_user_type_date
       (cost=0.42..350.89 rows=6000 width=277)
       (actual time=0.041..0.158 rows=50 loops=1)
       Index Cond: ((user_id = 'xxx'::uuid) AND 
                    (type = 'expense'::transaction_type))
       Buffers: shared hit=58
```

**Métricas importantes**:
- **Index usado**: `idx_transactions_user_type_date` ✅
- **Index Cond**: Mostra filtros aplicados no índice
- **rows estimados vs reais**: Devem ser próximos

---

### 4. Comparação: Com vs Sem Índice

#### Desabilitar índices temporariamente:
```sql
SET enable_indexscan = off;
SET enable_bitmapscan = off;

EXPLAIN ANALYZE
SELECT * FROM transactions 
WHERE user_id = auth.uid() 
ORDER BY date DESC 
LIMIT 50;

-- Resultado esperado: Seq Scan + Sort (LENTO)
```

#### Habilitar índices novamente:
```sql
RESET enable_indexscan;
RESET enable_bitmapscan;

EXPLAIN ANALYZE
SELECT * FROM transactions 
WHERE user_id = auth.uid() 
ORDER BY date DESC 
LIMIT 50;

-- Resultado esperado: Index Scan (RÁPIDO)
```

**Compare execution time**: Diferença deve ser 10-100x

---

## 🔍 Monitoramento de Índices

### Query para Ver Uso dos Índices

```sql
SELECT 
  schemaname,
  relname as table_name,
  indexrelname as index_name,
  idx_scan as times_used,
  idx_tup_read as tuples_read,
  idx_tup_fetch as tuples_fetched,
  pg_size_pretty(pg_relation_size(indexrelid)) as index_size,
  CASE 
    WHEN idx_scan = 0 THEN '❌ Not Used'
    WHEN idx_scan < 100 THEN '⚠️ Low Usage'
    ELSE '✅ Active'
  END as status
FROM pg_stat_user_indexes
WHERE schemaname = 'public' 
  AND relname = 'transactions'
  AND indexrelname LIKE 'idx_transactions_%'
ORDER BY idx_scan DESC;
```

### Verificar Tamanho e Bloat

```sql
SELECT 
  schemaname,
  tablename,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as total_size,
  pg_size_pretty(pg_relation_size(schemaname||'.'||tablename)) as table_size,
  pg_size_pretty(
    pg_total_relation_size(schemaname||'.'||tablename) - 
    pg_relation_size(schemaname||'.'||tablename)
  ) as indexes_size,
  (SELECT COUNT(*) FROM pg_indexes WHERE tablename = 'transactions') as index_count
FROM pg_tables
WHERE schemaname = 'public' 
  AND tablename = 'transactions';
```

---

## 📊 Benchmark Esperado

### Com 1,000 Transações

| Query | Sem Índice | Com Índice | Melhoria |
|-------|-----------|-----------|----------|
| Paginação (50 itens) | ~50ms | ~5ms | **10x** |
| COUNT(*) | ~30ms | ~2ms | **15x** |
| Filtro por tipo | ~80ms | ~8ms | **10x** |

### Com 10,000 Transações

| Query | Sem Índice | Com Índice | Melhoria |
|-------|-----------|-----------|----------|
| Paginação (50 itens) | ~500ms | ~5-10ms | **50-100x** |
| COUNT(*) | ~300ms | ~2-3ms | **100-150x** |
| Filtro por tipo | ~800ms | ~10-15ms | **53-80x** |
| Filtro por conta | ~1000ms | ~12-18ms | **55-83x** |

### Com 100,000 Transações

| Query | Sem Índice | Com Índice | Melhoria |
|-------|-----------|-----------|----------|
| Paginação (50 itens) | ~5000ms | ~10-20ms | **250-500x** |
| COUNT(*) | ~3000ms | ~5ms | **600x** |
| Filtro por tipo | ~8000ms | ~15-30ms | **267-533x** |
| Busca parcelada | ~10000ms | ~20-40ms | **250-500x** |

---

## 🛠️ Troubleshooting

### Problema: Índices não sendo usados

**Diagnóstico**:
```sql
EXPLAIN SELECT * FROM transactions 
WHERE user_id = auth.uid() 
ORDER BY date DESC 
LIMIT 50;

-- Se aparecer "Seq Scan" em vez de "Index Scan"
```

**Soluções**:
1. **Atualizar estatísticas**:
   ```sql
   ANALYZE transactions;
   ```

2. **Verificar se índice existe**:
   ```sql
   SELECT indexname FROM pg_indexes 
   WHERE tablename = 'transactions' 
   AND indexname = 'idx_transactions_pagination';
   ```

3. **Forçar uso do índice** (apenas para teste):
   ```sql
   SET enable_seqscan = off;
   EXPLAIN SELECT ...;
   RESET enable_seqscan;
   ```

### Problema: Performance ainda lenta

**Checklist**:
- [ ] Executou `ANALYZE transactions;`?
- [ ] Índice está sendo usado (verificar com EXPLAIN)?
- [ ] Buffers mostram "shared hit" alto?
- [ ] Não há bloat excessivo?
- [ ] Work_mem suficiente para sorts?

**Solução definitiva**:
```sql
-- 1. VACUUM completo
VACUUM FULL ANALYZE transactions;

-- 2. REINDEX se necessário
REINDEX TABLE CONCURRENTLY transactions;

-- 3. Verificar configurações
SHOW work_mem;
SHOW shared_buffers;
```

---

## 📝 Documentação dos Resultados

Após executar os testes, documente os resultados:

```markdown
## Resultados do Teste - [DATA]

### Configuração
- Transações geradas: 10,000
- Range de datas: 2024-01-01 a 2025-11-21
- Ambiente: [Desenvolvimento/Produção]

### Performance Medida
- **Paginação**: 8.5ms (✅ Excelente)
- **Contagem**: 2.1ms (✅ Excelente)
- **Filtro tipo**: 12.3ms (✅ Excelente)

### Índices Ativos
- idx_transactions_pagination: ✅ Usado 245 vezes
- idx_transactions_user_count: ✅ Usado 189 vezes
- idx_transactions_user_type_date: ✅ Usado 67 vezes

### Conclusão
Índices funcionando perfeitamente. Sistema pronto para escalar.
```

---

## 🎯 Conclusão

Este sistema completo permite:
1. ✅ Gerar dados de teste realistas rapidamente
2. ✅ Medir performance em tempo real
3. ✅ Validar funcionamento dos índices
4. ✅ Identificar gargalos antes de produção
5. ✅ Documentar resultados de forma profissional

**Próximo passo**: Executar testes com diferentes volumes e documentar resultados!
