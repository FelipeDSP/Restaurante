// Dinheiro é sempre inteiro em centavos; formatação só na interface.

const formatador = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export function formatarBRL(centavos: number): string {
  return formatador.format(centavos / 100);
}

// "12,50" | "12.50" | "1.234,56" | "R$ 8" -> centavos. null se inválido.
export function centavosDeTexto(texto: string): number | null {
  const limpo = texto.replace(/[R$\s]/g, "");
  if (!/^\d{1,3}(\.\d{3})*(,\d{1,2})?$|^\d+([.,]\d{1,2})?$/.test(limpo)) return null;

  // Vírgula é o separador decimal; pontos antes dela (ou em grupos de 3) são de milhar.
  const normalizado = limpo.includes(",")
    ? limpo.replace(/\./g, "").replace(",", ".")
    : /^\d{1,3}(\.\d{3})+$/.test(limpo)
      ? limpo.replace(/\./g, "")
      : limpo;
  const valor = Math.round(Number(normalizado) * 100);
  return Number.isFinite(valor) ? valor : null;
}

// Valor para preencher um campo de texto ("12,50").
export function textoDeCentavos(centavos: number): string {
  return (centavos / 100).toFixed(2).replace(".", ",");
}
