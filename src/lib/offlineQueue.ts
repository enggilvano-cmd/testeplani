import { logger } from './logger';

export interface QueuedOperation {
  id: string;
  type: 
    | 'transaction' 
    | 'edit' 
    | 'delete' 
    | 'transfer' 
    | 'credit_payment' 
    | 'logout'
    | 'add_fixed_transaction'
    | 'add_installments'
    | 'import_transactions'
    | 'add_category'
    | 'edit_category'
    | 'delete_category'
    | 'import_categories'
    | 'add_account'
    | 'edit_account'
    | 'delete_account'
    | 'import_accounts';
  data: any;
  timestamp: number;
  retries: number;
}

const DB_NAME = 'planiflow-offline';
const STORE_NAME = 'operations-queue';
const DB_VERSION = 2; // Must match offlineDatabase.ts version

class OfflineQueueManager {
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
        
        // Only create if doesn't exist (could exist from offlineDatabase.ts)
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
          store.createIndex('timestamp', 'timestamp', { unique: false });
          store.createIndex('type', 'type', { unique: false });
          logger.info('Operations queue store created');
        }
      };
    });
  }

  async enqueue(operation: Omit<QueuedOperation, 'id' | 'timestamp' | 'retries'>): Promise<void> {
    if (!this.db) await this.init();

    const queuedOp: QueuedOperation = {
      ...operation,
      id: `${operation.type}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: Date.now(),
      retries: 0,
    };

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.add(queuedOp);

      request.onsuccess = () => {
        logger.info('Operation queued for offline sync:', queuedOp.type);
        resolve();
      };

      request.onerror = () => {
        logger.error('Failed to queue operation:', request.error);
        reject(request.error);
      };
    });
  }

  async dequeue(id: string): Promise<void> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.delete(id);

      request.onsuccess = () => {
        logger.info('Operation removed from queue:', id);
        resolve();
      };

      request.onerror = () => {
        logger.error('Failed to dequeue operation:', request.error);
        reject(request.error);
      };
    });
  }

  async getAll(): Promise<QueuedOperation[]> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.getAll();

      request.onsuccess = () => {
        resolve(request.result || []);
      };

      request.onerror = () => {
        logger.error('Failed to get queued operations:', request.error);
        reject(request.error);
      };
    });
  }

  async updateRetries(id: string, retries: number): Promise<void> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const getRequest = store.get(id);

      getRequest.onsuccess = () => {
        const operation = getRequest.result;
        if (operation) {
          operation.retries = retries;
          const putRequest = store.put(operation);
          
          putRequest.onsuccess = () => resolve();
          putRequest.onerror = () => reject(putRequest.error);
        } else {
          resolve();
        }
      };

      getRequest.onerror = () => reject(getRequest.error);
    });
  }

  async clear(): Promise<void> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.clear();

      request.onsuccess = () => {
        logger.info('Offline queue cleared');
        resolve();
      };

      request.onerror = () => {
        logger.error('Failed to clear queue:', request.error);
        reject(request.error);
      };
    });
  }
}

export const offlineQueue = new OfflineQueueManager();
