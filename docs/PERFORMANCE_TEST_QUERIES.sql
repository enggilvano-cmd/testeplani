-- ============================================
-- QUERIES DE ANÁLISE DE PERFORMANCE - SUPABASE
-- ============================================
-- Use estas queries no SQL Editor após gerar dados de teste
-- https://supabase.com/dashboard/project/sdberrkfwoozezletfuq/sql/new

-- ============================================
-- 1. EXPLAIN ANALYZE - Query Principal de Paginação
-- ============================================
EXPLAIN (ANALYZE, BUFFERS, COSTS, TIMING) 
SELECT 
  id, description, amount, date, type, status,
  category_id, account_id, to_account_id,
  installments, current_installment, parent_transaction_id,
  created_at, updated_at
FROM public.transactions
WHERE user_id = auth.uid()
ORDER BY date DESC, created_at DESC
LIMIT 50 OFFSET 0;

-- ✅ O que procurar:
-- - "Index Scan using idx_transactions_pagination"
-- - actual time < 50ms
-- - Buffers: shared hit (alto número = bom)

-- ============================================
-- 2. EXPLAIN ANALYZE - Query de Contagem
-- ============================================
EXPLAIN (ANALYZE, BUFFERS, VERBOSE) 
SELECT COUNT(*)
FROM public.transactions
WHERE user_id = auth.uid();

-- ✅ O que procurar:
-- - "Index Only Scan using idx_transactions_user_count"
-- - Heap Fetches: 0
-- - actual time < 5ms para 10k registros

-- ============================================
-- 3. EXPLAIN ANALYZE - Query com Filtro de Tipo
-- ============================================
EXPLAIN (ANALYZE, BUFFERS) 
SELECT *
FROM public.transactions
WHERE user_id = auth.uid() 
  AND type = 'expense'
ORDER BY date DESC, created_at DESC
LIMIT 50;

-- ✅ O que procurar:
-- - "Index Scan using idx_transactions_user_type_date"
-- - Index Cond mostra ambos os filtros
-- - actual time < 20ms

-- ============================================
-- 4. EXPLAIN ANALYZE - Query por Conta Específica
-- ============================================
EXPLAIN (ANALYZE, BUFFERS)
SELECT *
FROM public.transactions
WHERE user_id = auth.uid()
  AND account_id = (SELECT id FROM accounts WHERE user_id = auth.uid() LIMIT 1)
ORDER BY date DESC, created_at DESC
LIMIT 50;

-- ✅ O que procurar:
-- - "Index Scan using idx_transactions_user_account_date"
-- - actual time < 20ms

-- ============================================
-- 5. Comparação: SEM Índice vs COM Índice
-- ============================================

-- TESTE 1: Desabilitar índices
SET enable_indexscan = off;
SET enable_bitmapscan = off;

EXPLAIN (ANALYZE, BUFFERS)
SELECT * FROM public.transactions 
WHERE user_id = auth.uid() 
ORDER BY date DESC, created_at DESC 
LIMIT 50;

-- Anotar: execution time = _____ms

-- TESTE 2: Habilitar índices
RESET enable_indexscan;
RESET enable_bitmapscan;

EXPLAIN (ANALYZE, BUFFERS)
SELECT * FROM public.transactions 
WHERE user_id = auth.uid() 
ORDER BY date DESC, created_at DESC 
LIMIT 50;

-- Anotar: execution time = _____ms
-- Calcular: melhoria = tempo_sem / tempo_com

-- ============================================
-- 6. Estatísticas de Uso dos Índices
-- ============================================
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

-- ============================================
-- 7. Tamanho da Tabela e Índices
-- ============================================
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

-- ============================================
-- 8. Verificar Bloat dos Índices
-- ============================================
SELECT 
  schemaname,
  tablename,
  indexrelname,
  pg_size_pretty(pg_relation_size(indexrelid)) as current_size,
  idx_scan,
  idx_tup_read,
  idx_tup_fetch
FROM pg_stat_user_indexes
WHERE schemaname = 'public' 
  AND tablename = 'transactions'
  AND indexrelname LIKE 'idx_transactions_%'
ORDER BY pg_relation_size(indexrelid) DESC;

-- ============================================
-- 9. Cache Hit Ratio (Eficiência do Cache)
-- ============================================
SELECT 
  schemaname,
  relname,
  heap_blks_read as disk_reads,
  heap_blks_hit as cache_hits,
  CASE 
    WHEN heap_blks_read + heap_blks_hit = 0 THEN 0
    ELSE ROUND(100.0 * heap_blks_hit / (heap_blks_read + heap_blks_hit), 2)
  END as cache_hit_ratio_percent
FROM pg_statio_user_tables
WHERE schemaname = 'public'
  AND relname = 'transactions';

-- ✅ Meta: cache_hit_ratio > 99%
-- ⚠️ Se < 90%, considerar aumentar shared_buffers

-- ============================================
-- 10. Atualizar Estatísticas (ANALYZE)
-- ============================================
-- Execute SEMPRE após inserir muitos dados
ANALYZE public.transactions;

-- Ou ANALYZE completo no banco
ANALYZE;

-- ============================================
-- 11. VACUUM (Limpeza e Manutenção)
-- ============================================
-- Limpeza normal (recomendado mensalmente)
VACUUM ANALYZE public.transactions;

-- Limpeza completa (apenas se houver bloat)
-- CUIDADO: Bloqueia a tabela!
-- VACUUM FULL public.transactions;

