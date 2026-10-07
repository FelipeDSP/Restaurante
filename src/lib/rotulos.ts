export const FORMAS_PAGAMENTO = [
  { valor: "dinheiro", rotulo: "Dinheiro" },
  { valor: "pix", rotulo: "Pix" },
  { valor: "credito", rotulo: "Crédito" },
  { valor: "debito", rotulo: "Débito" },
  { valor: "outro", rotulo: "Outro" },
] as const;

export const NOME_FORMA: Record<string, string> = Object.fromEntries(FORMAS_PAGAMENTO.map((f) => [f.valor, f.rotulo]));

export const NOME_ORIGEM: Record<string, string> = {
  mesa: "Mesas",
  delivery: "Delivery",
  balcao: "Balcão",
};

export function nomeForma(forma: string): string {
  return NOME_FORMA[forma] ?? forma;
}

export function nomeOrigem(origem: string): string {
  return NOME_ORIGEM[origem] ?? origem;
}

// Nomes de status iguais em todas as telas (cliente, caixa, cozinha, garçom).
export const NOME_STATUS_PEDIDO: Record<string, string> = {
  recebido: "Novo",
  em_preparo: "Em preparo",
  pronto: "Pronto",
  saiu_entrega: "Saiu para entrega",
  entregue: "Entregue",
  cancelado: "Cancelado",
};

export const NOME_STATUS_MESA: Record<string, string> = {
  livre: "Livre",
  aberta: "Ocupada",
  conta_pedida: "Conta pedida",
};

export function nomeStatusPedido(status: string): string {
  return NOME_STATUS_PEDIDO[status] ?? status;
}
