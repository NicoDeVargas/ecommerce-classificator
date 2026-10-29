"""Categorias das avaliações. Uma avaliação recebe uma só: a do problema principal."""

LABELS = {
    "atraso": "A entrega atrasou ou passou do prazo prometido, mas o produto chegou.",
    "nao_recebido": "O produto não chegou, foi extraviado ou entregue no lugar errado.",
    "defeito": "O produto chegou quebrado, avariado, com defeito ou parou de funcionar.",
    "divergente": "Veio produto errado, diferente do anunciado, incompleto ou faltando peças.",
    "atendimento": "Problema com SAC, troca, devolução, reembolso ou cancelamento.",
    "qualidade": "Insatisfação com o produto em si (qualidade baixa, não atendeu), sem defeito.",
    "elogio": "Cliente satisfeito, sem problema relevante.",
}

NAMES = list(LABELS)

# Régua: regras de desempate escritas a partir das discordâncias no conjunto de
# desenvolvimento do gabarito (gab_dev). Nunca olhei o conjunto de teste para escrevê-las.
RUBRIC = """Regras de desempate (siga nesta ordem):
1. Defeito × qualidade: "defeito" só quando o produto já chegou quebrado, avariado ou sem funcionar.
   Se funcionou e depois quebrou, falhou, enferrujou ou se mostrou frágil com o uso, é "qualidade".
   Desempenho fraco (som baixo, GPS ruim, pouca potência) também é "qualidade".
2. Atraso × não recebido: se, no momento da avaliação, o produto ainda não chegou, é "nao_recebido",
   mesmo que o cliente fale em "atraso". "atraso" é só quando chegou, mas depois do prazo.
3. Avaliação no geral positiva, com uma ressalva pequena ("bom produto, mas o áudio é fraco",
   "gostei, só o frete é caro"), é "elogio".
4. Quando há um problema com o produto e depois uma reclamação de troca ou suporte, vale o problema
   original (por exemplo "defeito"). Use "atendimento" quando a queixa central é a loja não resolver,
   não orientar ou não responder.
5. "divergente" é quando o produto não corresponde ao anunciado (especificação, medida, cheiro,
   função prometida) ou veio errado ou incompleto. Falta de um recurso que o anúncio não prometia é "qualidade".
6. Se houver vários problemas, vale o do título da avaliação."""
