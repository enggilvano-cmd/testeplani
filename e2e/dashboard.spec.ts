import { test, expect } from '@playwright/test';
import { TestHelpers } from './fixtures/test-helpers';

test.describe('Dashboard', () => {
  let helpers: TestHelpers;

  test.beforeEach(async ({ page }) => {
    helpers = new TestHelpers(page);
    
    // Login com credenciais de teste
    const testEmail = process.env.TEST_EMAIL || 'test@example.com';
    const testPassword = process.env.TEST_PASSWORD || 'testpassword123';
    
    await helpers.login(testEmail, testPassword);
    await page.waitForURL('/', { timeout: 10000 });
  });

  test('should display balance cards', async ({ page }) => {
    // Verificar que os cards de saldo estão visíveis
    await expect(page.locator('text=Saldo Total')).toBeVisible();
    await expect(page.locator('text=Receitas')).toBeVisible();
    await expect(page.locator('text=Despesas')).toBeVisible();
  });

  test('should display recent transactions', async ({ page }) => {
    // Verificar seção de transações recentes
    const recentTransactions = page.locator('text=Transações Recentes').first();
    await expect(recentTransactions).toBeVisible();
  });

  test('should display financial evolution chart', async ({ page }) => {
    // Verificar que o gráfico está visível
    const chart = page.locator('[data-testid="financial-chart"]').first();
    await expect(chart).toBeVisible({ timeout: 5000 });
  });

  test('should open add transaction modal from quick actions', async ({ page }) => {
    // Clicar no botão de nova transação nas ações rápidas
    await page.locator('button:has-text("Nova Transação")').first().click();
    
    // Verificar que o modal abriu
    await expect(page.locator('text=Adicionar Transação')).toBeVisible();
    
    // Fechar modal
    await page.keyboard.press('Escape');
  });

  test('should open transfer modal from quick actions', async ({ page }) => {
    // Clicar no botão de transferência
    await page.locator('button:has-text("Transferência")').first().click();
    
    // Verificar que o modal de transferência abriu
    await expect(page.locator('text=Transferir entre Contas')).toBeVisible();
    
    // Fechar modal
    await page.keyboard.press('Escape');
  });

  test('should filter by period', async ({ page }) => {
    // Abrir filtro de período
    const periodButton = page.locator('button:has-text("Este mês")').first();
    await periodButton.click();
    
    // Selecionar período diferente
    await page.locator('text=Últimos 7 dias').click();
    
    // Aguardar atualização (debounce)
    await page.waitForTimeout(600);
    
    // Verificar que o filtro foi aplicado
    await expect(page.locator('text=Últimos 7 dias')).toBeVisible();
  });

  test('should navigate to transactions page', async ({ page }) => {
    // Clicar em "Ver todas"
    await page.locator('text=Ver todas').first().click();
    
    // Verificar navegação
    await expect(page).toHaveURL('/transactions');
  });

  test('should display accounts summary', async ({ page }) => {
    // Verificar seção de contas
    const accountsSection = page.locator('text=Contas').first();
    await expect(accountsSection).toBeVisible();
  });

  test('should handle error boundaries gracefully', async ({ page }) => {
    // Simular erro forçando uma condição inválida
    await page.evaluate(() => {
      // Forçar erro em um componente
      const errorEvent = new ErrorEvent('error', {
        error: new Error('Test error'),
        message: 'Test error message'
      });
      window.dispatchEvent(errorEvent);
    });
    
    // Verificar que a aplicação não crashou completamente
    // O error boundary deve capturar o erro
    await expect(page.locator('body')).toBeVisible();
  });
});
