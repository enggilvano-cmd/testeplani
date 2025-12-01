import { logger } from './logger';
import { offlineDatabase } from './offlineDatabase';

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
    | 'import_accounts'
    | 'clear_all_data';
  data: any;
  timestamp: number;
  retries: number;
  status?: 'pending' | 'processing' | 'failed';
  lastError?: string;
}

const STORE_NAME = 'operations-queue';

class OfflineQueueManager {
  
  async enqueue(operation: Omit<QueuedOperation, 'id' | 'timestamp' | 'retries'>): Promise<void> {
    const db = await offlineDatabase.getDB();

    const queuedOp: QueuedOperation = {
      ...operation,
      id: `${operation.type}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: Date.now(),
      retries: 0,
    };

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readwrite');
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
    const db = await offlineDatabase.getDB();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readwrite');
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
    const db = await offlineDatabase.getDB();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readonly');
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
    const db = await offlineDatabase.getDB();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readwrite');
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

  async updateData(id: string, data: any): Promise<void> {
    const db = await offlineDatabase.getDB();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const getRequest = store.get(id);

      getRequest.onsuccess = () => {
        const operation = getRequest.result;
        if (operation) {
          operation.data = data;
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

  async markAsFailed(id: string, error: string): Promise<void> {
    const db = await offlineDatabase.getDB();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const getRequest = store.get(id);

      getRequest.onsuccess = () => {
        const operation = getRequest.result;
        if (operation) {
          operation.status = 'failed';
          operation.lastError = error;
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
    const db = await offlineDatabase.getDB();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readwrite');
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
