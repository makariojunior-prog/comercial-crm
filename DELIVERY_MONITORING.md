# Monitoramento de Status de Delivery (Ifood & 99Food)

## Arquitetura Atual
O aplicativo CRM Cantina foi criado para monitorar exclusivamente o status operacional das lojas (Aberto, Fechado, Pausado) nas plataformas de delivery.
Para a recepção de pedidos, a loja continua utilizando a integradora **Cardápio Web**.

Os webhooks de monitoramento foram configurados no Supabase (Edge Functions) e gravam os logs e os status na tabela `lojas_delivery_status` com suporte a *Realtime*.

---

## 99Food

### Credenciais do App (CRM Cantina)
- **APP ID:** 5764607670575695995
- **Secret:** `FOOD99_SECRET` salva no cofre do Supabase.
- **Webhook URL:** `https://taicaxtjtikdajmhtsxc.supabase.co/functions/v1/food99-webhook`
- **Loja (ID Interno):** 5764608576400918038

### Status Atual (CONECTADO E OPERACIONAL ✅)
1. **Multi-binding oficializado pela 99Food:** O bloqueio anterior (erro 10101) ocorria porque a 99Food havia suspendido múltiplas integrações simultâneas. Com o anúncio do retorno do multi-binding, a loja pôde ser vinculada com sucesso mantendo o Cardápio Web ativo.
2. **Loja Vinculada com Sucesso:**
   - **Nome da Loja:** Cantina em Casa
   - **ID da Loja / APPShopID:** 5764608576400918038
   - **Status na 99:** Aberta / Produção
   - **Auth Token:** Gerado com sucesso via `/v1/auth/authtoken/get`.
   - **Leitura de Detalhes (`/v1/shop/shop/detail`):** 100% funcional, retornando status operacional, horários e fotos da loja em tempo real.
   - **Alteração de Status (`/v1/shop/shop/setStatus`):** Disponível para alternar entre online (aberta) e offline (pausada/fechada).

---

## iFood

### Credenciais do App (CRM Cantina)
- **Client ID:** 5d0df11b-fffd-492c-b132-20557cb13b8d
- **Secret:** `IFOOD_SECRET` salva no cofre do Supabase.
- **Webhook URL:** `https://taicaxtjtikdajmhtsxc.supabase.co/functions/v1/ifood-webhook`

### Status Atual (EM HOMOLOGAÇÃO - ESCOPO: MERCHANT)
1. O aplicativo foi criado no portal do iFood.
2. O iFood respondeu ao ticket `#33063337` solicitando vídeos gravados em tela funcional para 4 módulos (Merchant, Catalog, Review, Analytics).
3. **Decisão estratégica:** Como o CRM foca em monitoramento e controle operacional da loja, alinhamos homologar **EXCLUSIVAMENTE o módulo Merchant** (Informações/Disponibilidade da Loja, Pausas/Interrupções e Horários de Funcionamento).
4. **Próximo Passo:** Aguardar a confirmação do iFood no ticket e a liberação das permissões/loja de teste no portal para gravarmos o vídeo dos 3 cenários do módulo Merchant.

---

## Banco de Dados
- **Tabela `lojas_delivery_status`:** Armazena o último status conhecido (`OPEN`, `CLOSED`, `PAUSED`) de cada canal.
- **Tabela `delivery_webhook_logs`:** Armazena o payload bruto de todos os webhooks recebidos para auditoria e mapeamento de campos (já que as documentações variam).
