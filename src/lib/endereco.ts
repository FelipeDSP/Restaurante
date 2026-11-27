// Endereço do restaurante numa linha, para quem vai até lá (retirada no local).
// O endereço é jsonb e vem do cadastro: qualquer campo pode estar vazio.
export function enderecoEmLinha(endereco: Record<string, string | null | undefined>): string | null {
  const rua = [endereco.rua, endereco.numero].filter((p) => p?.trim()).join(", ");
  const partes = [rua, endereco.complemento, endereco.bairro, endereco.cidade].map((p) => p?.trim()).filter(Boolean);
  if (partes.length === 0) return null;
  const uf = endereco.uf?.trim();
  return uf ? `${partes.join(" · ")} · ${uf.toUpperCase()}` : partes.join(" · ");
}
