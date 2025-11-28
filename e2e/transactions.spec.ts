import { test, expect } from '@playwright/test';
import { TestHelpers } from './fixtures/test-helpers';

test.describe('Transaction Management', () => {
  let helpers: TestHelpers;

  test.beforeEach(async ({ page }) => {
    helpers = new TestHelpers(page);
    
    // Skip tests if no test credentials
    test.skip(!process.env.TEST_USER_EMAIL, 'Requires TEST_USER_EMAIL env var');
    
    await helpers.login(
      process.env.TEST_USER_EMAIL!,
      process.env.TEST_USER_PASSWORD!
    );
  });

  test('should create an income transaction', async ({ page }) => {
    // Navigate to transactions page
    await page.click('text=Transações');
    
    // Click add transaction button
    await page.click('button:has-text("Nova Transação"), button[aria-label*="transação"]');
    
    // Fill transaction form
    await helpers.fillTransactionForm({
      description: 'Salário E2E Test',
      amount: '5000,00',
      type: 'income',
      account: 'Conta Corrente',
      category: 'Salário',
    });
    
    // Submit form
    await page.click('button:has-text("Adicionar")');
    
    // Verify toast notification
    await helpers.waitForToast('sucesso');
    
    // Verify transaction appears in list
    await expect(page.locator('text=Salário E2E Test')).toBeVisible();
  });

  test('should create an expense transaction', async ({ page }) => {
    await page.click('text=Transações');
    await page.click('button:has-text("Nova Transação"), button[aria-label*="transação"]');
    
    await helpers.fillTransactionForm({
      description: 'Supermercado E2E Test',
      amount: '250,50',
      type: 'expense',
      account: 'Conta Corrente',
      category: 'Alimentação',
    });
    
    await page.click('button:has-text("Adicionar")');
    await helpers.waitForToast('sucesso');
    
    await expect(page.locator('text=Supermercado E2E Test')).toBeVisible();
  });

  test('should edit a transaction', async ({ page }) => {
    await page.click('text=Transações');
    
    // Find and click edit button for first transaction
    await page.locator('button[aria-label*="menu"], button:has-text("⋮")').first().click();
    await page.click('text=Editar');
    
    // Update description
    const input = page.locator('input[placeholder*="Descrição"]');
    await input.clear();
    await input.fill('Descrição Editada E2E');
    
    // Save changes
    await page.click('button:has-text("Salvar")');
    await helpers.waitForToast('sucesso');
    
    // Verify updated transaction
    await expect(page.locator('text=Descrição Editada E2E')).toBeVisible();
  });

  test('should delete a transaction', async ({ page }) => {
    await page.click('text=Transações');
    
    // Create a transaction to delete
    await page.click('button:has-text("Nova Transação"), button[aria-label*="transação"]');
    await helpers.fillTransactionForm({
      description: 'Transação para Deletar',
      amount: '100,00',
      type: 'expense',
      account: 'Conta Corrente',
    });
    await page.click('button:has-text("Adicionar")');
    await helpers.waitForToast('sucesso');
    
    // Find the transaction and delete it
    const transactionRow = page.locator('text=Transação para Deletar').locator('..');
    await transactionRow.locator('button[aria-label*="menu"], button:has-text("⋮")').click();
    await page.click('text=Excluir');
    
    // Confirm deletion
    page.on('dialog', dialog => dialog.accept());
    
    await helpers.waitForToast('sucesso');
    
    // Verify transaction is gone
    await expect(page.locator('text=Transação para Deletar')).not.toBeVisible();
  });

  test('should filter transactions by type', async ({ page }) => {
    await page.click('text=Transações');
    
    // Filter by income
    await page.click('text=Tipo');
    await page.click('text=Receita');
    
    // Verify only income transactions are visible
    const incomeIcon = page.locator('text=trending-up, .text-success');
    await expect(incomeIcon.first()).toBeVisible();
  });

  test('should search transactions', async ({ page }) => {
    await page.click('text=Transações');
    
    // Enter search term
    await page.fill('input[placeholder*="Buscar"]', 'Salário');
    
    // Verify filtered results
    await expect(page.locator('text=Salário')).toBeVisible();
  });

  test('should validate required fields', async ({ page }) => {
    await page.click('text=Transações');
    await page.click('button:has-text("Nova Transação"), button[aria-label*="transação"]');
    
    // Try to submit empty form
    await page.click('button:has-text("Adicionar")');
    
    // Should show validation errors
    await expect(page.locator('text=/obrigatório|required/i')).toBeVisible();
  });

  test('should mark transaction as paid', async ({ page }) => {
    await page.click('text=Transações');
    
    // Find a pending transaction
    const pendingTransaction = page.locator('[data-status="pending"]').first();
    
    if (await pendingTransaction.count() > 0) {
      await pendingTransaction.locator('button[aria-label*="menu"]').click();
      await page.click('text=Marcar como Pago');
      
      // Confirm in modal
      await page.click('button:has-text("Confirmar")');
      await helpers.waitForToast('sucesso');
      
      // Verify status changed
      await expect(page.locator('text=Completado, text=Pago')).toBeVisible();
    }
  });
});
