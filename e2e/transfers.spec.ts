import { test, expect } from '@playwright/test';
import { TestHelpers } from './fixtures/test-helpers';

test.describe('Account Transfers', () => {
  let helpers: TestHelpers;

  test.beforeEach(async ({ page }) => {
    helpers = new TestHelpers(page);
    
    test.skip(!process.env.TEST_USER_EMAIL, 'Requires TEST_USER_EMAIL env var');
    
    await helpers.login(
      process.env.TEST_USER_EMAIL!,
      process.env.TEST_USER_PASSWORD!
    );
  });

  test('should create a transfer between accounts', async ({ page }) => {
    await page.goto('/');
    
    // Click transfer button
    await page.click('button:has-text("Transferência"), button[aria-label*="transferência"]');
    
    // Fill transfer form
    await page.fill('input[placeholder*="Descrição"]', 'Transferência E2E Test');
    await page.fill('input[placeholder*="0,00"]', '1000,00');
    
    // Select source account
    await page.locator('text=Conta de Origem').click();
    await page.click('text=Conta Corrente');
    
    // Select destination account
    await page.locator('text=Conta de Destino').click();
    await page.click('text=Poupança');
    
    // Submit transfer
    await page.click('button:has-text("Transferir")');
    
    // Verify success
    await helpers.waitForToast('sucesso');
  });

  test('should validate transfer form', async ({ page }) => {
    await page.goto('/');
    await page.click('button:has-text("Transferência")');
    
    // Try to submit empty form
    await page.click('button:has-text("Transferir")');
    
    // Should show validation errors
    await expect(page.locator('text=/obrigatório|required/i')).toBeVisible();
  });

  test('should not allow transfer to same account', async ({ page }) => {
    await page.goto('/');
    await page.click('button:has-text("Transferência")');
    
    await page.fill('input[placeholder*="Descrição"]', 'Transfer Same Account');
    await page.fill('input[placeholder*="0,00"]', '500,00');
    
    // Select same account for both
    await page.locator('text=Conta de Origem').click();
    await page.click('text=Conta Corrente');
    
    await page.locator('text=Conta de Destino').click();
    await page.click('text=Conta Corrente');
    
    // Try to submit
    await page.click('button:has-text("Transferir")');
    
    // Should show error
    await helpers.waitForToast();
    await expect(page.locator('text=/mesma conta|same account/i')).toBeVisible();
  });

  test('should verify transfer updates both account balances', async ({ page }) => {
    // Navigate to accounts page
    await page.click('text=Contas');
    
    // Get initial balances
    const sourceAccountRow = page.locator('text=Conta Corrente').locator('..');
    const destAccountRow = page.locator('text=Poupança').locator('..');
    
    const sourceBalanceText = await sourceAccountRow.locator('text=/R\\$/').textContent();
    const destBalanceText = await destAccountRow.locator('text=/R\\$/').textContent();
    
    // Create transfer
    await page.click('button:has-text("Transferência")');
    await page.fill('input[placeholder*="Descrição"]', 'Test Balance Update');
    await page.fill('input[placeholder*="0,00"]', '100,00');
    
    await page.locator('text=Conta de Origem').click();
    await page.click('text=Conta Corrente');
    
    await page.locator('text=Conta de Destino').click();
    await page.click('text=Poupança');
    
    await page.click('button:has-text("Transferir")');
    await helpers.waitForToast('sucesso');
    
    // Go back to accounts and verify balances changed
    await page.click('text=Contas');
    
    const newSourceBalanceText = await sourceAccountRow.locator('text=/R\\$/').textContent();
    const newDestBalanceText = await destAccountRow.locator('text=/R\\$/').textContent();
    
    // Balances should have changed
    expect(newSourceBalanceText).not.toBe(sourceBalanceText);
    expect(newDestBalanceText).not.toBe(destBalanceText);
  });

  test('should display transfer in transactions list', async ({ page }) => {
    // Create a transfer
    await page.goto('/');
    await page.click('button:has-text("Transferência")');
    
    await page.fill('input[placeholder*="Descrição"]', 'Transfer for List Test');
    await page.fill('input[placeholder*="0,00"]', '250,00');
    
    await page.locator('text=Conta de Origem').click();
    await page.click('text=Conta Corrente');
    
    await page.locator('text=Conta de Destino').click();
    await page.click('text=Poupança');
    
    await page.click('button:has-text("Transferir")');
    await helpers.waitForToast('sucesso');
    
    // Navigate to transactions
    await page.click('text=Transações');
    
    // Filter by transfers
    await page.click('text=Tipo');
    await page.click('text=Transferência');
    
    // Verify transfer appears
    await expect(page.locator('text=Transfer for List Test')).toBeVisible();
  });
});
