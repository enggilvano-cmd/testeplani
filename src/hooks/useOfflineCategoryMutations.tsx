import { useCallback } from 'react';
import { useOnlineStatus } from './useOnlineStatus';
import { offlineQueue } from '@/lib/offlineQueue';
import { useToast } from '@/hooks/use-toast';
import { logger } from '@/lib/logger';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/queryClient';
import { getErrorMessage } from '@/types/errors';

export function useOfflineCategoryMutations() {
  const isOnline = useOnlineStatus();
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const handleAddCategory = useCallback(async (categoryData: {
    name: string;
    type: 'income' | 'expense' | 'both';
    color?: string;
    chart_account_id?: string;
  }) => {
    if (isOnline) {
      // Online: usar lógica normal
      if (!user) return;
      try {
        const { error } = await supabase
          .from('categories')
          .insert({
            name: categoryData.name,
            type: categoryData.type,
            color: categoryData.color || '#6b7280',
            chart_account_id: categoryData.chart_account_id,
            user_id: user.id,
          });

        if (error) throw error;

        queryClient.invalidateQueries({ queryKey: queryKeys.categories });
        toast({
          title: 'Sucesso',
          description: 'Categoria criada com sucesso',
        });
      } catch (error: unknown) {
        logger.error('Error adding category:', error);
        toast({
          title: 'Erro',
          description: getErrorMessage(error) || 'Erro ao criar categoria',
          variant: 'destructive',
        });
        throw error;
      }
      return;
    }

    // Offline: enqueue add category operation
    try {
      await offlineQueue.enqueue({
        type: 'add_category',
        data: categoryData,
      });

      toast({
        title: 'Categoria registrada',
        description: 'Será sincronizada quando você voltar online.',
        duration: 3000,
      });

      logger.info('Category add queued for offline sync');
    } catch (error) {
      logger.error('Failed to queue category add:', error);
      toast({
        title: 'Erro',
        description: 'Não foi possível registrar a categoria offline.',
        variant: 'destructive',
      });
      throw error;
    }
  }, [isOnline, user, queryClient, toast]);

  const handleEditCategory = useCallback(async (categoryId: string, categoryData: {
    name?: string;
    type?: 'income' | 'expense' | 'both';
    color?: string;
    chart_account_id?: string;
  }) => {
    if (isOnline) {
      // Online: usar lógica normal
      if (!user) return;
      try {
        const { error } = await supabase
          .from('categories')
          .update(categoryData)
          .eq('id', categoryId)
          .eq('user_id', user.id);

        if (error) throw error;

        queryClient.invalidateQueries({ queryKey: queryKeys.categories });
        toast({
          title: 'Sucesso',
          description: 'Categoria atualizada com sucesso',
        });
      } catch (error: unknown) {
        logger.error('Error updating category:', error);
        toast({
          title: 'Erro',
          description: getErrorMessage(error) || 'Erro ao atualizar categoria',
          variant: 'destructive',
        });
        throw error;
      }
      return;
    }

    // Offline: enqueue edit category operation
    try {
      await offlineQueue.enqueue({
        type: 'edit_category',
        data: {
          category_id: categoryId,
          updates: categoryData,
        }
      });

      toast({
        title: 'Edição registrada',
        description: 'Será sincronizada quando você voltar online.',
        duration: 3000,
      });

      logger.info('Category edit queued for offline sync');
    } catch (error) {
      logger.error('Failed to queue category edit:', error);
      toast({
        title: 'Erro',
        description: 'Não foi possível registrar a edição offline.',
        variant: 'destructive',
      });
      throw error;
    }
  }, [isOnline, user, queryClient, toast]);

  const handleDeleteCategory = useCallback(async (categoryId: string) => {
    if (isOnline) {
      // Online: usar lógica normal
      if (!user) return;
      try {
        const { error } = await supabase
          .from('categories')
          .delete()
          .eq('id', categoryId)
          .eq('user_id', user.id);

        if (error) throw error;

        queryClient.invalidateQueries({ queryKey: queryKeys.categories });
        toast({
          title: 'Sucesso',
          description: 'Categoria excluída com sucesso',
        });
      } catch (error: unknown) {
        logger.error('Error deleting category:', error);
        toast({
          title: 'Erro',
          description: getErrorMessage(error) || 'Erro ao excluir categoria',
          variant: 'destructive',
        });
        throw error;
      }
      return;
    }

    // Offline: enqueue delete category operation
    try {
      await offlineQueue.enqueue({
        type: 'delete_category',
        data: {
          category_id: categoryId,
        }
      });

      toast({
        title: 'Exclusão registrada',
        description: 'Será sincronizada quando você voltar online.',
        duration: 3000,
      });

      logger.info('Category deletion queued for offline sync');
    } catch (error) {
      logger.error('Failed to queue category deletion:', error);
      toast({
        title: 'Erro',
        description: 'Não foi possível registrar a exclusão offline.',
        variant: 'destructive',
      });
      throw error;
    }
  }, [isOnline, user, queryClient, toast]);

  const handleImportCategories = useCallback(async (categoriesData: any[], categoriesToReplace: string[] = []) => {
    if (isOnline) {
      // Online: usar lógica normal
      if (!user) return;
      try {
        // Deletar categorias que serão substituídas
        if (categoriesToReplace.length > 0) {
          const { error: deleteError } = await supabase
            .from('categories')
            .delete()
            .in('id', categoriesToReplace)
            .eq('user_id', user.id);

          if (deleteError) throw deleteError;
        }

        // Inserir novas categorias
        const categoriesToAdd = categoriesData.map(cat => ({
          name: cat.name,
          type: cat.type,
          color: cat.color || '#6b7280',
          chart_account_id: cat.chart_account_id,
          user_id: user.id,
        }));

        const { error } = await supabase
          .from('categories')
          .insert(categoriesToAdd);

        if (error) throw error;

        queryClient.invalidateQueries({ queryKey: queryKeys.categories });
        toast({
          title: 'Sucesso',
          description: `${categoriesToAdd.length} categorias importadas com sucesso`,
        });
      } catch (error: unknown) {
        logger.error('Error importing categories:', error);
        toast({
          title: 'Erro',
          description: getErrorMessage(error) || 'Erro ao importar categorias',
          variant: 'destructive',
        });
        throw error;
      }
      return;
    }

    // Offline: enqueue import categories operation
    try {
      await offlineQueue.enqueue({
        type: 'import_categories',
        data: {
          categories: categoriesData,
          replace_ids: categoriesToReplace,
        }
      });

      toast({
        title: 'Importação registrada',
        description: 'Será sincronizada quando você voltar online.',
        duration: 3000,
      });

      logger.info('Categories import queued for offline sync');
    } catch (error) {
      logger.error('Failed to queue categories import:', error);
      toast({
        title: 'Erro',
        description: 'Não foi possível registrar a importação offline.',
        variant: 'destructive',
      });
      throw error;
    }
  }, [isOnline, user, queryClient, toast]);

  return {
    handleAddCategory,
    handleEditCategory,
    handleDeleteCategory,
    handleImportCategories,
  };
}
