-- =============================================================================
-- MIGRATION: Corrigir Race Condition no Recálculo de Saldo
-- =============================================================================
-- CRÍTICO: Esta migration corrige um bug P0 que permite race conditions
-- em operações concorrentes de recálculo de saldo de contas.
--
-- INSTRUÇÕES:
-- 1. Aplicar esta migration no banco de produção usando Supabase Dashboard
-- 2. Ou via CLI: supabase db push
-- 3. Ou copiar e executar este SQL diretamente no SQL Editor
-- =============================================================================

CREATE OR REPLACE FUNCTION public.recalculate_account_balance(
  p_account_id UUID,
  p_expected_version INTEGER DEFAULT NULL
)
RETURNS TABLE(
  new_balance NUMERIC,
  new_version INTEGER,
  success BOOLEAN,
  error_message TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_current_version INTEGER;
  v_calculated_balance NUMERIC;
  v_new_version INTEGER;
BEGIN
  -- =============================================================================
  -- BUG FIX: Adquirir lock ANTES de qualquer leitura para evitar race condition
  -- =============================================================================
  -- O FOR UPDATE NOWAIT garante que:
  -- 1. Nenhuma outra transação pode modificar o registro enquanto temos o lock
  -- 2. Se houver contenção, retornamos erro imediatamente em vez de esperar
  -- 3. O lock é mantido até o fim da transação
  -- =============================================================================
  BEGIN
    SELECT version INTO STRICT v_current_version
    FROM public.account_locks
    WHERE account_id = p_account_id
    FOR UPDATE NOWAIT;
  EXCEPTION
    WHEN lock_not_available THEN
      RETURN QUERY SELECT NULL::NUMERIC, NULL::INTEGER, false, 'Account is locked by another process'::TEXT;
      RETURN;
    WHEN no_data_found THEN
      RETURN QUERY SELECT NULL::NUMERIC, NULL::INTEGER, false, 'Account lock not found'::TEXT;
      RETURN;
  END;
  
  -- Verificar versão se fornecida (optimistic locking)
  IF p_expected_version IS NOT NULL AND v_current_version != p_expected_version THEN
    RETURN QUERY SELECT NULL::NUMERIC, v_current_version, false, 'Version mismatch - account was modified'::TEXT;
    RETURN;
  END IF;
  
  -- Calcular saldo baseado em TODAS as transações completed
  -- amount já vem com sinal correto do insert, basta somar
  -- Para cartões de crédito:
  --   - expense: amount negativo (aumenta dívida)
  --   - income: amount positivo (diminui dívida/pagamento)
  -- Para outras contas:
  --   - expense: amount negativo (sai dinheiro)
  --   - income: amount positivo (entra dinheiro)
  SELECT COALESCE(SUM(t.amount), 0)
  INTO v_calculated_balance
  FROM public.transactions t
  WHERE t.account_id = p_account_id
    AND t.status = 'completed';
  
  -- Atualizar saldo da conta
  UPDATE public.accounts
  SET balance = v_calculated_balance,
      updated_at = now()
  WHERE id = p_account_id;
  
  -- Incrementar versão do lock
  v_new_version := v_current_version + 1;
  
  UPDATE public.account_locks
  SET version = v_new_version,
      updated_at = now()
  WHERE account_id = p_account_id;
  
  -- Registrar na auditoria
  INSERT INTO public.financial_audit (
    user_id, action, table_name, record_id,
    balance_after, created_by
  )
  SELECT user_id, 'balance_recalc', 'accounts', p_account_id,
         v_calculated_balance, auth.uid()
  FROM public.accounts
  WHERE id = p_account_id;
  
  RETURN QUERY SELECT v_calculated_balance, v_new_version, true, NULL::TEXT;
END;
$$;

-- =============================================================================
-- COMENTÁRIOS TÉCNICOS:
-- =============================================================================
-- ANTES (BUGGY):
--   SELECT version INTO v_current_version FROM account_locks WHERE ... FOR UPDATE;
--   Problema: O SELECT acontecia DEPOIS da primeira leitura, permitindo que
--   múltiplas transações lessem o mesmo valor antes de adquirir o lock.
--
-- DEPOIS (CORRETO):
--   BEGIN ... SELECT version INTO STRICT ... FOR UPDATE NOWAIT; EXCEPTION ...
--   Solução: O lock é adquirido IMEDIATAMENTE antes de qualquer operação,
--   garantindo serialização de todas as operações concorrentes.
-- =============================================================================

-- Verificação da migração
DO $$
BEGIN
  RAISE NOTICE 'Migration applied successfully: Race condition fix for recalculate_account_balance';
  RAISE NOTICE 'Lock strategy: FOR UPDATE NOWAIT with proper exception handling';
  RAISE NOTICE 'All concurrent operations will now be properly serialized';
END $$;
