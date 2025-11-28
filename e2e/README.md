# E2E Tests with Playwright

Testes end-to-end para fluxos críticos do sistema financeiro.

## Configuração

### 1. Instalar Playwright

```bash
npm install
npx playwright install
```

### 2. Configurar Variáveis de Ambiente

Crie um arquivo `.env.test` na raiz do projeto:

```env
TEST_USER_EMAIL=test@example.com
TEST_USER_PASSWORD=your-test-password
```

**IMPORTANTE:** Use credenciais de teste, nunca use credenciais de produção!

### 3. Executar Testes

```bash
# Executar todos os testes
npx playwright test

# Executar testes específicos
npx playwright test e2e/auth.spec.ts
npx playwright test e2e/transactions.spec.ts
npx playwright test e2e/transfers.spec.ts
npx playwright test e2e/reports.spec.ts

# Executar com interface gráfica
npx playwright test --ui

# Executar em modo debug
npx playwright test --debug

# Ver relatório HTML
npx playwright show-report
```

## Estrutura dos Testes

### `e2e/auth.spec.ts`
- Login com credenciais válidas/inválidas
- Registro de novo usuário
- Validação de formulários
- Logout
- Redirecionamentos

### `e2e/transactions.spec.ts`
- Criar transação de receita
- Criar transação de despesa
- Editar transação
- Deletar transação
- Filtrar transações
- Buscar transações
- Validação de campos
- Marcar como pago

### `e2e/transfers.spec.ts`
- Criar transferência entre contas
- Validar formulário de transferência
- Verificar atualização de saldos
- Impedir transferência para mesma conta
- Visualizar transferências na lista

### `e2e/reports.spec.ts`
- Exportar transações para Excel
- Exportar com filtros aplicados
- Exportar lista de contas
- Visualizar análises e gráficos
- Filtrar por período
- Exportar com data customizada

## Helpers e Fixtures

### `TestHelpers` (`e2e/fixtures/test-helpers.ts`)

Métodos utilitários para reutilização:

```typescript
// Login
await helpers.login(email, password);

// Logout
await helpers.logout();

// Criar transação
await helpers.fillTransactionForm({
  description: 'Test',
  amount: '100,00',
  type: 'expense',
  account: 'Conta Corrente'
});

// Esperar toast
await helpers.waitForToast('sucesso');

// Formatar moeda
const formatted = helpers.formatCurrency(1000);
```

## CI/CD

Os testes estão configurados para rodar em CI com:
- 2 retries em caso de falha
- Screenshot em falhas
- Trace em primeira retry
- Reporter HTML

### GitHub Actions

Adicione ao `.github/workflows/e2e.yml`:

```yaml
name: E2E Tests
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: 18
      - run: npm ci
      - run: npx playwright install --with-deps
      - run: npx playwright test
        env:
          TEST_USER_EMAIL: ${{ secrets.TEST_USER_EMAIL }}
          TEST_USER_PASSWORD: ${{ secrets.TEST_USER_PASSWORD }}
      - uses: actions/upload-artifact@v3
        if: always()
        with:
          name: playwright-report
          path: playwright-report/
```

## Boas Práticas

1. **Isolamento**: Cada teste deve ser independente
2. **Cleanup**: Limpar dados de teste após execução
3. **Seletores**: Usar `data-testid` quando possível
4. **Esperas**: Usar `waitFor` ao invés de `setTimeout`
5. **Credenciais**: Nunca commitar credenciais reais
6. **Mobile**: Testar em diferentes dispositivos

## Debugging

### Visual Debugging
```bash
npx playwright test --debug
```

### Ver traces
```bash
npx playwright show-trace trace.zip
```

### Codegen - Gerar testes automaticamente
```bash
npx playwright codegen http://localhost:8080
```

## Recursos Adicionais

- [Documentação Playwright](https://playwright.dev)
- [Best Practices](https://playwright.dev/docs/best-practices)
- [API Reference](https://playwright.dev/docs/api/class-playwright)
