import { useQuery } from '@tanstack/react-query';
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { logger } from "@/lib/logger";
import { queryKeys } from '@/lib/queryClient';

export interface ChartAccount {
  id: string;
  code: string;
  name: string;
  category: 'asset' | 'liability' | 'equity' | 'revenue' | 'expense' | 'contra_asset' | 'contra_liability';
  nature: 'debit' | 'credit';
  description: string | null;
  is_active: boolean;
  parent_id: string | null;
  created_at: string;
  updated_at: string;
}

export function useChartOfAccounts(categoryFilter?: 'revenue' | 'expense') {
  const { user } = useAuth();

  const query = useQuery({
    queryKey: [...queryKeys.chartOfAccounts, categoryFilter],
    queryFn: async () => {
      if (!user) return [];
      
      let queryBuilder = supabase
        .from('chart_of_accounts')
        .select('*')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .order('code', { ascending: true });

      // Filtrar por categoria se especificado
      if (categoryFilter) {
        queryBuilder = queryBuilder.eq('category', categoryFilter);
      }
        
      const { data, error } = await queryBuilder;
        
      if (error) {
        logger.error('Error loading chart of accounts:', error);
        throw error;
      }
      
      return (data || []) as ChartAccount[];
    },
    enabled: !!user,
    staleTime: 5 * 60 * 1000, // 5 minutos
    gcTime: 15 * 60 * 1000, // 15 minutos
    refetchOnMount: true,
    refetchOnWindowFocus: false,
  });

  return {
    chartAccounts: query.data || [],
    loading: query.isLoading,
    refetch: query.refetch
  };
}
