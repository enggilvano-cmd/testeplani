import { QueryClient } from '@tanstack/react-query';

/**
 * Centralized React Query client configuration with intelligent caching
 * 
 * Cache Strategy:
 * - Short-lived data (30s): Transações, contas - dados que mudam com mutações
 * - Medium-lived data (2min): Dados agregados, estatísticas
 * - Long-lived data (5min): Categorias, configurações
 * - Static data (15min): Perfil, dados raramente alterados
 * 
 * GC Strategy:
 * - Keep data 5x longer than staleTime to allow background refetching
 * - Unused data is garbage collected to free memory
 * 
 * Optimization (Issue #10):
 * - Removido refetchOnMount: 'always' que causava refetches desnecessários
 * - Aumentado staleTime para evitar refetch ao navegar entre páginas
 * - Mantido refetchOnWindowFocus para sincronização quando voltar à janela
 * - Invalidações explícitas após mutações garantem dados atualizados
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Default: Cache data for 2 minutes
      staleTime: 2 * 60 * 1000,
      // Keep unused data in cache for 10 minutes (5x staleTime)
      gcTime: 10 * 60 * 1000,
      // Retry failed requests 3 times with exponential backoff
      retry: 3,
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
      // Refetch on window focus if data is stale (não se fresh)
      refetchOnWindowFocus: true,
      // Refetch on mount only if data is stale (otimização Issue #10)
      refetchOnMount: true, // true = only if stale, 'always' = sempre
      // Refetch stale data in background
      refetchOnReconnect: true,
      // Enable structural sharing for better performance
      structuralSharing: true,
      // Network mode - fail on network errors
      networkMode: 'online',
    },
    mutations: {
      // Retry mutations only once
      retry: 1,
      // Network mode for mutations
      networkMode: 'online',
    },
  },
});

/**
 * Cache time configurations for different data types
 */
export const cacheConfig = {
  // Fast-changing data (30 seconds)
  shortLived: {
    staleTime: 30 * 1000, // 30s
    gcTime: 2.5 * 60 * 1000, // 2.5 minutes (5x staleTime)
  },
  // Medium-changing data (2 minutes)
  mediumLived: {
    staleTime: 2 * 60 * 1000, // 2 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes (5x staleTime)
  },
  // Slow-changing data (5 minutes)
  longLived: {
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 25 * 60 * 1000, // 25 minutes (5x staleTime)
  },
  // Static data (15 minutes)
  static: {
    staleTime: 15 * 60 * 1000, // 15 minutes
    gcTime: 60 * 60 * 1000, // 1 hour (4x staleTime)
  },
} as const;

/**
 * Query keys for consistent cache management
 */
export const queryKeys = {
  accounts: ['accounts'] as const,
  account: (id: string) => ['accounts', id] as const,
  // Base key SEM filtros para facilitar invalidation
  transactionsBase: ['transactions'] as const,
  transactions: (filters?: Record<string, unknown>) => 
    ['transactions', filters] as const,
  transaction: (id: string) => ['transactions', id] as const,
  categories: ['categories'] as const,
  category: (id: string) => ['categories', id] as const,
  profile: ['profile'] as const,
  settings: ['settings'] as const,
  notifications: ['notifications'] as const,
  chartOfAccounts: ['chartOfAccounts'] as const,
  periodClosures: ['periodClosures'] as const,
  creditBills: (accountId?: string) => 
    ['creditBills', accountId] as const,
} as const;

/**
 * Helper para refetch com delay de 10ms para atualização imediata
 * Centraliza lógica duplicada em 9 locais do código
 */
export function refetchWithDelay(
  client: QueryClient,
  queryKeys: ReadonlyArray<readonly unknown[]>
): void {
  setTimeout(() => {
    queryKeys.forEach(key => {
      client.refetchQueries({ queryKey: key as unknown[] });
    });
  }, 10);
}
