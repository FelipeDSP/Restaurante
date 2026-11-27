// Endereço do restaurante numa linha, para quem vai até lá (retirada no local).
// O endereço é jsonb e vem do cadastro: qualquer campo pode estar vazio.
export function enderecoEmLinha(endereco: Record<string, string | null | undefined>): string | null {
  const rua = [endereco.rua, endereco.numero].filter((p) => p?.trim()).join(", ");
  const partes = [rua, endereco.complemento, endereco.bairro, endereco.cidade].map((p) => p?.trim()).filter(Boolean);
  if (partes.length === 0) return null;
  const uf = endereco.uf?.trim();
  return uf ? `${partes.join(" · ")} · ${uf.toUpperCase()}` : partes.join(" · ");
}

// Mesmo bairro escrito de jeitos diferentes: "São Cristóvão", "sao cristovao", "Sao  Cristovão".
// O dono digita de um jeito e o ViaCEP devolve de outro.
//
// O mesmo cálculo existe em `rest_privado.chave_bairro` (migração `taxa_por_bairro`), que é
// quem decide a taxa de verdade ao criar o pedido. Mudou aqui, muda lá.
const ACENTOS = "áàâãäéèêëíìîïóòôõöúùûüçñ";
const SEM_ACENTO = "aaaaaeeeeiiiiooooouuuucn";

export function chaveBairro(nome: string | null | undefined): string {
  return (nome ?? "")
    .toLowerCase()
    .replace(/./g, (c) => {
      const i = ACENTOS.indexOf(c);
      return i === -1 ? c : SEM_ACENTO[i];
    })
    .replace(/\s+/g, " ")
    .trim();
}
