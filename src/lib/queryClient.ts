import { QueryClient } from '@tanstack/react-query';
import { performanceMonitor } from './performanceMonitor';

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
 * Performance Optimization (Issue #10):
 * - Intelligent staleTime based on data volatility
 * - Connection pooling simulation for better resource management
 * - Performance monitoring and recommendations
 * - Background memory tracking and cleanup
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Intelligent default caching - increased for better performance
      staleTime: 60 * 1000, // 1 minute default
      // Increased GC time to keep data longer in memory
      gcTime: 20 * 60 * 1000, // 20 minutes (up from 10)
      // Enhanced retry logic with exponential backoff
      retry: 3,
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
      // Performance optimizations
      refetchOnWindowFocus: false, // Disabled globally for better performance
      refetchOnMount: true, // Only if stale
      refetchOnReconnect: true,
      // Enhanced structural sharing
      structuralSharing: true,
      // Network mode optimization
      networkMode: 'online',
      // Background refetch for better UX
      refetchInterval: false, // Disable automatic background refetch by default
      // Persist data longer for offline scenarios
      persister: undefined, // Can be configured for persistence later
    },
    mutations: {
      // Retry mutations only once
      retry: 1,
      // Network mode for mutations
      networkMode: 'online',
    },
  },
});

// Start performance monitoring
if (typeof window !== 'undefined') {
  performanceMonitor.startMemoryTracking();
  
  // Log performance metrics every 5 minutes
  setInterval(() => {
    const metrics = performanceMonitor.getMetrics();
    const recommendations = performanceMonitor.getRecommendations();
    
    console.group('🚀 Performance Metrics');
    console.log('Cache Hit Ratio:', `${(metrics.cacheHitRatio * 100).toFixed(1)}%`);
    console.log('Average Query Time:', `${metrics.averageQueryTime.toFixed(2)}ms`);
    console.log('Memory Usage:', `${metrics.memoryUsage.toFixed(1)}MB`);
    console.log('Active Connections:', metrics.activeConnections);
    console.log('Slow Queries:', metrics.slowQueries);
    
    if (recommendations.length > 0) {
      console.group('💡 Recommendations:');
      recommendations.forEach(rec => console.log(`- ${rec}`));
      console.groupEnd();
    }
    console.groupEnd();
  }, 300000); // 5 minutes
}

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
