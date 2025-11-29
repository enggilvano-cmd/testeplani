import { test, expect } from '@playwright/test';
import { TestHelpers } from './fixtures/test-helpers';

test.describe('Offline Functionality', () => {
  let helpers: TestHelpers;

  test.beforeEach(async ({ page }) => {
    helpers = new TestHelpers(page);
    // Hardcoded credentials for testing purposes
    await helpers.login('test@example.com', 'password123');
    await page.goto('/');
  });

  test('should queue a transaction when offline and sync when back online', async ({ page, context }) => {
    // 1. Start online and navigate to the transactions page
    await page.click('a[href="/transactions"]');
    await expect(page.locator('h1')).toContainText('Transações');

    // 2. Click to add a new transaction
    await page.click('button:has-text("Adicionar")');

    // 3. Go offline
    await context.setOffline(true);
    await page.waitForTimeout(1000); // Wait for the app to recognize the offline status

    // 4. Fill and submit the transaction form
    const transactionDescription = `Offline Transaction ${Date.now()}`;
    await helpers.fillTransactionForm({
      description: transactionDescription,
      amount: '12,34',
      type: 'expense',
      account: 'Conta Corrente', // Assuming this account exists
      category: 'Alimentação', // Assuming this category exists
    });
    await page.click('button:has-text("Adicionar Transação")');

    // 5. Verify the toast message for offline mode
    await helpers.waitForToast('Transação registrada para sincronização');

    // 6. Verify the transaction appears in the list with a temporary indicator
    // (This assumes there's a visual cue for pending transactions)
    const pendingTransaction = page.locator(`text=${transactionDescription}`);
    await expect(pendingTransaction).toBeVisible();
    // Example: check for a specific class or icon
    // await expect(pendingTransaction.locator('..')).toHaveClass(/pending/);

    // 7. Go back online
    await context.setOffline(false);

    // 8. Wait for synchronization to complete.
    // This could be tricky. We can wait for a toast message or for the temporary indicator to disappear.
    // For now, let's wait for a success toast.
    await helpers.waitForToast('1 operações sincronizadas.');

    // 9. Verify the transaction is now synced (e.g., the pending indicator is gone)
    // await expect(pendingTransaction.locator('..')).not.toHaveClass(/pending/);

    // 10. Reload the page and verify the transaction is still there (persisted on the server)
    await page.reload();
    await expect(page.locator(`text=${transactionDescription}`)).toBeVisible();
  });

  test('should perform logout when offline', async ({ page, context }) => {
    // 1. Go offline
    await context.setOffline(true);
    await page.waitForTimeout(1000);

    // 2. Perform logout
    await helpers.logout();

    // 3. Verify user is redirected to the login page
    await page.waitForURL('/auth');
    await expect(page.locator('h1')).toContainText('Bem-vindo');

    // 4. Go back online
    await context.setOffline(false);
    await page.waitForTimeout(1000);

    // 5. Try to navigate to a protected route
    await page.goto('/');
    // Should be redirected back to auth page
    await page.waitForURL('/auth');
    await expect(page.locator('h1')).toContainText('Bem-vindo');
  });
});
