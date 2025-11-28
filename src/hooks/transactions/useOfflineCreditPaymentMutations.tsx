import { useCallback } from 'react';
import { useCreditPaymentMutations } from './useCreditPaymentMutations';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import { offlineQueue } from '@/lib/offlineQueue';
import { useToast } from '@/hooks/use-toast';
import { logger } from '@/lib/logger';
import { Transaction, Account } from '@/types';

export function useOfflineCreditPaymentMutations() {
  const isOnline = useOnlineStatus();
  const onlineMutations = useCreditPaymentMutations();
  const { toast } = useToast();

  const handleCreditPayment = useCallback(async ({
    creditCardAccountId,
    debitAccountId,
    amount,
    paymentDate,
  }: {
    creditCardAccountId: string;
    debitAccountId: string;
    amount: number;
    paymentDate: string;
  }): Promise<{ creditAccount: Account; bankAccount: Account }> => {
    if (isOnline) {
      return onlineMutations.handleCreditPayment({
        creditCardAccountId,
        debitAccountId,
        amount,
        paymentDate,
      });
    }

    // Offline: enqueue credit payment operation
    try {
      await offlineQueue.enqueue({
        type: 'credit_payment',
        data: {
          credit_account_id: creditCardAccountId,
          debit_account_id: debitAccountId,
          amount: Math.abs(amount),
          payment_date: paymentDate,
        }
      });

      toast({
        title: 'Pagamento registrado',
        description: 'Será sincronizado quando você voltar online.',
        duration: 3000,
      });

      logger.info('Credit payment queued for offline sync');
      
      // Return dummy data for offline mode
      throw new Error('Operação offline - aguardando sincronização');
    } catch (error) {
      logger.error('Failed to queue credit payment:', error);
      toast({
        title: 'Erro',
        description: 'Não foi possível registrar o pagamento offline.',
        variant: 'destructive',
      });
      throw error;
    }
  }, [isOnline, onlineMutations, toast]);

  const handleReversePayment = useCallback(async (paymentsToReverse: Transaction[]) => {
    if (isOnline) {
      return onlineMutations.handleReversePayment(paymentsToReverse);
    }

    // Offline: enqueue reverse payment operations
    try {
      await Promise.all(
        paymentsToReverse.map(payment =>
          offlineQueue.enqueue({
            type: 'delete',
            data: {
              transaction_id: payment.id,
              scope: 'current',
            }
          })
        )
      );

      toast({
        title: 'Estorno registrado',
        description: 'Será sincronizado quando você voltar online.',
        duration: 3000,
      });

      logger.info('Reverse payment queued for offline sync');
    } catch (error) {
      logger.error('Failed to queue reverse payment:', error);
      toast({
        title: 'Erro',
        description: 'Não foi possível registrar o estorno offline.',
        variant: 'destructive',
      });
      throw error;
    }
  }, [isOnline, onlineMutations, toast]);

  return {
    handleCreditPayment,
    handleReversePayment,
  };
}
