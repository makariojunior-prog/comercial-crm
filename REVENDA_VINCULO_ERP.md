# Revenda — por que as compras não batiam, e o que mudou

Números apurados direto no banco de produção (`taicaxtjtikdajmhtsxc`) em
11/09/2026.

## O sintoma

Na aba **Revenda → Compras Mensais**, clientes que compraram apareciam como
"sem compra", o total do mês vinha menor que o real, a tendência de 12 meses
ficava furada e os alertas de "parou de comprar" disparavam sem motivo.

Medido: **27 dos 91 clientes de Revenda (30%) não tinham NENHUM pedido
vinculado** — apareciam zerados em todos os meses. No total,
**2.404 dos 6.527 pedidos (36,8%), R$ 1.215.360,01 de R$ 2.882.381,51 (42,2%
do faturamento), estavam sem vínculo com qualquer cadastro.**

## A causa

Toda a aba soma por `atacado_pedidos.crm_client_id`, preenchido **só por
casamento de nome** no `sync-atacado`: nome idêntico ao do CRM, ou o nome do
CRM sendo prefixo do nome do ERP.

O problema é que **os dois cadastros guardam titular e nome fantasia no mesmo
campo, em ordem diferente, com separadores e grafias diferentes.** Nenhum dos
dois é prefixo do outro:

| Nome no ERP (planilha) | Cadastro no CRM |
|---|---|
| `GISLAINE LUCAS OLIVEIRA` | `MERCADINHO ZE PAULISTA - GISLAINE LUCAS` |
| `MANOEL RIVALDO RIBEIRO VILANOVA` | `MERCADO AVENIDA - MANOEL RIVALDO RIBEIRO VILANOVA` |
| `MARCONE DOS ANJOS` | `MARCONE DOS ANJOS - PANIFICADORA MANÁ PÃES.` |
| `SILVANA CORDEIRO DA SILVA LIMA ( PANIF E LANCH NOVA OPÇÃO)` | `PANIFICADORA E LANCHONETE NOVA OPÇÃO- SILVANA CORDEIRO` |

E o ERP passou a prefixar o CNPJ em grupos separados por espaço, o que quebra
até os nomes que bateriam:

| Nome no ERP | Cadastro no CRM | Valor parado |
|---|---|---|
| `45 860 507 Luziania Vieira dos Santos` | `LUZIANIA VIEIRA DOS SANTOS-RONALDO CRISTO REI` | R$ 29.629,60 |
| `54 980 551 Ellen Damiani Silva` | `CASA DOS CONGELADOS - ELLEN DAMIANI SILVA` | R$ 16.297,50 |
| `61 426 181 Karyne Ribeiro Melo` | `KARYNE RIBEIRO MELO` | R$ 15.340,00 |

Some-se a isso que o ERP **muda a grafia do mesmo cliente ao longo do tempo**
(`SILVANA CORDEIRO DA SILVA LIMA` vira `SILVANA CORDEIRO DA SILVA LIMA
( PANIF E LANCH NOVA OPÇÃO) (Rota Garavelo I)` e volta; `REINALDO  ROMA` /
`REINALDO  ROMA PAES`), então o mesmo cliente casava num mês e não casava no
outro — daí a tendência furada e o alerta falso de "parou de comprar".

O `id_cliente` do ERP é estável, vem na planilha, e a coluna
`atacado_pedidos.cliente_id` já existia no banco — **mas o sync nunca gravava:
0 de 6.527 pedidos tinham `cliente_id` preenchido.**

### Três bugs de perda de dado no mesmo sync

A planilha de recepção tem só
`id_venda, venda, id_cliente, cliente, valor, cidade, data_emissao, data_atualizacao, id_licenciado`.
Mesmo assim o sync escrevia `tipo` e `ocorrencia` em toda linha. Confirmado no
banco:

| Coluna | Linhas preenchidas (de 6.527) | Causa |
|---|---|---|
| `cliente_id` | **0** | nunca gravado |
| `numero_pedido` | **0** | a planilha chama a coluna de `venda`; o sync só procurava `numero_pedido`/`numero`/`num_pedido` |
| `tipo <> 'PEDIDO'` | **0** | o sync reescrevia `'PEDIDO'` a cada execução, revertendo toda classificação manual |
| `ocorrencia` | **0** | o sync reescrevia `null` a cada execução |

Ou seja: bonificação e pedido cancelado voltavam a contar como faturamento na
Revenda a cada sync.

## O que mudou

**`supabase/functions/sync-atacado/index.ts`**

- grava `cliente_id` (o `id_cliente` do ERP) em todo pedido;
- resolve o vínculo nesta ordem: **de-para por `cliente_id`** → casamento por
  nome. O de-para vence, então mudar a grafia no ERP não desvincula mais nada;
- o casamento por nome agora quebra **os dois lados** nos separadores `-`, `/`
  e parênteses e compara cada pedaço contra cada pedaço, com prefixo nas duas
  direções. Também remove o ruído: `(Rota X)`, o CNPJ em grupos na frente
  (`45 860 507 `) e o CPF colado no fim;
