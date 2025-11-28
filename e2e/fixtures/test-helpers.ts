import { Page } from '@playwright/test';

export class TestHelpers {
  constructor(private page: Page) {}

  async login(email: string, password: string) {
    await this.page.goto('/auth');
    await this.page.fill('input[type="email"]', email);
    await this.page.fill('input[type="password"]', password);
    await this.page.click('button:has-text("Entrar")');
    await this.page.waitForURL('/');
  }

  async signup(email: string, password: string, fullName: string) {
    await this.page.goto('/auth');
    await this.page.click('text=Criar conta');
    await this.page.fill('input[placeholder*="Nome"]', fullName);
    await this.page.fill('input[type="email"]', email);
    await this.page.fill('input[type="password"]', password);
    await this.page.click('button:has-text("Criar conta")');
  }

  async logout() {
    await this.page.click('[aria-label*="perfil"], [aria-label*="menu"]');
    await this.page.click('text=Sair');
  }

  async waitForToast(message?: string) {
    if (message) {
      await this.page.waitForSelector(`text=${message}`);
    } else {
      await this.page.waitForSelector('[role="status"]');
    }
  }

  async fillTransactionForm(data: {
    description: string;
    amount: string;
    type: 'income' | 'expense';
    account: string;
    category?: string;
  }) {
    await this.page.fill('input[placeholder*="Descrição"]', data.description);
    await this.page.fill('input[type="text"][placeholder*="0,00"]', data.amount);
    
    if (data.type === 'expense') {
      await this.page.click('button:has-text("Despesa")');
    } else {
      await this.page.click('button:has-text("Receita")');
    }

    await this.page.click('text=Conta');
    await this.page.click(`text=${data.account}`);

    if (data.category) {
      await this.page.click('text=Categoria');
      await this.page.click(`text=${data.category}`);
    }
  }

  async createAccount(name: string, type: string, balance?: string) {
    await this.page.click('button:has-text("Adicionar Conta")');
    await this.page.fill('input[placeholder*="Nome da conta"]', name);
    
    await this.page.click('text=Tipo de Conta');
    await this.page.click(`text=${type}`);

    if (balance) {
      await this.page.fill('input[placeholder*="Saldo"]', balance);
    }

    await this.page.click('button:has-text("Adicionar")');
  }

  formatCurrency(value: number): string {
    return new Intl.NumberFormat('pt-BR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  }
}
