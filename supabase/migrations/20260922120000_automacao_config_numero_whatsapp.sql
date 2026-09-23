-- Adiciona campo de exibição do número de WhatsApp usado pela automação de
-- envio (Lumar). O valor não vem de nenhuma API do Digisac — é só texto
-- informativo, preenchido manualmente por um Administrador na tela de
-- Automações, para os colaboradores saberem qual número está em uso.
alter table public.automacao_config
  add column if not exists numero_whatsapp text;

-- Limpeza: o widget "Alertas de Conversas" foi removido do dashboard
-- (fase 2 da desativação de módulos). Remove a fixação (se existir) para
-- não deixar uma linha órfã apontando pra um widget que não é mais
-- renderizado.
delete from public.dashboard_fixed_widgets where widget_id = 'conversas_alertas';
