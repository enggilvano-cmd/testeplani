import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { rateLimiters } from '../_shared/rate-limiter.ts';
import { TransactionInputSchema, validateWithZod, validationErrorResponse } from '../_shared/validation.ts';
import { withRetry } from '../_shared/retry.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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
      console.error('[atomic-transaction] ERROR: Auth failed:', userError);
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Rate limiting - Moderado para criação de transações
    const rateLimitResponse = await rateLimiters.moderate.middleware(req, user.id);
    if (rateLimitResponse) {
      console.warn('[atomic-transaction] WARN: Rate limit exceeded for user:', user.id);
      return rateLimitResponse;
    }

    const body = await req.json();

    console.log('[atomic-transaction] INFO: Creating transaction for user:', user.id);

    // Validação Zod
    const validation = validateWithZod(TransactionInputSchema, body.transaction);
    if (!validation.success) {
      console.error('[atomic-transaction] ERROR: Validation failed:', validation.errors);
      return validationErrorResponse(validation.errors, corsHeaders);
    }

    const transaction = validation.data;

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
      console.error('[atomic-transaction] ERROR: Function failed:', functionError);
      throw functionError;
    }

    const record = result[0];
    
    if (!record.success) {
      console.error('[atomic-transaction] ERROR:', record.error_message);
      return new Response(
        JSON.stringify({ 
          error: record.error_message,
          success: false 
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('[atomic-transaction] INFO: Transaction created successfully:', record.transaction_id);

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
    console.error('[atomic-transaction] ERROR:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error occurred' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});