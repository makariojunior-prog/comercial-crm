# Positivações Atacado × RH

## Objetivo
Levar as comissões de Positivação Atacado (R$ 50 por cliente com 3 pedidos + R$ 500) para o app do RH, no mesmo modelo do Varejo, com confirmação só de Administrador, arquivo dos pagos e os mesmos filtros do Varejo.

## Fluxo (decidido com o usuário)
1. CRM: o Administrador confirma a positivação do cliente elegível.
2. O CRM envia a comissão ao RH: uma linha por pessoa e por período de fechamento (26 → 25, pela data da confirmação) em `comissoes_mensais` com `fonte = 'POSITIVACAO'`, `confirmado = false`, com o detalhe por cliente em `detalhes` (jsonb).
3. RH: analisa e confirma (lança na folha do período). Isso é o "pago".
4. O status volta ao CRM por trigger: os clientes viram "pago" e vão para o **Arquivo**.
5. RH pode devolver (excluir a linha): os clientes voltam a "aguardando confirmação" no CRM.

## Regras
- Só Administrador confirma: RPC `crm_confirmar_positivacao` valida `crm_get_my_role() = 'admin'` **no banco**; trigger `BEFORE INSERT/UPDATE` em `crm_clients` bloqueia qualquer alteração direta dos campos de positivação/comissão por não-admin (chamadas sem `auth.uid()`, como as edge functions, seguem livres; os triggers internos usam um flag de sessão).
- A elegibilidade (>= 3 pedidos e >= R$ 500, mesmos filtros da tela: sem BONIFICACAO/CANCELADO, `ignorado = false`) é revalidada no servidor.
- Snapshot na confirmação: `positivacao_pedidos`, `positivacao_total`, `positivado_por`.
- Período: dia <= 25 fecha em 25 do mês; dia >= 26 fecha em 25 do mês seguinte. Se o RH já confirmou aquele período para a pessoa, a positivação cai no próximo (não altera período pago).
- Beneficiário: usuário do CRM (`indicador_user_id`) → `crm_users.colaborador_id` → `colaboradores` (nome e empresa). Sem vínculo com o RH: envia mesmo assim, com o nome do CRM, e o CRM mostra o aviso "sem vínculo com o RH".
- Administrador pode **desfazer** uma confirmação enquanto o RH não confirmou (`crm_desfazer_positivacao`).
- O botão "Marcar pago" do CRM sai (o pagamento passa a ser do RH).

## Indicador por ID
`crm_clients.indicador_user_id` (uuid) passa a ser a fonte da verdade; `indicador` (texto) continua gravado por compatibilidade. Backfill por nome normalizado. Código novo usa ID, compatível com a centralização de usuários no portal (ver memória do projeto).

## Tela (CRM) — `PositivacoesTab`
Extraída de `ComissaoPage.tsx` (888 linhas). Filtros iguais ao Varejo (Por mês/ano ou Período personalizado, Indicador, Atualizar) + opção "Todos os períodos" (padrão) e Exportar Excel. Subabas: **Ativas** (Em progresso, Elegíveis, Enviadas ao RH) e **Arquivo (pagas)**. O período filtra "Enviadas ao RH" pela data de confirmação e o Arquivo pela data de pagamento; Elegíveis e Em progresso mostram a situação atual.

## RH (`rh-app/index.html`)
- Nova aba **Positivações** em Comissionamento: linhas `POSITIVACAO` pendentes, detalhe por cliente e botão "Confirmar / lançar na folha".
- Folha: `comissoesMap` passa a **somar** e a considerar só linhas confirmadas (hoje sobrescreve por nome).
- Histórico: editar/cancelar só mexe em `folha_mensal.comissao_varejo` quando a fonte é VAREJO (hoje qualquer linha sobrescreveria o valor do Varejo).

## Fora de escopo
Migrar nomes em texto de outros módulos para ID e telas de gestão de usuário (projeto do portal). Endurecer a RLS aberta de `comissoes_mensais` (sinalizado; frente de segurança separada).

## Sugestões não implementadas
Janela de validade da meta (ex.: 90 dias do 1º pedido), estorno por inadimplência, aviso ao Administrador quando o cliente vira elegível, metas (3 / R$ 500 / R$ 50) em tabela de configuração.
