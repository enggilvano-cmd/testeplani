# Guia de Testes do PlaniFlow

## Como Testar as Funcionalidades Contábeis

### 1. Teste de Partidas Dobradas

```sql
-- Criar uma transação
INSERT INTO transactions (...) VALUES (...);

-- Validar partidas dobradas
SELECT * FROM validate_double_entry_detailed('transaction-id');

-- Espera:
-- is_valid = true
-- total_debits = total_credits
-- difference = 0
```

### 2. Teste de Integridade Contábil

```sql
-- Executar auditoria completa
SELECT * FROM audit_accounting_integrity('user-id');

-- Verificar se todos os checks retornam 'OK'
```

### 3. Teste de Período Fechado

```javascript
// 1. Fechar período
await supabase.from('period_closures').insert({
  period_start: '2025-01-01',
  period_end: '2025-01-31',
  closure_type: 'monthly',
  is_locked: true
});

// 2. Tentar criar transação no período
const { error } = await supabase.functions.invoke('atomic-transaction', {
  body: {
    transaction: {
      date: '2025-01-15', // Dentro do período fechado
      // ...
    }
  }
});

// 3. Verificar erro
expect(error.message).toContain('Period is locked');
```

### 4. Teste de Limite de Crédito

```javascript
// Criar transação que excede limite
const { error } = await supabase.functions.invoke('atomic-transaction', {
  body: {
    transaction: {
      type: 'expense',
      amount: 999999, // Muito alto
      account_id: 'credit-card-with-limit-1000',
      // ...
    }
  }
});

// Verificar erro
expect(error.message).toContain('exceeds credit limit');
```

### 5. Teste de Journal Entries Órfãos

```sql
-- Verificar entries órfãos ANTES
SELECT COUNT(*) FROM journal_entries
WHERE transaction_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM transactions WHERE id = journal_entries.transaction_id
  );

-- Limpar órfãos
SELECT cleanup_orphan_journal_entries();

-- Verificar entries órfãos DEPOIS
-- Espera: 0
```

## Cenários de Teste Completos

### Cenário 1: Fluxo Completo de Compra

```javascript
// 1. Criar conta de cartão de crédito
const { data: account } = await supabase.from('accounts').insert({
  name: 'Cartão Teste',
  type: 'credit',
  limit_amount: 5000
}).select().single();

// 2. Criar transação de compra
const { data: transaction } = await supabase.functions.invoke('atomic-transaction', {
  body: {
    transaction: {
      type: 'expense',
      amount: 100,
      account_id: account.id,
      category_id: 'food-category',
      description: 'Supermercado',
      date: '2025-01-18',
      status: 'completed'
    }
  }
});

// 3. Validar journal entries
const validation = await supabase.rpc('validate_double_entry_detailed', {
  p_transaction_id: transaction.id
});

expect(validation.is_valid).toBe(true);
expect(validation.total_debits).toBe(100);
expect(validation.total_credits).toBe(100);

// 4. Verificar saldo da conta
const { data: updatedAccount } = await supabase
  .from('accounts')
  .select('balance')
  .eq('id', account.id)
  .single();

expect(updatedAccount.balance).toBe(-100); // Negativo = dívida
```

### Cenário 2: Fluxo de Transferência

```javascript
// 1. Criar contas
const { data: checking } = await supabase.from('accounts').insert({
  name: 'Conta Corrente',
  type: 'checking',
  balance: 1000
}).select().single();

const { data: savings } = await supabase.from('accounts').insert({
  name: 'Poupança',
  type: 'savings',
  balance: 0
}).select().single();

// 2. Fazer transferência
const { data: transfer } = await supabase.functions.invoke('atomic-transfer', {
  body: {
    transfer: {
      from_account_id: checking.id,
      to_account_id: savings.id,
      amount: 500,
      date: '2025-01-18',
      description: 'Guardar dinheiro'
    }
  }
});

// 3. Verificar saldos
const { data: accounts } = await supabase
  .from('accounts')
  .select('*')
  .in('id', [checking.id, savings.id]);

const checkingAfter = accounts.find(a => a.id === checking.id);
const savingsAfter = accounts.find(a => a.id === savings.id);

expect(checkingAfter.balance).toBe(500);  // 1000 - 500
expect(savingsAfter.balance).toBe(500);   // 0 + 500

// 4. Verificar journal entries de ambas as transações
// Cada transação deve ter entries balanceados
```
