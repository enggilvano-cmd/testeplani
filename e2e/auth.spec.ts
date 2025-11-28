import { test, expect } from '@playwright/test';
import { TestHelpers } from './fixtures/test-helpers';

test.describe('Authentication Flow', () => {
  let helpers: TestHelpers;

  test.beforeEach(async ({ page }) => {
    helpers = new TestHelpers(page);
  });

  test('should display login page', async ({ page }) => {
    await page.goto('/auth');
    
    await expect(page.locator('h1, h2')).toContainText(/entrar|login/i);
    await expect(page.locator('input[type="email"]')).toBeVisible();
    await expect(page.locator('input[type="password"]')).toBeVisible();
  });

  test('should show error for invalid credentials', async ({ page }) => {
    await page.goto('/auth');
    
    await page.fill('input[type="email"]', 'invalid@example.com');
    await page.fill('input[type="password"]', 'wrongpassword');
    await page.click('button:has-text("Entrar")');
    
    await helpers.waitForToast();
    await expect(page.locator('[role="status"]')).toBeVisible();
  });

  test('should show validation error for invalid email', async ({ page }) => {
    await page.goto('/auth');
    
    await page.fill('input[type="email"]', 'not-an-email');
    await page.fill('input[type="password"]', 'password123');
    await page.click('button:has-text("Entrar")');
    
    await expect(page.locator('text=/email.*inválido/i')).toBeVisible();
  });

  test('should navigate to signup form', async ({ page }) => {
    await page.goto('/auth');
    
    await page.click('text=Criar conta');
    
    await expect(page.locator('input[placeholder*="Nome"]')).toBeVisible();
    await expect(page.locator('h1, h2')).toContainText(/criar.*conta|cadastr/i);
  });

  test('should validate signup form fields', async ({ page }) => {
    await page.goto('/auth');
    await page.click('text=Criar conta');
    
    await page.click('button:has-text("Criar conta")');
    
    // Should show validation errors
    const errors = page.locator('text=/obrigatório|required/i');
    await expect(errors.first()).toBeVisible();
  });

  test('should redirect to dashboard after successful login', async ({ page }) => {
    // Note: This test requires valid test credentials
    // In real scenario, use test user from env variables
    test.skip(!process.env.TEST_USER_EMAIL, 'Requires TEST_USER_EMAIL env var');
    
    await helpers.login(
      process.env.TEST_USER_EMAIL!,
      process.env.TEST_USER_PASSWORD!
    );
    
    await expect(page).toHaveURL('/');
    await expect(page.locator('text=/dashboard|visão geral/i')).toBeVisible();
  });

  test('should be able to logout', async ({ page }) => {
    test.skip(!process.env.TEST_USER_EMAIL, 'Requires TEST_USER_EMAIL env var');
    
    await helpers.login(
      process.env.TEST_USER_EMAIL!,
      process.env.TEST_USER_PASSWORD!
    );
    
    await helpers.logout();
    
    await expect(page).toHaveURL('/auth');
  });
});
