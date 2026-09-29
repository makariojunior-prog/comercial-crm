# Comissão de Positivação Atacado — como funciona (RH e Comercial)

**Regra padrão:** cliente indicado que chega a **3 pedidos** e **R$ 500,00** em compras (sem bonificação nem cancelados) gera **R$ 50,00** para quem indicou. O Administrador pode ajustar pedidos, total, comissão e uma **janela em dias** (meta atingida em até N dias do primeiro pedido) em *Comissões → Positivações Atacado → Regra da comissão*. Sem janela, conta todo o histórico.

## Passo a passo

**1. Comercial — cadastro do cliente**
Escolha o **Indicador** na lista de usuários (quem trouxe o cliente).

**2. Comercial — acompanhamento**
Em *Comissões → Positivações Atacado*, o cliente fica em **Em progresso** e vira **Elegível** ao bater a meta. Cada indicador vê só os próprios clientes. O Administrador vê o número de elegíveis como aviso no menu **Comissões**.

**3. Administrador — envio ao RH (só Administrador)**
Em **Elegíveis**: **Confirmar e enviar ao RH** (um cliente) ou **Enviar todos ao RH**. O sistema confere a meta de novo. Errou? **Desfazer** funciona até o RH decidir.

**4. RH — decide o que pagar**
No App RH, *Comissionamento → ★ Positivações*, há uma linha por pessoa e período. Abra a linha (▼) e use **Recusar** (com motivo) nos clientes que não devem receber. Depois **Confirmar** lança o restante na **Folha** do período. **Devolver ao CRM** desfaz a linha inteira e os clientes voltam a aguardar o Administrador.

**5. RH — estorno (se precisar depois)**
No *Histórico*, abra a linha de positivação (▼) e use **Estornar** no cliente, com motivo (ex.: inadimplência). É lançado um ajuste negativo na Folha do período atual.

**6. Comercial — arquivo**
Confirmado pelo RH, o CRM marca como **pago** automaticamente. *Arquivo* mostra pagas, **recusadas** e **estornadas** (com o motivo do RH), com os mesmos filtros do Varejo e exportação para Excel.

## Fechamento (mesmo do Varejo)
Período do dia **26 ao dia 25**, pela **data em que o Administrador envia**: até dia 25 fecha no dia 25 do mês; a partir do dia 26, no dia 25 do mês seguinte. Se o RH já fechou o período daquela pessoa, vai para o próximo.

## Pontos de atenção
- **Vínculo com o RH:** o indicador precisa estar ligado a um colaborador em *RH → Comissionamento → Vincular Usuários*. Sem vínculo, a linha chega com aviso "sem vínculo RH" e exige conferência.
- **Só Administrador confirma e só o RH decide:** as duas regras valem no banco de dados, não só na tela.
- **Positivações e Varejo somam** na Folha (só linhas confirmadas pelo RH).
- **Mudança de regra** vale para as próximas confirmações; o que já foi enviado ao RH não muda.
