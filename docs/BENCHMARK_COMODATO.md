# Benchmark — Módulo de Comodato de Equipamentos

Pesquisa de referência para desenhar o módulo **Comodato** do CRM (Lumar / Cantina em Casa).
Data: 2026-09.

---

## 1. O problema, em uma frase

Somos **comodantes**: cedemos freezers, armários, fornos e expositores para clientes usarem
gratuitamente, em troca de exposição e volume de compra. O equipamento **continua sendo nosso
ativo imobilizado** — sai fisicamente da empresa, mas não sai do balanço. Hoje isso está
registrado como **texto livre** no cadastro do cliente (`crm_clients.comodato`), o que torna
impossível responder perguntas básicas:

- Quantos freezers a empresa tem? Quantos estão parados no depósito?
- Esse cliente tem contrato assinado? Vence quando?
- Quando esse freezer foi entregue? Em que estado voltou da última vez?
- Que equipamento está há 2 anos sem manutenção?
- Se o cliente virar PERDIDO, qual equipamento precisa ser recolhido?

## 2. Setores e produtos analisados

| Categoria | Referências consultadas | O que foi aproveitado |
|---|---|---|
| **CMMS / EAM** (manutenção de ativos) | eWorkOrders, FieldEx, Titan MMS, MaintainNow, Cryotos, Oracle PeopleSoft Maintenance Management, Accruent | Ciclo de vida do ativo; ordens de serviço; manutenção preventiva por intervalo; histórico por ativo |
| **Trade asset / cooler management** (bebidas — o análogo mais próximo) | Asset Infinity (Cooler Management), AoFrio, EasyCheck, SalesPort | Identificação única por etiqueta/QR; auditoria de campo; ROI por ponto de venda; detecção de ativo ocioso |
| **Locação / rental serializado** | InTempo Software, ServiceMax Asset 360, Verdantis | Separação entre **modelo** (catálogo) e **unidade serializada** (patrimônio) |
| **Custódia / transferência de ativos** | AppMaster (asset transfer/custody), Microsoft FAST Asset Management, DatabaseSample | Tabela de transferências append-only + campo de "detentor atual" no ativo |
| **ERP nacional / fiscal** | IXC Soft (Controle Patrimonial e Comodato), TOTVS, Global Consultoria, NFE+, Contadores.cnt.br | Contrato de comodato, CFOPs de remessa/retorno, bens em poder de terceiros |

---

## 3. Achados que viraram decisão de projeto

### 3.1 Separar **modelo** de **unidade** (serialização)

> *"Serialized equipment refers to specific items that bear an identifying serial number…
> bulk equipment are purchased in larger quantities and do not bear a specific unitized number."*
> — InTempo Software

Equipamento de comodato é caro e individual: precisa ser rastreado **unidade a unidade**, não por
quantidade. "3 freezers" é uma resposta ruim — "FRZ-0012, FRZ-0031 e FRZ-0044" é a resposta certa.

→ **Decisão:** duas tabelas. `comodato_modelos` (catálogo: FREEZER FRICON 450L) e
`comodato_equipamentos` (a unidade física, com código de patrimônio e número de série).

### 3.2 Histórico de custódia em tabela própria, append-only

> *"Keep transfer history in its own table. Each handoff should create a new entry rather than
> replace the previous owner in the equipment record. […] the equipment table can show the
> current holder and status for quick checks."* — AppMaster

→ **Decisão:** `comodato_alocacoes` é o livro-razão (uma linha por "esteve no cliente X de A até B",
com estado de entrega e de devolução). O campo `comodato_equipamentos.client_id` é apenas o
**cache do detentor atual**, mantido por trigger — nunca a fonte da verdade.

Isso é o que permite responder *"onde esse freezer já esteve?"* e *"esse cliente já devolveu o quê?"*.

### 3.3 Ciclo de vida do ativo como máquina de estados

> *"Track every stage of that journey, from purchase to disposal… proactively managing performance
> instead of reacting when something breaks."* — FieldEx / eWorkOrders

→ **Decisão:** `situacao` do equipamento com estados explícitos:
`disponivel` → `reservado` → `em_comodato` → `manutencao` → (volta a `disponivel`) → `baixado`.
A aba **Disponíveis** é simplesmente `situacao = 'disponivel'` — o pedido do usuário
("mostre quais equipamentos estão disponíveis para alocar") cai fora de graça do modelo.

### 3.4 Ativo ocioso é dinheiro parado

> *"Better visibility helps businesses identify idle or underutilized coolers that may be
> reassigned before additional equipment is purchased."* — EasyCheck
> *"Improving CAPEX utilization by ensuring every outlet has the right size and type of equipment."* — SalesPort

