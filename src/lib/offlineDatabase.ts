import { logger } from './logger';
import type { Transaction, Account, Category } from '@/types';

const DB_NAME = 'planiflow-offline';
const DB_VERSION = 2;

const STORES = {
  TRANSACTIONS: 'transactions',
  ACCOUNTS: 'accounts',
  CATEGORIES: 'categories',
  OPERATIONS_QUEUE: 'operations-queue',
  METADATA: 'metadata',
} as const;

class OfflineDatabase {
  private db: IDBDatabase | null = null;

  async init(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => {
        logger.error('Failed to open IndexedDB:', request.error);
        reject(request.error);
      };

      request.onsuccess = () => {
        this.db = request.result;
        logger.info('IndexedDB initialized successfully');
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        // Transactions store
        if (!db.objectStoreNames.contains(STORES.TRANSACTIONS)) {
          const txStore = db.createObjectStore(STORES.TRANSACTIONS, { keyPath: 'id' });
          txStore.createIndex('user_id', 'user_id', { unique: false });
          txStore.createIndex('date', 'date', { unique: false });
          txStore.createIndex('updated_at', 'updated_at', { unique: false });
        }

        // Accounts store
        if (!db.objectStoreNames.contains(STORES.ACCOUNTS)) {
          const accStore = db.createObjectStore(STORES.ACCOUNTS, { keyPath: 'id' });
          accStore.createIndex('user_id', 'user_id', { unique: false });
          accStore.createIndex('updated_at', 'updated_at', { unique: false });
        }

        // Categories store
        if (!db.objectStoreNames.contains(STORES.CATEGORIES)) {
          const catStore = db.createObjectStore(STORES.CATEGORIES, { keyPath: 'id' });
          catStore.createIndex('user_id', 'user_id', { unique: false });
          catStore.createIndex('updated_at', 'updated_at', { unique: false });
        }

        // Operations queue store
        if (!db.objectStoreNames.contains(STORES.OPERATIONS_QUEUE)) {
          const opStore = db.createObjectStore(STORES.OPERATIONS_QUEUE, { keyPath: 'id' });
          opStore.createIndex('timestamp', 'timestamp', { unique: false });
          opStore.createIndex('type', 'type', { unique: false });
        }

        // Metadata store (for sync tracking)
        if (!db.objectStoreNames.contains(STORES.METADATA)) {
          db.createObjectStore(STORES.METADATA, { keyPath: 'key' });
        }
      };
    });
  }

  // Transactions
  async saveTransactions(transactions: Transaction[]): Promise<void> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORES.TRANSACTIONS], 'readwrite');
      const store = transaction.objectStore(STORES.TRANSACTIONS);

      transactions.forEach(tx => store.put(tx));

      transaction.oncomplete = () => {
        logger.info(`Saved ${transactions.length} transactions to cache`);
        resolve();
      };

      transaction.onerror = () => {
        logger.error('Failed to save transactions:', transaction.error);
        reject(transaction.error);
      };
    });
  }

  async getTransactions(userId: string, monthsBack: number = 3): Promise<Transaction[]> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORES.TRANSACTIONS], 'readonly');
      const store = transaction.objectStore(STORES.TRANSACTIONS);
      const index = store.index('user_id');
      const request = index.getAll(userId);

      request.onsuccess = () => {
        const allTransactions = request.result || [];
        
        // Filter last N months
        const cutoffDate = new Date();
        cutoffDate.setMonth(cutoffDate.getMonth() - monthsBack);
        
        const filtered = allTransactions.filter(tx => {
          const txDate = new Date(tx.date);
          return txDate >= cutoffDate;
        });

        resolve(filtered);
      };

      request.onerror = () => {
        logger.error('Failed to get transactions:', request.error);
        reject(request.error);
      };
    });
  }

  async deleteTransaction(id: string): Promise<void> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORES.TRANSACTIONS], 'readwrite');
      const store = transaction.objectStore(STORES.TRANSACTIONS);
      const request = store.delete(id);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  // Accounts
  async saveAccounts(accounts: Account[]): Promise<void> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORES.ACCOUNTS], 'readwrite');
      const store = transaction.objectStore(STORES.ACCOUNTS);

      accounts.forEach(acc => store.put(acc));

      transaction.oncomplete = () => {
        logger.info(`Saved ${accounts.length} accounts to cache`);
        resolve();
      };

      transaction.onerror = () => {
        logger.error('Failed to save accounts:', transaction.error);
        reject(transaction.error);
      };
    });
  }

  async getAccounts(userId: string): Promise<Account[]> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORES.ACCOUNTS], 'readonly');
      const store = transaction.objectStore(STORES.ACCOUNTS);
      const index = store.index('user_id');
      const request = index.getAll(userId);

      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  }

  async deleteAccount(id: string): Promise<void> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORES.ACCOUNTS], 'readwrite');
      const store = transaction.objectStore(STORES.ACCOUNTS);
      const request = store.delete(id);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  // Categories
  async saveCategories(categories: Category[]): Promise<void> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORES.CATEGORIES], 'readwrite');
      const store = transaction.objectStore(STORES.CATEGORIES);

      categories.forEach(cat => store.put(cat));

      transaction.oncomplete = () => {
        logger.info(`Saved ${categories.length} categories to cache`);
        resolve();
      };

      transaction.onerror = () => {
        logger.error('Failed to save categories:', transaction.error);
        reject(transaction.error);
      };
    });
  }

  async getCategories(userId: string): Promise<Category[]> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORES.CATEGORIES], 'readonly');
      const store = transaction.objectStore(STORES.CATEGORIES);
      const index = store.index('user_id');
      const request = index.getAll(userId);

      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  }

  async deleteCategory(id: string): Promise<void> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORES.CATEGORIES], 'readwrite');
      const store = transaction.objectStore(STORES.CATEGORIES);
      const request = store.delete(id);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  // Metadata (for sync tracking)
  async setLastSync(key: string, timestamp: number): Promise<void> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORES.METADATA], 'readwrite');
      const store = transaction.objectStore(STORES.METADATA);
      const request = store.put({ key, timestamp });

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async getLastSync(key: string): Promise<number | null> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORES.METADATA], 'readonly');
      const store = transaction.objectStore(STORES.METADATA);
      const request = store.get(key);

      request.onsuccess = () => {
        const result = request.result;
        resolve(result ? result.timestamp : null);
      };

      request.onerror = () => reject(request.error);
    });
  }

  // Clear all data (for logout or reset)
  async clearAll(): Promise<void> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const storeNames = [STORES.TRANSACTIONS, STORES.ACCOUNTS, STORES.CATEGORIES, STORES.METADATA];
      const transaction = this.db!.transaction(storeNames, 'readwrite');

      storeNames.forEach(storeName => {
        transaction.objectStore(storeName).clear();
      });

      transaction.oncomplete = () => {
        logger.info('Cleared all offline data');
        resolve();
      };

      transaction.onerror = () => {
        logger.error('Failed to clear data:', transaction.error);
        reject(transaction.error);
      };
    });
  }
}

export const offlineDatabase = new OfflineDatabase();
