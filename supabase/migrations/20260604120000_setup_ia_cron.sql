-- Enable pg_cron extension for scheduling tasks
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Create a queue table for pending conversation processing
CREATE TABLE IF NOT EXISTS public.ia_processing_queue (
  id BIGSERIAL PRIMARY KEY,
  conversation_id UUID NOT NULL UNIQUE REFERENCES public.crm_conversations(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  attempted_count INT DEFAULT 0,
  last_attempted_at TIMESTAMP WITH TIME ZONE,
  status TEXT DEFAULT 'pending'
);

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_ia_queue_status ON public.ia_processing_queue(status);
CREATE INDEX IF NOT EXISTS idx_ia_queue_created ON public.ia_processing_queue(created_at);

-- Create trigger to automatically add new conversations to processing queue
CREATE OR REPLACE FUNCTION public.queue_conversation_for_processing()
RETURNS TRIGGER AS $$
BEGIN
  -- Only queue if status_ia is not already set and texto exists
  IF (NEW.status_ia IS NULL OR NEW.status_ia = '') AND NEW.texto IS NOT NULL THEN
    INSERT INTO public.ia_processing_queue (conversation_id, status)
    VALUES (NEW.id, 'pending')
    ON CONFLICT (conversation_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop existing trigger if it exists
DROP TRIGGER IF EXISTS conversation_queue_trigger ON public.crm_conversations;

-- Create the trigger for new conversations
CREATE TRIGGER conversation_queue_trigger
AFTER INSERT ON public.crm_conversations
FOR EACH ROW
EXECUTE FUNCTION public.queue_conversation_for_processing();

-- Optional: Schedule a periodic job to clean up old queue entries (optional for optimization)
-- This can be enabled later if needed
-- SELECT cron.schedule(
--   'cleanup-ia-queue-old-entries',
--   '0 0 * * *',  -- Run daily at midnight
--   'DELETE FROM public.ia_processing_queue WHERE created_at < NOW() - INTERVAL ''7 days'' AND status = ''completed'''
-- );