→ **Decisão:** KPIs no topo do módulo — capital imobilizado total, valor parado no depósito,
taxa de utilização (% em comodato) e "parados há mais de 90 dias". O módulo não serve só para
não perder equipamento; serve para decidir **não comprar** o próximo freezer.

### 3.5 Manutenção preventiva por intervalo + data do próximo vencimento

> *"A preventive maintenance schedule database typically includes each asset in a row with its
> tasks, interval, last-completed date, and next-due date."* — Oracle / Accruent

Não temos horímetro nem sensor, então o modelo por **meter** não se aplica. O modelo por
**intervalo de tempo com recorrência flutuante** se aplica: ao concluir uma manutenção, a próxima
é recalculada a partir da data de conclusão real.

→ **Decisão:** `manutencao_intervalo_meses` + `ultima_manutencao` + `proxima_manutencao` na unidade,
com `proxima_manutencao` recalculada por trigger ao concluir a OS. A aba **Manutenções** junta
as OS abertas com os equipamentos vencidos/a vencer.

### 3.6 Identificação única e auditável em campo

> *"Unique identification makes cooler verification, audits, transfers, and field updates easier."*
> — Asset Infinity

→ **Decisão:** `codigo_patrimonio` obrigatório e único (ex.: `FRZ-0012`), gerado automaticamente por
categoria. É o que vai na etiqueta colada no equipamento e o que o vendedor confere na visita.
Campo `ultima_conferencia` para registrar auditoria presencial.

### 3.7 Contrato é o que dá segurança jurídica e fiscal

> *"O contrato de comodato é obrigatório para caracterizar a operação. Não há transferência de
> propriedade do bem."* — NFE+ / ClickNotas
> *"O contrato registra a situação atual dos equipamentos, identificando a empresa proprietária e
> deixando claro a situação contábil e fiscal."* — Global Consultoria

CFOPs relevantes (operação dentro do estado / fora do estado):

| Operação | CFOP |
|---|---|
| Remessa de bem em comodato | **5908** / 6908 |
| Retorno de bem em comodato (pelo comodatário) | **5909** / 6909 |
| Entrada de bem em comodato (pelo comodatário) | 1908 / 2908 |
| Retorno do bem ao comodante | 1909 / 2909 |

→ **Decisão:** `comodato_contratos` guarda `contrato_assinado`, `data_assinatura`, `data_inicio`,
`data_fim`, `prazo_meses`, `renovacao_automatica`, `arquivo_url` (PDF assinado) e a contrapartida
comercial (volume mínimo). A alocação guarda `nf_remessa` e `nf_retorno` — o elo fiscal com o
CFOP 5908/5909. Contrato **vencido** ou **sem assinatura** vira alerta no módulo, porque é
exatamente onde mora o risco de perder o bem.

### 3.8 Um contrato, vários bens

Padrão em todos os ERPs analisados (IXC, TOTVS): o contrato é do **cliente**, e os bens são
**itens** do contrato. Permite trocar um freezer quebrado por outro sem refazer o contrato.

→ **Decisão:** `comodato_contratos` 1 : N `comodato_alocacoes`. Uma alocação pode existir sem
contrato (entrega emergencial), e o módulo sinaliza isso como pendência.

---

## 4. Arquitetura escolhida

```
crm_clients ──1:N──> comodato_contratos ──1:N──> comodato_alocacoes <──N:1── comodato_equipamentos
                                                        │                            │
                                                        │                            └──N:1── comodato_modelos
                                                        └──1:N──> comodato_manutencoes
```

| Tabela | Papel | Analogia no benchmark |
|---|---|---|
| `comodato_modelos` | Catálogo do que existe (FREEZER FRICON 450L) | *Product / Asset Type* (ServiceMax) |
| `comodato_equipamentos` | A unidade física com patrimônio e série | *Serialized Asset* (InTempo) |
| `comodato_contratos` | O acordo jurídico com o cliente | *Contrato de comodato* (IXC/TOTVS) |
| `comodato_alocacoes` | Livro-razão de custódia (append-only) | *Transfer history* (AppMaster) |
| `comodato_manutencoes` | Ordens de serviço + preventiva | *Work order* (Oracle PeopleSoft) |

### Integração com o cadastro do cliente (requisito explícito)

O campo livre `crm_clients.comodato` **não é apagado**. Ele passa a ser um **espelho gerado**:
um trigger reescreve o texto (`FRZ-0012 FREEZER FRICON 450L; ARM-0003 ARMÁRIO 58X70`) sempre que
uma alocação muda. Assim:

- listagens, exports e a planilha do Google continuam funcionando sem alteração;
- o texto original é preservado em `comodato_legado` para auditoria da migração;
- dentro do `ClientModal` o usuário vê e opera os equipamentos estruturados, sem sair do cadastro.

