# Sistema de Validação Server-Side com Zod

## Visão Geral

Todas as Edge Functions agora implementam validação server-side usando **Zod v3.22.4**, garantindo que todos os inputs sejam validados antes de processar operações sensíveis.

## Schemas Implementados

### 1. TransactionInputSchema
**Edge Function:** `atomic-transaction`

```typescript
{
  description: string (1-200 chars, required),
  amount: number (positive, max 1B),
  date: string (YYYY-MM-DD),
  type: 'income' | 'expense',
  category_id: UUID,
  account_id: UUID,
  status: 'pending' | 'completed',
  invoice_month?: string (YYYY-MM),
  invoice_month_overridden?: boolean
}
```

**Validações:**
- ✅ Description não vazia e com limite de 200 caracteres
- ✅ Amount positivo e dentro do limite (1 bilhão de centavos)
- ✅ Date no formato correto (YYYY-MM-DD)
- ✅ Type restrito a 'income' ou 'expense'
- ✅ UUIDs válidos para account_id e category_id
- ✅ Invoice_month opcional no formato YYYY-MM

### 2. EditTransactionInputSchema
**Edge Function:** `atomic-edit-transaction`

```typescript
{
  transaction_id: UUID,
  updates: {
    description?: string (1-200 chars),
    amount?: number (positive, max 1B),
    date?: string (YYYY-MM-DD),
    type?: 'income' | 'expense',
    category_id?: UUID,
    account_id?: UUID,
    status?: 'pending' | 'completed',
    invoice_month?: string (YYYY-MM),
    invoice_month_overridden?: boolean
  },
  scope?: 'current' | 'current-and-remaining' | 'all'
}
```

**Validações:**
- ✅ Transaction_id é UUID válido
- ✅ Updates são opcionais mas validados se presentes
- ✅ Scope restrito aos valores permitidos

### 3. DeleteTransactionInputSchema
**Edge Function:** `atomic-delete-transaction`

```typescript
{
  transaction_id: UUID,
  scope?: 'current' | 'current-and-remaining' | 'all'
}
```

**Validações:**
- ✅ Transaction_id é UUID válido
- ✅ Scope restrito aos valores permitidos

### 4. TransferInputSchema
**Edge Function:** `atomic-transfer`

```typescript
{
  from_account_id: UUID,
  to_account_id: UUID,
  amount: number (positive, max 1B),
  description: string (1-200 chars),
  date: string (YYYY-MM-DD),
  status: 'pending' | 'completed'
}
```

**Validações:**
- ✅ UUIDs válidos para ambas as contas
- ✅ Amount positivo e dentro do limite
- ✅ Description não vazia com limite de caracteres
- ✅ Date no formato correto
- ✅ **Refinamento**: from_account_id ≠ to_account_id

### 5. PayBillInputSchema
**Edge Function:** `atomic-pay-bill`

```typescript
{
  credit_account_id: UUID,
  debit_account_id: UUID,
  amount: number (positive, max 1B),
  payment_date: string (YYYY-MM-DD),
  description?: string (1-200 chars)
}
```

**Validações:**
- ✅ UUIDs válidos para ambas as contas
- ✅ Amount positivo e dentro do limite
- ✅ Payment_date no formato correto
- ✅ Description opcional mas validada se presente
- ✅ **Refinamento**: credit_account_id ≠ debit_account_id

### 6. DeleteUserInputSchema
**Edge Function:** `delete-user`

```typescript
{
  userId: UUID
}
```

**Validações:**
- ✅ UserId é UUID válido

### 7. GenerateTestDataInputSchema
**Edge Function:** `generate-test-data`

```typescript
{
  transactionCount?: number (1-50000),
  startDate?: string (YYYY-MM-DD),
  endDate?: string (YYYY-MM-DD),
  clearExisting?: boolean
}
```

**Validações:**
- ✅ TransactionCount entre 1 e 50.000
- ✅ Datas no formato correto
- ✅ Todos os campos opcionais com valores default

## Tipos Básicos Reutilizáveis

### uuidSchema
```typescript
z.string().uuid({ message: 'Invalid UUID format' })
```

### dateSchema
```typescript
z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM format')
```

### invoiceMonthSchema
```typescript
z.string().regex(/^\d{4}-\d{2}$/, 'Invoice month must be in YYYY-MM format').optional()
```

## Helper de Validação

### validateWithZod()
```typescript
function validateWithZod<T>(
  schema: z.ZodSchema<T>, 
  data: unknown
): { success: true; data: T } | { success: false; errors: Record<string, string> }
```

**Características:**
- ✅ Type-safe com generics
- ✅ Retorna dados validados ou erros estruturados
- ✅ Converte erros Zod em formato flat (campo → mensagem)

