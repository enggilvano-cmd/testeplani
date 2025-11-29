import { logger } from './logger';
import type { Transaction, Account, Category } from '@/types';

const DB_NAME = 'planiflow-offline';
// MUDANÇA CRÍTICA: Incrementado para 3 para forçar atualização da estrutura no navegador do usuário
const DB_VERSION = 3;

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
    if (this.db) return;

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => {
        logger.error('Failed to open IndexedDB:', request.error);
        reject(request.error);
      };

      request.onsuccess = () => {
        this.db = request.result;
        logger.info(`IndexedDB (v${DB_VERSION}) initialized successfully`);
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        logger.info(`Upgrading Database to version ${DB_VERSION}...`);

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

  // === MÉTODOS DE SINCRONIZAÇÃO INTELIGENTE ===

  async syncTransactions(transactions: Transaction[], userId: string, dateFrom: string): Promise<void> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORES.TRANSACTIONS], 'readwrite');
      const store = transaction.objectStore(STORES.TRANSACTIONS);
      const index = store.index('user_id');

      const request = index.getAll(userId);

      request.onsuccess = () => {
        const localTxs = request.result as Transaction[];
        const serverIds = new Set(transactions.map(t => t.id));
        const cutoffTime = new Date(dateFrom).getTime();

        const toDelete = localTxs.filter(tx => {
           const txDate = new Date(tx.date).getTime();
           const isInSyncWindow = txDate >= cutoffTime;
           const isOfficialId = !tx.id.startsWith('temp-'); 
           // PROTEÇÃO: Não deletar transações fixas durante o sync de transações normais
           // Transações fixas são sincronizadas separadamente ou devem ser preservadas
           const isFixed = tx.is_fixed === true;
           return isInSyncWindow && isOfficialId && !serverIds.has(tx.id) && !isFixed;
        });

        toDelete.forEach(tx => store.delete(tx.id));
        transactions.forEach(tx => store.put(tx));
      };

      transaction.oncomplete = () => {
        logger.info(`Sync transactions: Updated ${transactions.length}, cleaned obsoletes.`);
        resolve();
      };
      transaction.onerror = () => reject(transaction.error);
    });
  }

  async syncFixedTransactions(transactions: Transaction[], userId: string): Promise<void> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORES.TRANSACTIONS], 'readwrite');
      const store = transaction.objectStore(STORES.TRANSACTIONS);
      const index = store.index('user_id');

      const request = index.getAll(userId);

      request.onsuccess = () => {
        const localTxs = request.result as Transaction[];
        const serverIds = new Set(transactions.map(t => t.id));

        // Identificar transações fixas locais que não estão mais no servidor
        const toDelete = localTxs.filter(tx => {
           const isFixed = tx.is_fixed === true;
           const isParent = tx.parent_transaction_id === null || tx.parent_transaction_id === undefined;
           const isOfficialId = !tx.id.startsWith('temp-');
           
           // Deletar se for fixa, pai, oficial e não estiver na lista do servidor
           return isFixed && isParent && isOfficialId && !serverIds.has(tx.id);
        });

        toDelete.forEach(tx => store.delete(tx.id));
        transactions.forEach(tx => store.put(tx));
      };

      transaction.oncomplete = () => {
        logger.info(`Sync fixed transactions: Updated ${transactions.length}, cleaned obsoletes.`);
        resolve();
      };
      transaction.onerror = () => reject(transaction.error);
    });
  }

  async syncAccounts(accounts: Account[], userId: string): Promise<void> {
    if (!this.db) await this.init();
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction([STORES.ACCOUNTS], 'readwrite');
      const store = tx.objectStore(STORES.ACCOUNTS);
      const index = store.index('user_id');
      const req = index.openCursor(IDBKeyRange.only(userId));
      
      req.onsuccess = (e) => {
        const cursor = (e.target as IDBRequest).result;
        if (cursor) {
          if (!cursor.value.id.startsWith('temp-')) cursor.delete();
          cursor.continue();
        } else {
          accounts.forEach(acc => store.put(acc));
        }
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async syncCategories(categories: Category[], userId: string): Promise<void> {
    if (!this.db) await this.init();
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction([STORES.CATEGORIES], 'readwrite');
      const store = tx.objectStore(STORES.CATEGORIES);
      const index = store.index('user_id');
      const req = index.openCursor(IDBKeyRange.only(userId));
      
      req.onsuccess = (e) => {
        const cursor = (e.target as IDBRequest).result;
        if (cursor) {
          if (!cursor.value.id.startsWith('temp-')) cursor.delete();
          cursor.continue();
        } else {
          categories.forEach(cat => store.put(cat));
        }
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  // === MÉTODOS CRUD ===

  async saveTransactions(transactions: Transaction[]): Promise<void> {
    if (!this.db) await this.init();
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction([STORES.TRANSACTIONS], 'readwrite');
      const store = tx.objectStore(STORES.TRANSACTIONS);
      transactions.forEach(txData => store.put(txData));
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async getFixedTransactions(userId: string): Promise<Transaction[]> {
    if (!this.db) await this.init();
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction([STORES.TRANSACTIONS], 'readonly');
      const store = tx.objectStore(STORES.TRANSACTIONS);
      const index = store.index('user_id');
      const request = index.getAll(userId);

      request.onsuccess = () => {
        const allTransactions = request.result || [];
        // Filtrar apenas transações fixas (is_fixed = true e parent_transaction_id = null)
        const fixedTransactions = allTransactions.filter(txData => 
          txData.is_fixed === true && 
          (txData.parent_transaction_id === null || txData.parent_transaction_id === undefined)
        );

        fixedTransactions.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        resolve(fixedTransactions);
      };
      request.onerror = () => reject(request.error);
    });
  }

  async getTransactions(userId: string, monthsBack: number = 3): Promise<Transaction[]> {
    if (!this.db) await this.init();
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction([STORES.TRANSACTIONS], 'readonly');
      const store = tx.objectStore(STORES.TRANSACTIONS);
      const index = store.index('user_id');
      const request = index.getAll(userId);

      request.onsuccess = () => {
        const allTransactions = request.result || [];
        const cutoffDate = new Date();
        cutoffDate.setMonth(cutoffDate.getMonth() - monthsBack);
        
        const filtered = allTransactions.filter(txData => {
          const txDate = new Date(txData.date);
          return txDate >= cutoffDate;
        });

        filtered.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        resolve(filtered);
      };
      request.onerror = () => reject(request.error);
    });
  }

  async deleteTransaction(id: string): Promise<void> {
    if (!this.db) await this.init();
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction([STORES.TRANSACTIONS], 'readwrite');
      const store = tx.objectStore(STORES.TRANSACTIONS);
      store.delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async saveAccounts(accounts: Account[]): Promise<void> {
    if (!this.db) await this.init();
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction([STORES.ACCOUNTS], 'readwrite');
      const store = tx.objectStore(STORES.ACCOUNTS);
      accounts.forEach(acc => store.put(acc));
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async getAccounts(userId: string): Promise<Account[]> {
    if (!this.db) await this.init();
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction([STORES.ACCOUNTS], 'readonly');
      const store = tx.objectStore(STORES.ACCOUNTS);
      const index = store.index('user_id');
      const request = index.getAll(userId);
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  }

  async saveCategories(categories: Category[]): Promise<void> {
    if (!this.db) await this.init();
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction([STORES.CATEGORIES], 'readwrite');
      const store = tx.objectStore(STORES.CATEGORIES);
      categories.forEach(cat => store.put(cat));
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async getCategories(userId: string): Promise<Category[]> {
    if (!this.db) await this.init();
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction([STORES.CATEGORIES], 'readonly');
      const store = tx.objectStore(STORES.CATEGORIES);
      const index = store.index('user_id');
      const request = index.getAll(userId);
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  }

  async getTransaction(id: string): Promise<Transaction | undefined> {
    if (!this.db) await this.init();
    return new Promise((resolve) => {
       const tx = this.db!.transaction([STORES.TRANSACTIONS], 'readonly');
       const req = tx.objectStore(STORES.TRANSACTIONS).get(id);
       req.onsuccess = () => resolve(req.result);
       req.onerror = () => resolve(undefined);
    });
  }

  async setLastSync(key: string, timestamp: number): Promise<void> {
    if (!this.db) await this.init();
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction([STORES.METADATA], 'readwrite');
      const store = tx.objectStore(STORES.METADATA);
      store.put({ key, timestamp });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async clearAll(): Promise<void> {
    if (!this.db) await this.init();
    return new Promise((resolve, reject) => {
      const storeNames = [STORES.TRANSACTIONS, STORES.ACCOUNTS, STORES.CATEGORIES, STORES.METADATA];
      const tx = this.db!.transaction(storeNames, 'readwrite');
      storeNames.forEach(name => tx.objectStore(name).clear());
      tx.oncomplete = () => {
        logger.info('Cleared all offline data');
        resolve();
      };
      tx.onerror = () => reject(tx.error);
    });
  }
}

export const offlineDatabase = new OfflineDatabase();