---

## 5. O que foi deliberadamente deixado de fora

- **Leitura por QR code na câmera** — o `codigo_patrimonio` já está pronto para isso; a captura
  fica para uma segunda fase, junto com a app de visitas.
- **Depreciação contábil** — é trabalho do contador, não do CRM. Guardamos `valor_aquisicao` e
  `data_aquisicao`, que é o insumo que ele precisa.
- **Emissão da NF de remessa** — o módulo guarda o número da NF; a emissão continua no ERP.
- **Manutenção por horímetro/meter** — sem sensor instalado, não há leitura para alimentar.

---

## Fontes

- [Asset Lifecycle Management: Best Practices & Strategies — eWorkOrders](https://eworkorders.com/asset-lifecycle-management-best-practices/)
- [7 Best CMMS Tools for Asset Lifecycle Tracking — FieldEx](https://www.fieldex.com/en/blog/best-cmms-tools-for-asset-lifecycle-tracking)
- [Asset Life Cycle Management Best Practices with CMMS — Titan MMS](https://titanmms.com/asset-life-cycle-management/)
- [Asset Lifecycle Management: How CMMS Tracks Equipment — MaintainNow](https://www.maintainnow.app/blog/asset-lifecycle-management-how-cmms-tracks-equipment-from-purchase-to-retirement-1760125551942)
- [Asset Management in Food & Beverage Industries — Cryotos](https://www.cryotos.com/blog/asset-management-in-food-beverage-industries)
- [Cooler Management Software for Beverage Companies — Asset Infinity](https://www.assetinfinity.com/blog/cooler-management-software-beverage-industry)
- [Soft Drink Fridge Asset Tracking and Cooler Optimization — AoFrio](https://www.aofrio.com/industries/soft-drinks/)
- [Top 5 Benefits of Asset Tracking Software for Beverage Distribution — EasyCheck](https://easycheck.io/resources/blog/top-5-benefits-of-asset-tracking-software-for-beverage-distribution/)
- [Beverage Distribution Software — SalesPort](https://sortstring.com/industries/beverages)
- [How Are You Managing Bulk Inventory Versus Serialized Rental Equipment? — InTempo](https://www.intemposoftware.com/blog/managing-bulk-serialized-inventory)
- [Asset Management Data Model — PTC ServiceMax Asset 360](https://support.ptc.com/help/servicemax_asset360/en/articles/asset-360/asset-360-asset-management-data-model.html)
- [Asset transfer app: track custody across teams — AppMaster](https://appmaster.io/blog/asset-transfer-app-custody-tracking)
- [Asset Management — Microsoft FAST templates](https://microsoft.github.io/industry-solutions/modules/asset-management/)
- [Asset Tracking System Database Schema — DatabaseSample](https://databasesample.com/database/asset-tracking-system-database)
- [Setting Up and Maintaining Preventive Maintenance Schedules — Oracle PeopleSoft](https://docs.oracle.com/cd/F49243_01/fscm92pbr42/eng/fscm/fwkm/SettingUpandMaintainingPreventiveMaintenanceSchedules-c9f1a2.html)
- [Sample Preventive Maintenance Schedules — Accruent](https://help.accruent.com/mc/Content/MCUserGuide/Preventive%20Maintenance/Overview/Sample%20Preventive%20Maintenance.htm)
- [Preventive Maintenance Schedule: Types — Tractian](https://tractian.com/en/glossary/preventive-maintenance-schedule)
- [Funcionalidades de Controle Patrimonial — IXC Soft](https://wiki-erp.ixcsoft.com.br/documentacao/conceitos/estoque-e-ordem-de-servico/funcionalidades-de-controle-patrimonial.html)
- [Comodato — IXC Soft](https://wiki-erp.ixcsoft.com.br/documentacao/menu-sistema/inmap/service/aplicativo-inmap-service/agenda/adicionais/comodato.html)
- [Arrendamento, locação, leasing e comodato — TOTVS](https://www.totvs.com/blog/gestao-de-servicos/arrendamento-e-locacao-diferencas/)
- [Bens imobilizados: como registrar bens em terceiros — Global Consultoria](https://globalconsultoria.com.br/bens-imobilizados-como-registrar-corretamente-bens-em-terceiros-parte-ii/)
- [CFOP 5908 — Remessa de bem por conta de contrato de comodato — NFE+](https://blog.nfemais.com.br/cfop-5908-remessa-de-bem-por-conta-de-contrato-de-comodato/)
- [CFOP 5909 — Retorno de bem recebido por conta de contrato de comodato — Contadores.cnt.br](https://www.contadores.cnt.br/cfop/5909-retorno-de-bem-recebido-por-conta-de-contrato-de-comodato.html)
