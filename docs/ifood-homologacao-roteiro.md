# Roteiro dos vídeos de homologação iFood (módulo Merchant)

Chamado **#33063337** — aplicativo **CRM Cantina** (centralizado, módulos Merchant / Catalog / Analytics / Review).
O suporte pediu o checklist de Merchant e **vídeos mostrando os logs dentro do Portal do Desenvolvedor, menu Logs**.

Os testes usam o aplicativo **CANTINA EM CASA LTDA – Teste (C)** e a loja de teste vinculada a ele.
Tudo é feito pelo **console do CRM** (Loja → aba *Operação iFood*, só administrador), que chama a API de verdade.

## Antes de gravar (uma vez)

- [ ] Secrets do Supabase criados: `IFOOD_CLIENT_ID` e `IFOOD_CLIENT_SECRET` (do app de teste).
- [ ] Portal do Desenvolvedor → app de teste → **Webhook**: URL `https://taicaxtjtikdajmhtsxc.supabase.co/functions/v1/ifood-webhook`, Status ativado, **Testar conexão** = sucesso.
- [ ] Duas janelas lado a lado: **CRM** (Loja → Operação iFood) e **Portal do Desenvolvedor** (app de teste → *Logs de Eventos*, período "Últimos 30 minutos").
- [ ] Gravador de tela com áudio (Win+Alt+R no Windows). Um vídeo por cenário, 1–3 min cada. Narre o que está fazendo.

## Vídeo 1 — Cenário 1: informações e disponibilidade da loja

1. Mostre o Portal (loja de teste do app, aba *Permissões*): é a loja que o app enxerga.
2. No CRM, clique **Listar loja vinculada** → a resposta mostra o `id` e o nome da loja (deve ser o mesmo do Portal).
3. Clique **Detalhes da loja** → mostre os dados completos devolvidos.
4. Clique **Aberta ou fechada?** → mostre `state`/`available` e a mensagem ("Loja aberta"); o CRM também atualiza o status do iFood no dashboard.
5. Diga em voz alta: "o app consulta o status da loja a cada 5 minutos e mostra no dashboard".

## Vídeo 2 — Cenário 2: pausas (interrupções)

1. No CRM, escolha **30 min** e motivo "Teste de pausa — homologação" → **Cadastrar pausa**. Mostre a resposta (id da pausa).
2. No Portal do Parceiro, mostre que a loja aparece **pausada** (valide a pausa lá).
3. De volta ao CRM → **Listar pausas ativas**: a pausa criada aparece com início e fim.
4. **Remover pausas** → resposta mostra quantas foram removidas.
5. Clique **Aberta ou fechada?** de novo e mostre que a loja voltou a "aberta"; confirme no Portal.

## Vídeo 3 — Cenário 3: horários de funcionamento

1. **Ver horários** → mostre o horário atual (resposta da API).
2. **Aplicar horário de teste** (sábado 10h–19h; domingo 09h–12h / 13h–16h / 17h–23h) → confirme.
3. **Ver horários** novamente → a resposta traz os novos turnos.
4. No Portal do Parceiro, abra os horários da loja e **valide** que sábado e domingo estão iguais.

## Vídeo 4 (ou trecho final de cada vídeo) — Logs no Portal do Desenvolvedor

O suporte pediu especificamente o menu **Logs**:

1. Portal do Desenvolvedor → app → **Logs de Eventos**.
2. Mantenha *Tempo = Últimos 30 minutos* e clique **Buscar**.
3. Mostre as chamadas/eventos que acabaram de acontecer (webhook e polling), filtrando por *Merchant Id* se ajudar.
4. Se a lista vier vazia, repita uma ação no CRM e busque de novo (os logs podem demorar alguns segundos).

## Depois de gravar

- Responda o ticket **#33063337** anexando/linkando os vídeos e citando: app **CRM Cantina**, cenários 1, 2 e 3 do módulo Merchant, webhook assinado (`X-IFood-Signature`) em produção.
- Cada pausa/reabertura/alteração de horário fica registrada em `ifood_acoes_log` (quem, quando, resposta da API) — útil se o iFood pedir evidência.

## Se algo falhar

| Sintoma | O que verificar |
|---|---|
| Resposta com `HTTP 401` do iFood | Secrets errados/expirados ou segredo trocado no Portal sem atualizar o Supabase |
| `Nenhuma loja liberada` | O app de teste não tem merchant vinculado (aba *Permissões* do app) |
| Erro 403 do CRM | Só administrador faz horários; pausa/reabrir exige administrador ou atendente |
| Webhook "Testar conexão" falha | O secret `IFOOD_CLIENT_SECRET` precisa ser o do **mesmo** app onde o webhook foi configurado (assinatura HMAC) |
