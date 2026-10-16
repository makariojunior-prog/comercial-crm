-- Logística › Custos passa a LER o gasto de veículo do app Financeiro (que é onde ele é lançado).
-- Até a data de corte (fin_frota_config.corte) a tela segue lendo o histórico de frota_custos; da data
-- em diante, esta função devolve o que o Financeiro tem ligado a um veículo (lançamento, linha de pagamento dividido ou pagamento
-- em dinheiro). SECURITY DEFINER para o Comercial ver só gasto de veículo, sem acesso ao resto do
-- financeiro. Aditiva; não altera frota_custos.

create or replace function public.crm_frota_corte()
returns date
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select c.corte from public.fin_frota_config c), date '9999-12-31')
  where (select public.crm_is_member());
$$;

drop function if exists public.crm_frota_gastos(date, date);
create or replace function public.crm_frota_gastos(p_de date, p_ate date)
returns table (
  id uuid, vehicle_id uuid, categoria text, descricao text, valor numeric, km_odometro integer,
  litros numeric, preco_litro numeric, data_gasto date, observacoes text
)
language sql
stable
security definer
set search_path = public
as $$
  with corte as (select coalesce((select c.corte from public.fin_frota_config c), date '9999-12-31') as d)
  select l.id, l.vehicle_id, coalesce(c.categoria_frota, 'outros'), coalesce(nullif(l.descricao, ''), l.historico), l.valor, l.km_odometro, l.litros,
         case when l.litros > 0 then round(l.valor / l.litros, 3) end, l.data, l.observacao
  from public.fin_lancamentos l
  join public.fin_categorias c on c.id = l.categoria_id, corte
  where (select public.crm_is_member()) and l.natureza = 'D' and l.status <> 'ignorado' and l.vehicle_id is not null
    and l.data between p_de and p_ate and l.data >= corte.d

  union all
  select i.id, i.vehicle_id, coalesce(c.categoria_frota, 'outros'), coalesce(nullif(i.fornecedor, ''), nullif(i.descricao, ''), l.historico), i.valor, i.km_odometro, i.litros,
         case when i.litros > 0 then round(i.valor / i.litros, 3) end, l.data, null::text
  from public.fin_lancamento_itens i
  join public.fin_lancamentos l on l.id = i.lancamento_id
  join public.fin_categorias c on c.id = i.categoria_id, corte
  where (select public.crm_is_member()) and i.vehicle_id is not null and l.status <> 'ignorado'
    and l.data between p_de and p_ate and l.data >= corte.d

  union all
  select m.id, m.vehicle_id, coalesce(c.categoria_frota, 'outros'), m.descricao, m.valor, m.km_odometro, m.litros,
         case when m.litros > 0 then round(m.valor / m.litros, 3) end, m.data, null::text
  from public.fin_caixa_movimentos m
  left join public.fin_categorias c on c.id = m.categoria_id, corte
  where (select public.crm_is_member()) and m.natureza = 'D' and m.tipo = 'pagamento' and m.vehicle_id is not null
    and m.data between p_de and p_ate and m.data >= corte.d;
$$;

revoke execute on function public.crm_frota_corte() from public, anon;
revoke execute on function public.crm_frota_gastos(date, date) from public, anon;
grant execute on function public.crm_frota_corte() to authenticated;
grant execute on function public.crm_frota_gastos(date, date) to authenticated;
