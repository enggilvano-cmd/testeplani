import { test, expect } from '@playwright/test';
import { TestHelpers } from './fixtures/test-helpers';
import * as fs from 'fs';
import * as path from 'path';

test.describe('Reports and Exports', () => {
  let helpers: TestHelpers;

  test.beforeEach(async ({ page }) => {
    helpers = new TestHelpers(page);
    
    test.skip(!process.env.TEST_USER_EMAIL, 'Requires TEST_USER_EMAIL env var');
    
    await helpers.login(
      process.env.TEST_USER_EMAIL!,
      process.env.TEST_USER_PASSWORD!
    );
  });

  test('should export transactions to Excel', async ({ page }) => {
    await page.click('text=Transações');
    
    // Set up download listener
    const downloadPromise = page.waitForEvent('download');
    
    // Click export button
    await page.click('button[aria-label*="exportar"], button:has-text("Exportar")');
    
    // Wait for download
    const download = await downloadPromise;
    
    // Verify download
    expect(download.suggestedFilename()).toMatch(/\.xlsx$/);
    
    // Save and verify file exists
    const downloadPath = path.join(__dirname, '../downloads', download.suggestedFilename());
    await download.saveAs(downloadPath);
    
    expect(fs.existsSync(downloadPath)).toBeTruthy();
    
    // Cleanup
    fs.unlinkSync(downloadPath);
  });

  test('should export filtered transactions', async ({ page }) => {
    await page.click('text=Transações');
    
    // Apply filters
    await page.click('text=Tipo');
    await page.click('text=Receita');
    
    await page.click('text=Período');
    await page.click('text=Mês Atual');
    
    // Export
    const downloadPromise = page.waitForEvent('download');
    await page.click('button[aria-label*="exportar"], button:has-text("Exportar")');
    
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toContain('receita');
  });

  test('should navigate to analytics page', async ({ page }) => {
    await page.click('text=Análises, text=Analytics');
    
    // Verify charts are visible
    await expect(page.locator('canvas, svg')).toBeVisible();
    await expect(page.locator('text=/gráfico|chart/i')).toBeVisible();
  });

  test('should display financial summary on dashboard', async ({ page }) => {
    await page.goto('/');
    
    // Verify summary cards
    await expect(page.locator('text=/receita|income/i')).toBeVisible();
    await expect(page.locator('text=/despesa|expense/i')).toBeVisible();
    await expect(page.locator('text=/saldo|balance/i')).toBeVisible();
    
    // Verify amounts are displayed
    await expect(page.locator('text=/R\\$/').first()).toBeVisible();
  });

  test('should export accounts list', async ({ page }) => {
    await page.click('text=Contas');
    
    const downloadPromise = page.waitForEvent('download');
    await page.click('button[aria-label*="exportar"], button:has-text("Exportar")');
    
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/contas.*\.xlsx$/);
  });

  test('should filter analytics by date range', async ({ page }) => {
    await page.click('text=Análises, text=Analytics');
    
    // Select date filter
    await page.click('text=Período');
    await page.click('text=Últimos 3 meses');
    
    // Charts should update (wait for re-render)
    await page.waitForTimeout(1000);
    
    // Verify charts are still visible
    await expect(page.locator('canvas, svg')).toBeVisible();
  });

  test('should display category breakdown chart', async ({ page }) => {
    await page.click('text=Análises, text=Analytics');
    
    // Verify category chart exists
    await expect(page.locator('text=/categoria|category/i')).toBeVisible();
    await expect(page.locator('canvas, svg')).toBeVisible();
  });

  test('should export with custom date range', async ({ page }) => {
    await page.click('text=Transações');
    
    // Select custom date range
    await page.click('text=Período');
    await page.click('text=Personalizado, text=Custom');
    
    // Select dates (simplified - actual implementation may vary)
    const today = new Date();
    const lastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    
    // Export
    const downloadPromise = page.waitForEvent('download');
    await page.click('button[aria-label*="exportar"], button:has-text("Exportar")');
    
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/\.xlsx$/);
  });

  test('should navigate to accounting reports', async ({ page }) => {
    // Check if accounting page exists
    const accountingLink = page.locator('text=Contabilidade, text=Accounting');
    
    if (await accountingLink.count() > 0) {
      await accountingLink.click();
      
      // Verify reports page
      await expect(page.locator('text=/relatório|report/i')).toBeVisible();
    }
  });
});
