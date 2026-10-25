
BEGIN;

CREATE TABLE IF NOT EXISTS public.booking_payment_reconciliation (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES public.bookings(id) ON DELETE RESTRICT,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  provider_order_id text NOT NULL,
  provider_payment_id text NOT NULL,
  amount numeric(10,2) NOT NULL CHECK (amount > 0),
  reason text NOT NULL,
  status text NOT NULL DEFAULT 'REVIEW_REQUIRED'
    CHECK (status IN ('REVIEW_REQUIRED', 'RESOLVED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT booking_payment_reconciliation_payment_unique
    UNIQUE (booking_id, provider_payment_id),
  CONSTRAINT booking_payment_reconciliation_order_format
    CHECK (provider_order_id ~ '^order_[A-Za-z0-9]+$'),
  CONSTRAINT booking_payment_reconciliation_payment_format
    CHECK (provider_payment_id ~ '^pay_[A-Za-z0-9]+$')
);

CREATE INDEX IF NOT EXISTS booking_payment_reconciliation_review_idx
  ON public.booking_payment_reconciliation(status, created_at DESC);

ALTER TABLE public.booking_payment_reconciliation ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.booking_payment_reconciliation
  FROM PUBLIC, anon, authenticated;

GRANT SELECT, INSERT, UPDATE
  ON public.booking_payment_reconciliation TO service_role;

CREATE OR REPLACE FUNCTION public.record_booking_payment_reconciliation(
  p_booking_id uuid,
  p_user_id uuid,
  p_provider_order_id text,
  p_provider_payment_id text,
  p_amount numeric,
  p_reason text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  IF p_booking_id IS NULL
     OR p_user_id IS NULL
     OR p_provider_order_id !~ '^order_[A-Za-z0-9]+$'
     OR p_provider_payment_id !~ '^pay_[A-Za-z0-9]+$'
     OR p_amount IS NULL OR p_amount <= 0
     OR p_reason IS NULL OR length(trim(p_reason)) = 0 THEN
    RAISE EXCEPTION 'Invalid reconciliation details';
  END IF;

  INSERT INTO public.booking_payment_reconciliation (
    booking_id, user_id, provider_order_id,
    provider_payment_id, amount, reason
  )
  VALUES (
    p_booking_id, p_user_id, p_provider_order_id,
    p_provider_payment_id, p_amount, left(p_reason, 500)
  )
  ON CONFLICT (booking_id, provider_payment_id) DO NOTHING;
END;
$function$;

REVOKE ALL ON FUNCTION public.record_booking_payment_reconciliation(
  uuid, uuid, text, text, numeric, text
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.record_booking_payment_reconciliation(
  uuid, uuid, text, text, numeric, text
) TO service_role;

COMMIT;
