# Revenda — por que as compras não batiam, e o que mudou

## O sintoma

Na aba **Revenda → Compras Mensais**, clientes que compraram apareciam como
"sem compra", o total do mês vinha menor que o real, a tendência de 12 meses
ficava furada e os alertas de "parou de comprar" disparavam sem motivo.

## A causa

O pedido chega do ERP na planilha de recepção
(`1Z4vrdU_1zSzs9Bl6SrPVOiCnlWFdK5b0oP7aYnuMRNY`), cujas colunas são:

```
id_venda, venda, id_cliente, cliente, valor, cidade, data_emissao, data_atualizacao, id_licenciado
```

Toda a aba Revenda soma por `atacado_pedidos.crm_client_id`. Esse campo era
preenchido **só por casamento de nome** (`sync-atacado`): ou o nome do ERP era
idêntico ao do CRM, ou tinha que *começar* com ele. Só que o nome que o ERP
manda não serve como chave:

1. **O nome fantasia costuma vir depois do titular** — e é pelo fantasia que o
   cliente está cadastrado no CRM:

   | Nome no ERP | Cadastro no CRM |
   |---|---|
   | `GISLAINE LUCAS OLIVEIRA - MERCADINHO ZÉ PAULISTA (Rota Canedo)` | `MERCADINHO ZÉ PAULISTA` |
   | `JOANA DARC MAIA DA SILVA ( PADARIA PÃO NOSSO)` | `PADARIA PÃO NOSSO` |
   | `RONILDO LEAO MEDEIRO - EMPORIO RJ` | `EMPORIO RJ` |

   Como o nome do CRM está no meio da string, o `startsWith` nunca casava.
   Na amostra da planilha: **76 nomes distintos, 875 pedidos, R$ 309.984,90 —
   10,8% do faturamento**.

2. **O ERP muda a grafia do mesmo cliente ao longo do tempo**, então o mesmo
   cliente casava em um mês e não casava no outro:

   | `id_cliente` | grafias encontradas |
   |---|---|
   | `1199670` | `SILVANA CORDEIRO DA SILVA LIMA ` / `SILVANA CORDEIRO DA SILVA LIMA ( PANIF E LANCH NOVA OPÇÃO) (Rota Garavelo I)` |
   | `1197992` | ` JOSÉ DIAS` / `MERCEARIA IDEAL / JOSÉ DIAS` |
   | `1198162` | `REINALDO  ROMA ` / `REINALDO  ROMA PAES` / `REINALDO  ROMA PAES ( Rota Hidrolândia )` |

   **39 clientes do ERP com 2+ grafias, 815 pedidos, R$ 266.378,90 — 9,3% do
   faturamento.**

O `id_cliente` do ERP, que é estável, existia na planilha e a coluna
`atacado_pedidos.cliente_id` existia no banco — mas o sync **nunca gravava**.

Dois efeitos colaterais do mesmo sync agravavam o quadro:

- a planilha não tem colunas `tipo` nem `ocorrencia`, mas o sync escrevia
  `tipo: 'PEDIDO'` e `ocorrencia: null` em toda linha, **revertendo a cada
  execução** as classificações manuais — bonificação e pedido cancelado
  voltavam a contar como faturamento na Revenda;
- `numero_pedido` nunca era preenchido, porque a planilha chama essa coluna de
  `venda` e o sync só procurava por `numero_pedido`/`numero`/`num_pedido`.

## O que mudou

**`supabase/functions/sync-atacado/index.ts`**

- grava `cliente_id` (o `id_cliente` do ERP) em todo pedido;
- resolve o vínculo nesta ordem: **de-para por `cliente_id`** → casamento por
  nome. O de-para vence, então mudar a grafia no ERP não desvincula mais nada;
- o casamento por nome agora quebra o nome do ERP nos separadores `-`, `/` e
  parênteses e testa cada pedaço, além do nome inteiro. Também ignora as
  anotações que o ERP anexa (`(Rota Canedo)`, CPF no fim do nome);
- todo vínculo achado por nome é gravado no de-para (`origem = 'AUTO'`), então
  as outras grafias do mesmo cliente já entram vinculadas;
- `tipo` e `ocorrencia` só entram no upsert se a planilha trouxer a coluna —
  a classificação manual para de ser sobrescrita;
- `numero_pedido` passa a ler a coluna `venda`;
- a resposta do sync devolve `matchedById`, `matchedByName`, `unmatched` e
  `linksLearned` para dar visibilidade ao vínculo.

**`supabase/migrations/20260911130000_atacado_cliente_links.sql`**

- cria `atacado_cliente_links` (`cliente_id` → `crm_client_id`, com `origem`
  `AUTO`/`MANUAL`);
- garante `atacado_pedidos.cliente_id` + índice;
- põe default `'PEDIDO'` em `atacado_pedidos.tipo`, para o sync poder omitir a
  coluna sem quebrar inserção de linha nova.

**Aba Revenda (`RevendaComprasTab` + `VincularClientesModal`)**

- o card **"Não vinculados"** virou botão: abre a tela de de-para com os
  clientes do ERP sem cadastro, ordenados por valor. O vínculo grava em
  `atacado_cliente_links` com `origem = 'MANUAL'` (que o sync nunca sobrescreve)
  e corrige o histórico na hora;
- as consultas da aba passaram a paginar. O `.limit(20000)` anterior não
  vencia o limite de linhas do PostgREST, e o corte silencioso aparecia na tela
  como cliente "sem compra".

## Como aplicar

1. **Rodar a migration** — SQL Editor do Supabase
   (https://app.supabase.com/project/taicaxtjtikdajmhtsxc), colando
   `supabase/migrations/20260911130000_atacado_cliente_links.sql`.
2. **Publicar a edge function**: `supabase functions deploy sync-atacado`.
3. **Rodar o sync de pedidos** (`{ "type": "pedidos" }`). Ele reprocessa a
   planilha inteira, então o histórico é corrigido de uma vez. Confira
   `unmatched` na resposta.
4. **Publicar o front** e, na aba Revenda → Compras Mensais, abrir
   "Não vinculados" e fazer o de-para do que sobrou — normalmente nomes que o
   ERP escreve de um jeito que não lembra o cadastro
   (ex.: `BLOOM CAFE- GENILSON TEOTONIO.`).

Feito o passo 4 uma vez por cliente, o vínculo é permanente.
