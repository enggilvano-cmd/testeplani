# Database Performance Analysis - Índices e Query Plans

## Índices Criados

### 1. idx_transactions_pagination (Principal)
```sql
CREATE INDEX idx_transactions_pagination 
ON public.transactions (user_id, date DESC, created_at DESC);
```
**Propósito**: Otimizar a query principal de paginação do hook `useTransactions`

**Query otimizada**:
```sql
SELECT * FROM transactions 
WHERE user_id = 'xxx' 
ORDER BY date DESC, created_at DESC 
LIMIT 50 OFFSET 0;
```

### 2. idx_transactions_user_count (Contagem Rápida)
```sql
CREATE INDEX idx_transactions_user_count 
ON public.transactions (user_id) INCLUDE (id);
```
**Propósito**: Otimizar contagem com `COUNT(*)` usando index-only scan

**Query otimizada**:
```sql
SELECT COUNT(*) FROM transactions WHERE user_id = 'xxx';
```

### 3. idx_transactions_user_type_date (Filtro por Tipo)
```sql
CREATE INDEX idx_transactions_user_type_date 
ON public.transactions (user_id, type, date DESC, created_at DESC);
```
**Propósito**: Otimizar filtros por tipo de transação

**Query otimizada**:
```sql
SELECT * FROM transactions 
WHERE user_id = 'xxx' AND type = 'expense' 
ORDER BY date DESC, created_at DESC;
```

### 4. idx_transactions_user_status_date (Filtro por Status)
```sql
CREATE INDEX idx_transactions_user_status_date 
ON public.transactions (user_id, status, date DESC, created_at DESC);
```
**Propósito**: Otimizar filtros por status (pending/completed)

### 5. idx_transactions_user_account_date (Filtro por Conta)
```sql
CREATE INDEX idx_transactions_user_account_date 
ON public.transactions (user_id, account_id, date DESC, created_at DESC);
```
**Propósito**: Otimizar queries de extrato por conta específica

### 6. idx_transactions_parent (Transações Parceladas)
```sql
CREATE INDEX idx_transactions_parent 
ON public.transactions (parent_transaction_id) 
WHERE parent_transaction_id IS NOT NULL;
```
**Propósito**: Buscar todas as parcelas de uma transação parcelada (partial index)

### 7. idx_transactions_recurring (Transações Recorrentes)
```sql
CREATE INDEX idx_transactions_recurring 
ON public.transactions (user_id, is_recurring) 
WHERE is_recurring = true;
```
**Propósito**: Otimizar listagem de transações recorrentes (partial index)

---

## Queries de Análise de Performance

### 1. Verificar Plano de Execução - Query Principal de Paginação

Execute no SQL Editor do Supabase:

```sql
EXPLAIN (ANALYZE, BUFFERS, VERBOSE, COSTS, TIMING) 
SELECT 
  id, description, amount, date, type, status,
  category_id, account_id, to_account_id,
  installments, current_installment, parent_transaction_id,
  linked_transaction_id, is_recurring, is_fixed,
  recurrence_type, recurrence_end_date, invoice_month,
  invoice_month_overridden, reconciled, created_at, updated_at
FROM public.transactions
WHERE user_id = auth.uid()
ORDER BY date DESC, created_at DESC
LIMIT 50 OFFSET 0;
```

**O que procurar no resultado**:
- ✅ `Index Scan using idx_transactions_pagination`
- ✅ `cost=...` baixo (idealmente < 100)
- ✅ `actual time=...` rápido (< 50ms)
- ❌ `Seq Scan` (se aparecer, índice não está sendo usado)

---

### 2. Verificar Plano de Execução - Contagem Total

```sql
EXPLAIN (ANALYZE, BUFFERS, VERBOSE) 
SELECT COUNT(*)
FROM public.transactions
WHERE user_id = auth.uid();
```

**O que procurar**:
- ✅ `Index Only Scan using idx_transactions_user_count`
- ✅ `Heap Fetches: 0` (significa que não acessou a tabela)

---

### 3. Verificar Plano de Execução - Query com Filtro de Tipo

```sql
EXPLAIN (ANALYZE, BUFFERS) 
SELECT *
FROM public.transactions
WHERE user_id = auth.uid() 
  AND type = 'expense'
ORDER BY date DESC, created_at DESC
LIMIT 50;
```

**O que procurar**:
- ✅ `Index Scan using idx_transactions_user_type_date`

---

### 4. Verificar Uso dos Índices (Estatísticas)

```sql
SELECT 
  schemaname,
  tablename,
  indexname,
  idx_scan as "Vezes Usado",
  idx_tup_read as "Tuplas Lidas",
  idx_tup_fetch as "Tuplas Retornadas",
  pg_size_pretty(pg_relation_size(indexrelid)) as "Tamanho"
FROM pg_stat_user_indexes
WHERE tablename = 'transactions'
ORDER BY idx_scan DESC;
```

**Interpretação**:
- **idx_scan > 0**: Índice está sendo usado
- **idx_scan = 0**: Índice não está sendo usado (pode ser removido ou query precisa ajuste)
- **Tamanho**: Verifica overhead de armazenamento

---

### 5. Verificar Bloat dos Índices

```sql
SELECT 
  schemaname,
  tablename,
  indexname,
  pg_size_pretty(pg_relation_size(indexrelid)) as tamanho_atual,
  idx_scan,
  idx_tup_read
FROM pg_stat_user_indexes
WHERE schemaname = 'public' 
  AND tablename = 'transactions'
  AND indexname LIKE 'idx_transactions_%'
ORDER BY pg_relation_size(indexrelid) DESC;
```

