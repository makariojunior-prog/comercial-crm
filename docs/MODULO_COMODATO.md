# Módulo Comodato — guia de uso

Controle dos equipamentos que cedemos a clientes: onde cada um está, sob qual contrato,
o que está livre para alocar e o que precisa de manutenção.

O racional do desenho está em [`BENCHMARK_COMODATO.md`](./BENCHMARK_COMODATO.md).

---

## Como aplicar

Duas migrations, nesta ordem:

```
supabase/migrations/20260911120000_comodato_module.sql        -- tabelas, triggers, views, RLS
supabase/migrations/20260911120100_comodato_migrar_legado.sql -- converte o texto livre existente
```

A segunda executa a conversão automaticamente ao ser aplicada. Ela é **idempotente**: clientes
que já têm contrato de origem `legado` são ignorados, então reaplicar não duplica nada.

Depois de uma nova sincronização com a planilha (que pode trazer texto livre em clientes novos),
basta rodar de novo:

```sql
SELECT * FROM public.comodato_migrar_legado();
```

Retorna: `clientes_migrados, contratos_criados, modelos_criados, equipamentos_criados, clientes_sem_parse`.

### Permissão

O módulo é `comodato` em `ALL_MODULES`. Admin já enxerga; para os demais, marque o módulo em
**Usuários → permissões**.

---

## O que a migração faz com o campo livre

Exemplos reais de conversão:

| Texto no cadastro | Vira |
|---|---|
| `FREEZER FRICON 450LT, ARMÁRIO VAZIO 58X70` | 2 unidades: `FRZ-0007` + `ARM-0001` |
| `2 FREEZER FRICON 450LT` | 2 unidades do mesmo modelo: `FRZ-0002`, `FRZ-0003` |
| `3X FREEZER FRICON 450LT` | 3 unidades |
| `FORNO TURBO 10 ESTEIRAS + ARMARIO 1,20M` | 2 unidades — a vírgula de `1,20M` **não** separa |
| `EXPOSITOR / ESTUFA 5 BANDEJAS; VITRINE` | 3 unidades |
| `SIM`, `-`, `0` | nada — vai para a fila de revisão |

Regras aplicadas:

- **Separadores**: `;` `+` `/` quebra de linha, e vírgula **não seguida de dígito** (preserva medidas).
- **Quantidade**: prefixo numérico (`2 `, `3X `, `2 UN `) expande em N unidades independentes.
- **Categoria**: por palavra-chave (FREEZER, ARMARIO, FORNO, EXPOSITOR, ESTUFA, BALCAO, VITRINE,
  GELADEIRA, MASSEIRA, CILINDRO, FRITADEIRA, MICROONDAS); o resto cai em OUTROS.
- **Patrimônio**: gerado por categoria — `FRZ-0001`, `ARM-0002`, `FOR-0003`…
- **Valor**: o campo "Valor do Comodato" vira `valor_total_bens` do contrato e é **rateado** entre
  as unidades (toda unidade importada nasce marcada para revisão, então o rateio é transparente).
- **Contrato**: um por cliente, criado como `pendente_assinatura` com `contrato_assinado = false` —
  porque de fato não sabemos se existe contrato assinado. Aparece como pendência no painel.
- **Data de entrega**: vem de `atacado_clientes.comodato_data` quando o ERP tem; senão, a data da migração.
- **ERP**: se a tabela `atacado_clientes` existir, `comodato`, `comodato_valor`, `comodato_data` e
  `comodato_obs` enriquecem o contrato. Clientes que só existem no ERP entram na fila de revisão.

### Nada é perdido

O texto original vai para `crm_clients.comodato_legado` antes de qualquer reescrita, e aparece no
cadastro do cliente sob "Ver o texto livre original".

### Fila de revisão

A aba **Revisão** (só aparece enquanto houver pendências) lista:

