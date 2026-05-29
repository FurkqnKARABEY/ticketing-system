ALTER TABLE public.tickets
  ADD COLUMN IF NOT EXISTS product_model text,
  ADD COLUMN IF NOT EXISTS order_number text;
