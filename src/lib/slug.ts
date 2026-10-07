// Endereço do restaurante na URL (/{slug}). As mesmas regras valem no banco
// (check em restaurantes.slug e rest_privado.slug_reservado).
export const SLUG_REGEX = /^[a-z0-9]+(-[a-z0-9]+)*$/;
export const SLUG_MIN = 3;
export const SLUG_MAX = 60;

// "Brasa & Cia. do Zé" -> "brasa-cia-do-ze"
export function gerarSlug(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, SLUG_MAX)
    .replace(/-+$/, "");
}

export function slugValido(slug: string): boolean {
  return SLUG_REGEX.test(slug) && slug.length >= SLUG_MIN && slug.length <= SLUG_MAX;
}
