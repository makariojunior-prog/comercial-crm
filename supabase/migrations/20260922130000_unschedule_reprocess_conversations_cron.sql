-- Achado durante a desativação de Conversas (fase 2, 2026-09-22): o cron
-- "reprocess-conversations-auto" chamava a function reprocess-conversations
-- a cada 5 min, o dia todo (7h-22h), independente do webhook de monitoramento
-- estar ativo. Como o webhook (digisac-webhook) não grava mais conversas,
-- esse cron continuaria rodando à toa. Desativa a recorrência; a function
-- em si também foi atualizada para responder de forma neutra (defesa
-- adicional), e não é apagada.
--
-- cron.unschedule() lança erro se o job não existir — esse job foi criado
-- fora de uma migration rastreada, então um banco novo (restauração, ambiente
-- de staging, etc.) nunca teria esse job agendado. Checa a existência antes
-- de desagendar, pra esta migration rodar sem erro em qualquer ambiente.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'reprocess-conversations-auto') then
    perform cron.unschedule('reprocess-conversations-auto');
  end if;
end $$;