- entre dois cadastros com a mesma evidência, **não chuta**: deixa sem vínculo
  para o de-para manual. É o caso de cadastro duplicado no CRM e de dois
  clientes que dividem o fantasia (`PADARIA PÃO NOSSO - JOANA` e
  `PADARIA PÃO NOSSO - JOSE AIRTON`);
- todo vínculo achado por nome é gravado no de-para (`origem = 'AUTO'`), então
  as outras grafias do mesmo `id_cliente` já entram vinculadas;
- `tipo` e `ocorrencia` só entram no upsert se a planilha trouxer a coluna;
- `numero_pedido` passa a ler a coluna `venda`;
- a resposta devolve `matchedById` / `matchedByName` / `unmatched` /
  `linksLearned`.

**`supabase/migrations/20260911130000_atacado_cliente_links.sql`**

- cria `atacado_cliente_links` (`cliente_id` → `crm_client_id`, com `origem`
  `AUTO`/`MANUAL`) e o índice de `atacado_pedidos.cliente_id`.

**Aba Revenda (`RevendaComprasTab` + `VincularClientesModal`)**

- o card **"Não vinculados"** virou botão: abre o de-para com os clientes do
  ERP sem cadastro, ordenados por valor. O vínculo grava com
  `origem = 'MANUAL'` (que o sync nunca sobrescreve) e corrige o histórico na
  hora;
- as consultas passaram a paginar, para o limite de linhas do PostgREST não
  cortar a janela de 12 meses em silêncio.

## Efeito medido — já aplicado em produção (11/09/2026)

Migration aplicada, edge function publicada (versão 28) e sync reprocessando a
planilha inteira. Resultado real:

| | antes | depois |
|---|---|---|
| Clientes de Revenda com histórico | 64 de 91 | **77 de 91** |
| Clientes de Revenda zerados | 27 | **14** |
| Pedidos do módulo Revenda | 534 | **756** |
| Faturamento do módulo Revenda | R$ 252.604,80 | **R$ 330.880,80** |
| Pedidos sem vínculo (geral) | 2.405 | **1.389** |
| Valor sem vínculo (geral) | R$ 1.215.360,01 | **R$ 907.058,27** |
| `cliente_id` preenchido | 0 de 6.527 | **6.528 de 6.529** |
| `numero_pedido` preenchido | 0 | **6.528** |
| De-para gravado | — | **395 clientes do ERP** |

Nenhum vínculo existente foi perdido: um sync completo rodado depois da
correção deixa o estado idêntico (0 perdidos, 0 alterados).

## Dois obstáculos que só apareceram na execução

**1. FK órfã bloqueava a coluna `cliente_id`.** A coluna existia, mas com
`FOREIGN KEY (cliente_id) REFERENCES atacado_clientes(id)` — tabela legada,
hoje com 0 linhas, herdada de antes da migração para `crm_clients`. Como o
valor a gravar é o `id_cliente` do ERP, que não tem linha lá, **todo upsert era
rejeitado com 23503**. Era essa a razão real de a coluna estar nula nos 6.527
pedidos — não esquecimento do sync. A FK só conseguia recusar escrita, nunca
proteger nada. Removida.

**2. O upsert em lote apagava vínculo.** O padrão `...(clientId ? {
crm_client_id } : {})` não funciona em lote: o PostgREST monta UMA instrução
com a união das colunas do lote, então a linha que omite a coluna recebe
`NULL` explícito. Na primeira execução isso zerou **179 pedidos** de clientes
com cadastro duplicado no CRM — justamente os que o matcher novo se recusa a
chutar. Restaurados do backup e corrigido na raiz: o sync não grava mais
`crm_client_id` no upsert; grava o de-para e chama
`aplicar_vinculos_atacado()`, que só escreve onde o de-para tem resposta e
portanto nunca apaga nada.

Antes de qualquer escrita foi criada a tabela
`backup_vinculo_revenda_20260911` com o estado original dos 6.529 pedidos.

## Pendência de qualidade de cadastro

O CRM tem **10 nomes duplicados (20 cadastros, 4 deles de Revenda)** — mesmo
cliente cadastrado duas vezes. Isso divide o histórico de compras em duas
linhas na aba Revenda e é o que gera a maior parte das ambiguidades acima.
Vale limpar.

## Como aplicar (já feito em produção)

1. ~~Rodar a migration~~ — aplicada.
2. ~~`supabase functions deploy sync-atacado`~~ — publicada, versão 28.
3. ~~Rodar o sync `{ "type": "pedidos" }`~~ — reprocessado, histórico corrigido.
4. **Pendente:** publicar o front (merge do PR → deploy) e, na aba
   Revenda → Compras Mensais, abrir "Não vinculados" e fazer o de-para do que
   sobrou, começando pelos de maior valor — o maior é
   `FORMPAN INDUSTRIA DE PAO LTDA` ↔ `PANIFICADORA MUNDIAL - FORMPAN PANIF`,
   com R$ 326.473,80.

Para reverter o vínculo ao estado anterior, se necessário:

```sql
update atacado_pedidos p set crm_client_id = b.crm_client_id
  from backup_vinculo_revenda_20260911 b where p.id = b.id;
```