---

### 6. Análise Completa de Performance da Tabela

```sql
SELECT
  n.nspname as schema,
  c.relname as tabela,
  pg_size_pretty(pg_total_relation_size(c.oid)) as tamanho_total,
  pg_size_pretty(pg_relation_size(c.oid)) as tamanho_dados,
  pg_size_pretty(pg_total_relation_size(c.oid) - pg_relation_size(c.oid)) as tamanho_indices,
  c.reltuples::bigint as linhas_estimadas,
  (SELECT COUNT(*) FROM pg_index WHERE indrelid = c.oid) as num_indices
FROM pg_class c
LEFT JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE c.relname = 'transactions'
  AND n.nspname = 'public';
```

---

### 7. Comparar Performance: Antes vs Depois

#### Query SEM índice (simulação):
```sql
SET enable_indexscan = off;
SET enable_bitmapscan = off;

EXPLAIN (ANALYZE, BUFFERS) 
SELECT * FROM transactions 
WHERE user_id = auth.uid() 
ORDER BY date DESC, created_at DESC 
LIMIT 50;

RESET enable_indexscan;
RESET enable_bitmapscan;
```

#### Query COM índice:
```sql
EXPLAIN (ANALYZE, BUFFERS) 
SELECT * FROM transactions 
WHERE user_id = auth.uid() 
ORDER BY date DESC, created_at DESC 
LIMIT 50;
```

**Compare**:
- **Planning Time**: Tempo de planejamento
- **Execution Time**: Tempo de execução
- **Buffers**: Blocos lidos

---

## Métricas de Performance Esperadas

### Baseline (1000 transações)

| Operação | Sem Índice | Com Índice | Melhoria |
|----------|-----------|-----------|----------|
| SELECT paginado (50 itens) | ~50ms | ~5ms | 10x |
| COUNT(*) | ~30ms | ~2ms | 15x |
| SELECT filtrado por tipo | ~80ms | ~8ms | 10x |
| SELECT por conta específica | ~100ms | ~10ms | 10x |

### High Volume (10,000 transações)

| Operação | Sem Índice | Com Índice | Melhoria |
|----------|-----------|-----------|----------|
| SELECT paginado (50 itens) | ~500ms | ~5-10ms | 50-100x |
| COUNT(*) | ~300ms | ~2-3ms | 100-150x |
| SELECT filtrado por tipo | ~800ms | ~10-15ms | 53-80x |

---

## Monitoramento Contínuo

### Query para Monitorar Queries Lentas

```sql
SELECT 
  query,
  calls,
  total_exec_time,
  mean_exec_time,
  max_exec_time,
  stddev_exec_time
FROM pg_stat_statements
WHERE query LIKE '%transactions%'
  AND query NOT LIKE '%pg_stat%'
ORDER BY mean_exec_time DESC
LIMIT 10;
```

**Nota**: Requer extensão `pg_stat_statements` habilitada.

---

## Manutenção dos Índices

### 1. VACUUM e ANALYZE Regular

```sql
-- Após grandes volumes de INSERT/UPDATE/DELETE
VACUUM ANALYZE public.transactions;
```

### 2. REINDEX (se necessário)

```sql
-- Apenas se houver bloat significativo
REINDEX INDEX CONCURRENTLY idx_transactions_pagination;
```

**Nota**: `CONCURRENTLY` permite que a tabela continue sendo usada durante o reindex.

---

## Troubleshooting

### Problema: Índice não está sendo usado

**Diagnóstico**:
```sql
EXPLAIN SELECT * FROM transactions 
WHERE user_id = 'xxx' 
ORDER BY date DESC 
LIMIT 50;
```

**Possíveis causas**:
1. **Estatísticas desatualizadas**: Execute `ANALYZE transactions;`
2. **Poucos dados**: Postgres pode preferir seq scan para tabelas pequenas
3. **Query não corresponde ao índice**: Verifique ORDER BY e WHERE exatos
4. **Configuração do Postgres**: Ajustar `work_mem` ou `random_page_cost`

### Problema: Query ainda lenta mesmo com índice

**Checklist**:
- [ ] Verificar se índice está sendo usado com EXPLAIN
- [ ] Verificar `Buffers: shared hit=` no EXPLAIN (should be high)
- [ ] Verificar bloat com query de bloat acima
- [ ] Considerar VACUUM ANALYZE
- [ ] Verificar se query pode usar index-only scan

---

## Best Practices

1. **Sempre usar EXPLAIN ANALYZE** antes de criar novos índices
2. **Monitorar uso dos índices** com `pg_stat_user_indexes` regularmente
3. **VACUUM ANALYZE** após grandes operações de dados
4. **Considerar index-only scans** com INCLUDE quando possível
5. **Partial indexes** para queries com WHERE constantes
6. **Não criar índices demais**: Cada índice tem overhead em INSERT/UPDATE
7. **Revisar índices não usados** trimestralmente

---

## Links Úteis

- [Supabase Performance Tuning](https://supabase.com/docs/guides/database/postgres/performance-tuning)
- [PostgreSQL Index Types](https://www.postgresql.org/docs/current/indexes-types.html)
- [EXPLAIN Documentation](https://www.postgresql.org/docs/current/sql-explain.html)
- [Supabase SQL Editor](https://supabase.com/dashboard/project/sdberrkfwoozezletfuq/sql/new)