-- ============================================
-- 12. REINDEX (Reconstruir Índices)
-- ============================================
-- Se índices estiverem com bloat ou corrompidos
-- CONCURRENTLY permite uso durante rebuild
REINDEX INDEX CONCURRENTLY idx_transactions_pagination;
REINDEX INDEX CONCURRENTLY idx_transactions_user_count;
REINDEX INDEX CONCURRENTLY idx_transactions_user_type_date;

-- Ou todos de uma vez (mais rápido, mas bloqueia)
-- REINDEX TABLE CONCURRENTLY transactions;

-- ============================================
-- 13. Queries Lentas (Monitoramento)
-- ============================================
-- Requer extensão pg_stat_statements
-- SELECT pg_stat_statements_reset(); -- Reset para começar novo
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

-- ============================================
-- 14. Distribuição dos Dados de Teste
-- ============================================
SELECT 
  type,
  status,
  COUNT(*) as count,
  ROUND(100.0 * COUNT(*) / SUM(COUNT(*)) OVER (), 2) as percentage,
  MIN(date) as oldest_date,
  MAX(date) as newest_date,
  AVG(amount)::numeric(10,2) as avg_amount,
  MIN(amount) as min_amount,
  MAX(amount) as max_amount
FROM public.transactions
WHERE user_id = auth.uid()
  AND description LIKE 'TEST:%'
GROUP BY type, status
ORDER BY type, status;

-- ============================================
-- 15. Contagem de Transações por Mês
-- ============================================
SELECT 
  DATE_TRUNC('month', date) as month,
  type,
  COUNT(*) as count,
  SUM(amount)::numeric(10,2) as total_amount
FROM public.transactions
WHERE user_id = auth.uid()
  AND description LIKE 'TEST:%'
GROUP BY DATE_TRUNC('month', date), type
ORDER BY month DESC, type;

-- ============================================
-- 16. Verificar Índices Duplicados ou Desnecessários
-- ============================================
SELECT 
  pg_size_pretty(SUM(pg_relation_size(idx))::BIGINT) as total_index_size,
  array_agg(indexrelname) as index_names
FROM (
  SELECT 
    indexrelid::REGCLASS as idx,
    indexrelname,
    indrelid,
    array_to_string(array_agg(attname), ',') as cols
  FROM pg_index
  JOIN pg_attribute ON attrelid = indrelid AND attnum = ANY(indkey)
  WHERE indrelid = 'public.transactions'::regclass
  GROUP BY indexrelid, indexrelname, indrelid
) sub
GROUP BY cols
HAVING COUNT(*) > 1;

-- Se retornar resultados, há índices duplicados

-- ============================================
-- 17. Configurações Relevantes do PostgreSQL
-- ============================================
SELECT 
  name,
  setting,
  unit,
  short_desc
FROM pg_settings
WHERE name IN (
  'shared_buffers',
  'work_mem',
  'maintenance_work_mem',
  'effective_cache_size',
  'random_page_cost',
  'seq_page_cost',
  'max_connections'
)
ORDER BY name;

-- ============================================
-- 18. Limpar Dados de Teste
-- ============================================
-- Remove apenas transações de teste
DELETE FROM public.transactions
WHERE user_id = auth.uid()
  AND description LIKE 'TEST:%';

-- Após deletar, sempre VACUUM
VACUUM ANALYZE public.transactions;

-- ============================================
-- 19. Template de Documentação de Resultados
-- ============================================
/*
## Teste de Performance - [DATA]

### Ambiente
- Transações: [QUANTIDADE]
- Range: [DATA_INICIO] a [DATA_FIM]

### Resultados EXPLAIN ANALYZE

#### Paginação (50 registros)
- Planning time: ___ms
- Execution time: ___ms
- Método: [Index Scan / Seq Scan]
- Buffers shared hit: ___

#### Contagem (COUNT)
- Execution time: ___ms
- Método: [Index Only Scan / Index Scan / Seq Scan]
- Heap Fetches: ___

#### Filtro por Tipo
- Execution time: ___ms
- Método: [Index Scan / Seq Scan]
- Registros retornados: ___

### Estatísticas de Índices
- idx_transactions_pagination: usado ___ vezes
- idx_transactions_user_count: usado ___ vezes
- idx_transactions_user_type_date: usado ___ vezes

### Tamanhos
- Tabela: ___
- Índices: ___
- Total: ___

### Conclusão
[Índices funcionando corretamente? Melhorias necessárias?]
*/

-- ============================================
-- 20. Benchmark Comparativo
-- ============================================
-- Execute este bloco completo para benchmark rápido

DO $$
DECLARE
  start_time TIMESTAMP;
  end_time TIMESTAMP;
  pagination_time INTERVAL;
  count_time INTERVAL;
  filter_time INTERVAL;
BEGIN
  -- Teste 1: Paginação
  start_time := clock_timestamp();
  PERFORM * FROM transactions 
  WHERE user_id = auth.uid() 
  ORDER BY date DESC, created_at DESC 
  LIMIT 50;
  end_time := clock_timestamp();
  pagination_time := end_time - start_time;
  
  -- Teste 2: Contagem
  start_time := clock_timestamp();
  PERFORM COUNT(*) FROM transactions WHERE user_id = auth.uid();
  end_time := clock_timestamp();
  count_time := end_time - start_time;
  
  -- Teste 3: Filtro
  start_time := clock_timestamp();
  PERFORM * FROM transactions 
  WHERE user_id = auth.uid() AND type = 'expense'
  ORDER BY date DESC 
  LIMIT 50;
  end_time := clock_timestamp();
  filter_time := end_time - start_time;
  
  RAISE NOTICE 'Paginação: %', pagination_time;
  RAISE NOTICE 'Contagem: %', count_time;
  RAISE NOTICE 'Filtro: %', filter_time;
END $$;
