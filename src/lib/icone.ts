// Endereço do ícone do restaurante (aba do navegador e app instalado).
// `v` muda quando nome, cor ou logo mudam: o navegador guarda ícones em cache por muito tempo
// e, sem isso, continuaria mostrando o ícone antigo.
export function urlIcone(
  restaurante: { id: string; nome: string; corPrimaria: string; logoUrl: string | null },
  tamanho: 180 | 192 | 512,
): string {
  const assinatura = `${restaurante.nome}|${restaurante.corPrimaria}|${restaurante.logoUrl ?? ""}`;
  let hash = 5381;
  for (let i = 0; i < assinatura.length; i++) hash = ((hash << 5) + hash + assinatura.charCodeAt(i)) | 0;
  return `/pwa/${restaurante.id}/icone/${tamanho}?v=${(hash >>> 0).toString(36)}`;
}
