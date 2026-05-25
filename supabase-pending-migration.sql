-- Execute este SQL no Supabase Dashboard do projeto Trajet (sakwdwdqsswblwqjtqth)
ALTER TABLE public.documents
  ADD COLUMN IF NOT EXISTS related_item_id text,
  ADD COLUMN IF NOT EXISTS related_item_name text;