| Pendência | O que fazer |
|---|---|
| `conferir unidade` | Abrir e preencher número de série, valor real e estado; depois desmarcar "Pendente de revisão" |
| `texto não interpretado` | O texto não continha equipamento reconhecível — lançar à mão se for o caso |
| `cliente só no ERP` | Cliente com comodato no ERP que não existe no CRM — cadastrar o cliente e rodar a migração de novo |

Consulta direta:

```sql
SELECT * FROM public.comodato_revisao_importacao ORDER BY tipo_pendencia, client_nome;
```

---

## Integração com o cadastro do cliente

O campo livre "Equipamentos em Comodato" foi substituído por um painel estruturado dentro do
`ClientModal`: lista das unidades, contrato com status de assinatura e vencimento, e botões de
alocar e devolver. É o mesmo dado do módulo — mexeu num lado, aparece no outro.

`crm_clients.comodato` continua existindo, mas agora é um **espelho gerado** por trigger
(`FRZ-0012 FREEZER FRICON 450LT, ARM-0003 ARMÁRIO 58X70`) e `crm_clients.valor` recebe a soma dos
bens. Isso mantém listagens, exports e integrações antigas funcionando.

**Consequência importante:** a sincronização com a planilha do Google não sobrescreve mais
`comodato` nem `valor` de clientes que já têm alocação ativa — senão o texto da planilha apagaria o
espelho. Para clientes sem alocação, o comportamento é o de antes.

---

## Operação do dia a dia

| Situação | Onde |
|---|---|
| Entregar um freezer num cliente novo | **Disponíveis** → Alocar, ou direto no cadastro do cliente |
| Recolher equipamento de cliente perdido | Cadastro do cliente → ícone de devolução, ou **Equipamentos** |
| Saber o que posso entregar hoje | **Disponíveis** (ordenado pelo que está parado há mais tempo) |
| Abrir chamado de manutenção | **Manutenções** → Nova OS, ou o ícone de chave na unidade |
| Ver quem está sem contrato assinado | **Painel** → Risco contratual |
| Comprar ou não mais um freezer | **Painel** → Capital ocioso |

### Ciclo de vida da unidade

```
disponivel ──alocar──> em_comodato ──devolver──> disponivel
     │                                               │
     └──────── OS em andamento ──> manutencao ───────┘
                                        │
                                     baixado
```

As triggers cuidam disso: você nunca edita `situacao` na mão. Alocar cria a linha em
`comodato_alocacoes`; devolver **encerra** a linha sem apagá-la — o histórico de custódia de cada
equipamento fica preservado para sempre.

Um equipamento não pode ter duas alocações ativas: o banco recusa (índice único parcial). Se o
freezer vai trocar de cliente, registre a devolução primeiro.

### Manutenção preventiva

Defina `manutencao_intervalo_meses` no modelo (herdado pelas unidades novas) ou direto na unidade.
Ao concluir uma OS, `proxima_manutencao` é recalculada **a partir da data real de conclusão**
(recorrência flutuante). Unidades vencidas ou a vencer em 30 dias, e sem OS aberta, aparecem em
"Preventivas a programar".

### Notas fiscais

A alocação guarda `nf_remessa` (CFOP 5908/6908) e a devolução guarda `nf_retorno` (5909/6909).
O módulo registra o número — a emissão continua no ERP.

---

## Estrutura

| Tabela | Papel |
|---|---|
| `comodato_modelos` | Catálogo: FREEZER FRICON 450L |
| `comodato_equipamentos` | A unidade física, com patrimônio e série |
| `comodato_contratos` | O acordo com o cliente (assinatura, prazo, contrapartida) |
| `comodato_alocacoes` | Livro-razão de custódia, append-only |
| `comodato_manutencoes` | Ordens de serviço |

| View | Para quê |
|---|---|
| `comodato_equipamentos_view` | Unidade + modelo + cliente + contrato + flags de alerta |
| `comodato_resumo_cliente` | Uma linha por cliente que detém equipamento hoje |
| `comodato_revisao_importacao` | Fila de conferência pós-migração |

RLS segue o padrão do CRM: `FOR ALL TO authenticated`, sem acesso anônimo.
