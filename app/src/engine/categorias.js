// Categorias do modelo (mesma ordem de ml/labels.py) e o que o vendedor faz com cada uma.

export const CATEGORIAS = [
  'atraso',
  'nao_recebido',
  'defeito',
  'divergente',
  'atendimento',
  'qualidade',
  'elogio',
];

export const NOME = {
  atraso: 'Atraso',
  nao_recebido: 'Não recebido',
  defeito: 'Defeito',
  divergente: 'Diferente do anúncio',
  atendimento: 'Atendimento',
  qualidade: 'Qualidade',
  elogio: 'Elogio',
};

export const DESCRICAO = {
  atraso: 'Chegou, mas depois do prazo.',
  nao_recebido: 'Não chegou, extraviou ou foi entregue no lugar errado.',
  defeito: 'Chegou quebrado, avariado ou sem funcionar.',
  divergente: 'Veio errado, incompleto ou diferente do anunciado.',
  atendimento: 'SAC, troca, devolução, reembolso ou cancelamento.',
  qualidade: 'Funcionou, mas decepcionou ou durou pouco.',
  elogio: 'Cliente satisfeito.',
};

// Prioridade na fila de respostas: menor número = responder antes. Elogio fica fora da fila.
export const PRIORIDADE = {
  nao_recebido: 1,
  defeito: 2,
  atendimento: 3,
  divergente: 4,
  atraso: 5,
  qualidade: 6,
};

export const URGENTES = new Set(['nao_recebido', 'defeito', 'atendimento']);

// Rascunhos de resposta por categoria (modelos de texto, sem LLM). {produto} é trocado pelo nome.
export const MODELOS_RESPOSTA = {
  nao_recebido:
    'Olá! Sentimos muito que o seu pedido{produto_de} ainda não tenha chegado. Já abrimos uma verificação com a transportadora e vamos te responder em até 24 horas com a posição da entrega. Se preferir, chame a gente pelo SAC com o número do pedido para acompanhar de perto. Se o produto não for localizado, você recebe um novo envio ou o reembolso integral, como preferir.',
  defeito:
    'Olá! Lamentamos muito que {produto_o} tenha chegado com defeito. Você tem direito à troca ou ao reembolso sem custo: basta responder por aqui ou falar com o SAC informando o número do pedido e, se puder, uma foto do problema. A coleta é por nossa conta. Também repassamos o caso ao fornecedor para evitar que se repita.',
  atendimento:
    'Olá! Pedimos desculpas pela demora e pela dificuldade em resolver o seu caso. Um atendente vai assumir o seu atendimento e entrar em contato em até 1 dia útil, com uma solução e um prazo claro. Se puder, responda com o número do pedido para agilizarmos.',
  divergente:
    'Olá! Obrigado por avisar, e desculpe pelo transtorno: {produto_o} não deveria ter chegado diferente do que está no anúncio. Você pode trocar ou devolver sem custo pelo SAC, com o número do pedido. Já estamos revisando as informações do anúncio para corrigir o que estiver errado.',
  atraso:
    'Olá! Obrigado pela avaliação, e desculpe pelo atraso na entrega. Sabemos que o prazo é importante e estamos revendo o processo com a transportadora da sua região. Se precisar de qualquer coisa com o produto, conte com a gente pelo SAC.',
  qualidade:
    'Olá! Obrigado pelo retorno sincero. Sentimos muito que {produto_o} não tenha atendido às suas expectativas. Se estiver dentro do prazo de garantia, podemos analisar troca ou reparo: é só falar com o SAC informando o número do pedido. Sua avaliação foi repassada ao fornecedor.',
  elogio:
    'Olá! Muito obrigado pela avaliação. Ficamos felizes que tenha gostado. Conte com a gente nas próximas compras!',
};

function curto(produto) {
  if (!produto) return '';
  const p = String(produto).trim();
  return p.length > 60 ? p.slice(0, 57).trimEnd() + '…' : p;
}

export function rascunho(categoria, produto) {
  const p = curto(produto);
  return MODELOS_RESPOSTA[categoria]
    .replace('{produto_de}', p ? ` (${p})` : '')
    .replace('{produto_o}', p ? `o produto (${p})` : 'o produto');
}
