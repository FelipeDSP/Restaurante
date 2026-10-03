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
