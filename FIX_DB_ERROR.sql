-- Execute este comando no SQL Editor do seu Dashboard Supabase
-- Isso vai permitir que o banco de dados aceite o novo tipo de conta "meal_voucher"

ALTER TYPE account_type ADD VALUE IF NOT EXISTS 'meal_voucher';
