-- Achado durante a desativação de Conversas (fase 2, 2026-09-22): o cron
-- "reprocess-conversations-auto" chamava a function reprocess-conversations
-- a cada 5 min, o dia todo (7h-22h), independente do webhook de monitoramento
-- estar ativo. Como o webhook (digisac-webhook) não grava mais conversas,
-- esse cron continuaria rodando à toa. Desativa a recorrência; a function
-- em si também foi atualizada para responder de forma neutra (defesa
-- adicional), e não é apagada.
select cron.unschedule('reprocess-conversations-auto');
