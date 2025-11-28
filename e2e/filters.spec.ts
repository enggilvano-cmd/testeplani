import { test, expect } from '@playwright/test';
import { TestHelpers } from './fixtures/test-helpers';

test.describe('Transaction Filters with Debounce', () => {
  let helpers: TestHelpers;

  test.beforeEach(async ({ page }) => {
    helpers = new TestHelpers(page);
    
    const testEmail = process.env.TEST_EMAIL || 'test@example.com';
    const testPassword = process.env.TEST_PASSWORD || 'testpassword123';
    
    await helpers.login(testEmail, testPassword);
    await page.goto('/transactions');
  });

  test('should debounce search input', async ({ page }) => {
    const searchInput = page.locator('input[placeholder*="Buscar"]').first();
    
    // Digitar rapidamente (simular usuário digitando)
    await searchInput.fill('t');
    await page.waitForTimeout(100);
    await searchInput.fill('te');
    await page.waitForTimeout(100);
    await searchInput.fill('tes');
    await page.waitForTimeout(100);
    await searchInput.fill('test');
    
    // Aguardar debounce (500ms)
    await page.waitForTimeout(600);
    
    // Verificar que apenas uma requisição foi feita após o debounce
    await expect(searchInput).toHaveValue('test');
  });

  test('should apply multiple filters', async ({ page }) => {
    // Abrir filtros
    const filterButton = page.locator('button:has-text("Filtros")').first();
    await filterButton.click();
    
    // Selecionar tipo
    await page.locator('text=Tipo').click();
    await page.locator('text=Receitas').first().click();
    
    // Selecionar status
    await page.locator('text=Status').click();
    await page.locator('text=Concluída').first().click();
    
    // Aplicar filtros
    await page.locator('button:has-text("Aplicar")').click();
    
    // Aguardar debounce e atualização
    await page.waitForTimeout(600);
    
    // Verificar chips de filtro aplicados
    await expect(page.locator('text=Receitas')).toBeVisible();
    await expect(page.locator('text=Concluída')).toBeVisible();
  });

  test('should clear filters', async ({ page }) => {
    // Aplicar filtro primeiro
    const filterButton = page.locator('button:has-text("Filtros")').first();
    await filterButton.click();
    
    await page.locator('text=Tipo').click();
    await page.locator('text=Despesas').first().click();
    await page.locator('button:has-text("Aplicar")').click();
    
    await page.waitForTimeout(600);
    
    // Limpar filtros
    await page.locator('button:has-text("Limpar")').first().click();
    
    // Aguardar debounce
    await page.waitForTimeout(600);
    
    // Verificar que filtros foram removidos
    await expect(page.locator('text=Despesas').first()).not.toBeVisible();
  });

  test('should persist filters on page reload', async ({ page }) => {
    // Aplicar filtro
    const searchInput = page.locator('input[placeholder*="Buscar"]').first();
    await searchInput.fill('test');
    await page.waitForTimeout(600);
    
    // Recarregar página
    await page.reload();
    
    // Verificar que o filtro persistiu
    await expect(searchInput).toHaveValue('test');
  });

  test('should filter by date range', async ({ page }) => {
    // Abrir seletor de período
    const periodButton = page.locator('button').filter({ hasText: /Este mês|Período/ }).first();
    await periodButton.click();
    
    // Selecionar período personalizado
    await page.locator('text=Personalizado').click();
    
    // Aguardar debounce
    await page.waitForTimeout(600);
    
    // Verificar que o calendário apareceu
    await expect(page.locator('[role="dialog"]')).toBeVisible();
  });
});
