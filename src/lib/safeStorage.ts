import { logger } from './logger';

/**
 * SafeStorage - Wrapper robusto para localStorage com error handling
 * 
 * Trata automaticamente:
 * - QuotaExceededError (storage cheio)
 * - JSON.parse errors (dados corrompidos)
 * - localStorage indisponível (private browsing, etc.)
 * - Fallback para memória quando necessário
 */

// Fallback em memória quando localStorage não disponível
const memoryStorage = new Map<string, string>();

/**
 * Verifica se localStorage está disponível
 */
function isLocalStorageAvailable(): boolean {
  try {
    const testKey = '__storage_test__';
    localStorage.setItem(testKey, 'test');
    localStorage.removeItem(testKey);
    return true;
  } catch (e) {
    return false;
  }
}

const storageAvailable = isLocalStorageAvailable();

if (!storageAvailable) {
  logger.warn('localStorage não disponível, usando fallback em memória');
}

/**
 * SafeStorage API
 */
export const safeStorage = {
  /**
   * Obtém um item do storage
   * Retorna null se o item não existir ou houver erro
   */
  getItem(key: string): string | null {
    try {
      if (storageAvailable) {
        return localStorage.getItem(key);
      }
      return memoryStorage.get(key) || null;
    } catch (error) {
      logger.error(`SafeStorage.getItem error for key "${key}":`, error);
      return null;
    }
  },

  /**
   * Define um item no storage
   * Retorna true se sucesso, false se erro
   */
  setItem(key: string, value: string): boolean {
    try {
      if (storageAvailable) {
        localStorage.setItem(key, value);
      } else {
        memoryStorage.set(key, value);
      }
      return true;
    } catch (error) {
      // QuotaExceededError - storage cheio
      if (error instanceof DOMException && error.name === 'QuotaExceededError') {
        logger.error(`SafeStorage.setItem QuotaExceededError for key "${key}". Tentando limpar cache antigo...`);
        
        // Tentar limpar itens antigos do cache
        this.clearOldCacheItems();
        
        // Tentar novamente
        try {
          if (storageAvailable) {
            localStorage.setItem(key, value);
          } else {
            memoryStorage.set(key, value);
          }
          return true;
        } catch (retryError) {
          logger.error(`SafeStorage.setItem falhou após limpar cache:`, retryError);
          return false;
        }
      }
      
      logger.error(`SafeStorage.setItem error for key "${key}":`, error);
      return false;
    }
  },

  /**
   * Remove um item do storage
   */
  removeItem(key: string): void {
    try {
      if (storageAvailable) {
        localStorage.removeItem(key);
      } else {
        memoryStorage.delete(key);
      }
    } catch (error) {
      logger.error(`SafeStorage.removeItem error for key "${key}":`, error);
    }
  },

  /**
   * Limpa todo o storage
   */
  clear(): void {
    try {
      if (storageAvailable) {
        localStorage.clear();
      } else {
        memoryStorage.clear();
      }
    } catch (error) {
      logger.error('SafeStorage.clear error:', error);
    }
  },

  /**
   * Obtém um item JSON do storage
   * Retorna null se o item não existir, for inválido ou houver erro
   */
  getJSON<T>(key: string): T | null {
    try {
      const item = this.getItem(key);
      if (!item) return null;
      
      return JSON.parse(item) as T;
    } catch (error) {
      logger.error(`SafeStorage.getJSON parse error for key "${key}":`, error);
      // Remover item corrompido
      this.removeItem(key);
      return null;
    }
  },

  /**
   * Define um item JSON no storage
   * Retorna true se sucesso, false se erro
   */
  setJSON<T>(key: string, value: T): boolean {
    try {
      const serialized = JSON.stringify(value);
      return this.setItem(key, serialized);
    } catch (error) {
      logger.error(`SafeStorage.setJSON stringify error for key "${key}":`, error);
      return false;
    }
  },

  /**
   * Limpa itens antigos do cache (heurística: items com "cache" no nome)
   * Usado quando QuotaExceededError ocorre
   */
  clearOldCacheItems(): void {
    try {
      if (!storageAvailable) return;

      const keysToRemove: string[] = [];
      
      // Identificar itens de cache
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && (
          key.includes('cache') || 
          key.includes('query-') ||
          key.includes('temp-')
        )) {
          keysToRemove.push(key);
        }
      }

      // Remover até 50% dos itens de cache
      const itemsToRemove = Math.ceil(keysToRemove.length * 0.5);
      for (let i = 0; i < itemsToRemove; i++) {
        this.removeItem(keysToRemove[i]);
      }

      logger.info(`SafeStorage: Limpou ${itemsToRemove} itens de cache antigos`);
    } catch (error) {
      logger.error('SafeStorage.clearOldCacheItems error:', error);
    }
  },

  /**
   * Verifica se o storage está disponível
   */
  isAvailable(): boolean {
    return storageAvailable;
  },

  /**
   * Obtém o tamanho aproximado do storage em uso (bytes)
   */
  getUsedSpace(): number {
    try {
      if (!storageAvailable) {
        // Calcular tamanho do memoryStorage
        let size = 0;
        memoryStorage.forEach((value, key) => {
          size += key.length + value.length;
        });
        return size;
      }

      let size = 0;
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key) {
          const value = localStorage.getItem(key);
          size += key.length + (value?.length || 0);
        }
      }
      return size;
    } catch (error) {
      logger.error('SafeStorage.getUsedSpace error:', error);
      return 0;
    }
  },

  /**
   * Verifica se está próximo do limite (> 80% do típico 5-10MB)
   */
  isNearCapacity(): boolean {
    const used = this.getUsedSpace();
    const typical5MB = 5 * 1024 * 1024;
    return used > typical5MB * 0.8;
  },
};

// Exportar como default também
export default safeStorage;