### validationErrorResponse()
```typescript
function validationErrorResponse(
  errors: Record<string, string>, 
  corsHeaders: Record<string, string>
): Response
```

**Retorna:**
```json
{
  "error": "Validation failed",
  "details": {
    "field1": "Error message 1",
    "field2": "Error message 2"
  }
}
```

## Padrão de Uso nas Edge Functions

```typescript
// 1. Importar schemas e helpers
import { TransactionInputSchema, validateWithZod, validationErrorResponse } from '../_shared/validation.ts';

// 2. Parse JSON
const body = await req.json();

// 3. Validar
const validation = validateWithZod(TransactionInputSchema, body.transaction);
if (!validation.success) {
  console.error('[function] ERROR: Validation failed:', validation.errors);
  return validationErrorResponse(validation.errors, corsHeaders);
}

// 4. Usar dados validados (type-safe)
const transaction = validation.data;
```

## Benefícios Implementados

### 🔒 Segurança
- **Prevenção de SQL Injection:** Validação de UUIDs e tipos
- **Prevenção de Overflow:** Limites em amounts e strings
- **Validação de Formato:** Datas, enums, patterns

### 🎯 Type Safety
- **Inferência de Tipos:** TypeScript infere tipos dos schemas
- **Dados Garantidos:** Após validação, dados são 100% confiáveis
- **Autocomplete:** IDE fornece autocomplete baseado nos schemas

### 🐛 Debug Melhorado
- **Erros Claros:** Mensagens específicas por campo
- **Logs Estruturados:** Todos os erros são logados
- **Rastreamento:** Erros vinculados às Edge Functions

### 📊 Manutenibilidade
- **Schemas Centralizados:** Um único arquivo (_shared/validation.ts)
- **Reutilização:** Tipos básicos compartilhados
- **Consistência:** Mesmas regras em todas as functions

## Comparação: Antes vs Depois

### ❌ Antes
```typescript
// Validação manual inconsistente
if (!input.description || input.description.length > 200) {
  return new Response(JSON.stringify({ error: 'Invalid description' }), { status: 400 });
}
if (typeof input.amount !== 'number' || input.amount <= 0) {
  return new Response(JSON.stringify({ error: 'Invalid amount' }), { status: 400 });
}
// ... dezenas de validações manuais
```

**Problemas:**
- ❌ Validação incompleta
- ❌ Mensagens genéricas
- ❌ Código duplicado
- ❌ Sem type safety

### ✅ Depois
```typescript
const validation = validateWithZod(TransactionInputSchema, body);
if (!validation.success) {
  return validationErrorResponse(validation.errors, corsHeaders);
}
const transaction = validation.data; // Type-safe!
```

**Vantagens:**
- ✅ Validação completa automática
- ✅ Mensagens específicas por campo
- ✅ Zero duplicação
- ✅ Type safety total

## Status de Implementação

| Edge Function | Schema | Validação | Status |
|--------------|--------|-----------|--------|
| atomic-transaction | ✅ | ✅ | ✅ Completo |
| atomic-edit-transaction | ✅ | ✅ | ✅ Completo |
| atomic-delete-transaction | ✅ | ✅ | ✅ Completo |
| atomic-transfer | ✅ | ✅ | ✅ Completo |
| atomic-pay-bill | ✅ | ✅ | ✅ Completo |
| delete-user | ✅ | ✅ | ✅ Completo |
| generate-test-data | ✅ | ✅ | ✅ Completo |
| generate-recurring-transactions | - | - | ⚠️ Job automatizado |
| generate-fixed-transactions-yearly | - | - | ⚠️ Job automatizado |

**Nota:** Jobs automatizados (recurring/fixed) não recebem input do usuário, portanto não necessitam validação Zod.

## Próximos Passos

### 🚀 Implementados
- ✅ Rate limiting completo
- ✅ Validação Zod server-side completa

### 📋 Pendentes
1. **Transações PostgreSQL Explícitas**
   - Implementar BEGIN/COMMIT/ROLLBACK em operações multi-tabela
   - Garantir atomicidade completa

2. **Error Handling Avançado**
   - Logs estruturados com níveis (DEBUG, INFO, WARN, ERROR)
   - Rastreamento de erros com IDs únicos
   - Métricas de performance

3. **Observabilidade**
   - Integração com APM (Application Performance Monitoring)
   - Dashboards de métricas
   - Alertas automáticos

## Referências

- [Zod Documentation](https://zod.dev/)
- [Supabase Edge Functions Security](https://supabase.com/docs/guides/functions/security)
- [Input Validation Best Practices](https://cheatsheetseries.owasp.org/cheatsheets/Input_Validation_Cheat_Sheet.html)
