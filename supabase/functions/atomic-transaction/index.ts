import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { rateLimiters } from '../_shared/rate-limiter.ts';
import { TransactionInputSchema, validateWithZod, validationErrorResponse } from '../_shared/validation.ts';
import { withRetry } from '../_shared/retry.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * Structured logging para edge functions
 * Em produção, isso seria enviado para um serviço de logging centralizado (Sentry, DataDog, etc)
 */
function logEvent(level: 'info' | 'warn' | 'error', message: string, context?: Record<string, any>) {
  const timestamp = new Date().toISOString();
  const logEntry = {
    timestamp,
    level,
    function: 'atomic-transaction',
    message,
    context: context || {}
  };
  // Em desenvolvimento, logar no console
  if (Deno.env.get('ENVIRONMENT') === 'development') {
    console[level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'log'](JSON.stringify(logEntry));
  }
  // Em produção, isso seria enviado para Sentry ou outro serviço
  return logEntry;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: req.headers.get('Authorization')! },
        },
      }
    );

    // Verificar autenticação
    const {
      data: { user },
      error: userError,
    } = await supabaseClient.auth.getUser();

    if (userError || !user) {
      logEvent('error', 'Auth failed', { userError });
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Rate limiting - Moderado para criação de transações
    const rateLimitResponse = await rateLimiters.moderate.middleware(req, user.id);
    if (rateLimitResponse) {
      logEvent('warn', 'Rate limit exceeded', { userId: user.id });
      return rateLimitResponse;
    }

    const body = await req.json();

    // Validação Zod
    const validation = validateWithZod(TransactionInputSchema, body.transaction);
    if (!validation.success) {
      logEvent('error', 'Validation failed', { errors: validation.errors });
      return validationErrorResponse(validation.errors, corsHeaders);
    }

    const transaction = validation.data;

    // Verificar se usuário tem plano de contas inicializado
    const { data: chartAccounts } = await supabaseClient
      .from('chart_of_accounts')
      .select('id')
      .eq('user_id', user.id)
      .limit(1);

    // Se não tem plano de contas, inicializar
    if (!chartAccounts || chartAccounts.length === 0) {
      logEvent('info', 'Initializing chart of accounts for user', { userId: user.id });
      await supabaseClient.rpc('initialize_chart_of_accounts', {
        p_user_id: user.id
      });
    }

    // Usar função PL/pgSQL atômica com retry
    const { data: result, error: functionError } = await withRetry(
      () => supabaseClient.rpc('atomic_create_transaction', {
        p_user_id: user.id,
        p_description: transaction.description,
        p_amount: transaction.amount,
        p_date: transaction.date,
        p_type: transaction.type,
        p_category_id: transaction.category_id,
        p_account_id: transaction.account_id,
        p_status: transaction.status,
        p_invoice_month: transaction.invoice_month || null,
        p_invoice_month_overridden: transaction.invoice_month_overridden || false,
      })
    );

    if (functionError) {
      logEvent('error', 'Function call failed', { functionError });
      throw functionError;
    }

    const record = result[0];
    
    if (!record.success) {
      logEvent('error', 'Transaction creation failed', { errorMessage: record.error_message });
      return new Response(
        JSON.stringify({ 
          error: record.error_message,
          success: false 
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    logEvent('info', 'Transaction created successfully', { transactionId: record.transaction_id, userId: user.id });

    return new Response(
      JSON.stringify({
        transaction: {
          id: record.transaction_id,
          ...transaction
        },
        balance: record.new_balance,
        success: true,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    logEvent('error', 'Unhandled exception', { error: error instanceof Error ? error.message : String(error) });
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error occurred' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});