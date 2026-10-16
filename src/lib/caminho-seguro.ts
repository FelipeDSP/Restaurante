// Caminho interno para onde mandar a pessoa depois do login ou do link do e-mail.
// Recusa tudo que o navegador possa entender como outro site: "//x", "/\x" e também
// tab/quebra de linha ("/\t/x" vira "//x" no parser de URL).
export function caminhoInterno(next: string | null | undefined, padrao: string): string {
  if (!next || !next.startsWith("/") || /[\u0000-\u001f\u007f\\]/.test(next)) return padrao;
  const base = "https://interno.invalid";
  try {
    const url = new URL(next, base);
    if (url.origin !== base) return padrao;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return padrao;
  }
}
