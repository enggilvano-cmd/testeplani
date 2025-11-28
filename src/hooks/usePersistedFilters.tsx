import { useState, useEffect, useCallback } from 'react';
import { safeStorage } from '@/lib/safeStorage';

/**
 * Hook genérico para persistir filtros no localStorage
 * @param storageKey - Chave única para armazenar os filtros (ex: 'dashboard-filters', 'transactions-filters')
 * @param initialState - Estado inicial dos filtros
 * @returns [state, setState] - Estado persistido e função para atualizá-lo
 */
export function usePersistedFilters<T>(
  storageKey: string,
  initialState: T
): [T, (newState: T | ((prev: T) => T)) => void] {
  const [state, setStateInternal] = useState<T>(() => {
    // Tentar recuperar do localStorage na inicialização
    const stored = safeStorage.getJSON<T>(storageKey);
    return stored !== null ? stored : initialState;
  });

  const setState = useCallback((newState: T | ((prev: T) => T)) => {
    setStateInternal((prevState) => {
      const nextState = typeof newState === 'function' 
        ? (newState as (prev: T) => T)(prevState)
        : newState;
      
      // Persistir no localStorage
      safeStorage.setJSON(storageKey, nextState);
      
      return nextState;
    });
  }, [storageKey]);

  // Sincronizar mudanças entre abas
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === storageKey && e.newValue) {
        try {
          const newState = JSON.parse(e.newValue) as T;
          setStateInternal(newState);
        } catch (error) {
          console.error('Error parsing storage event:', error);
        }
      }
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, [storageKey]);

  return [state, setState];
}
