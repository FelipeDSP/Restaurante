import "server-only";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";

import { type Area, ehPapel, type Papel, podeAcessar, rotaInicial } from "@/lib/auth/papeis";
import { createClient } from "@/lib/supabase/server";

// Restaurante escolhido no seletor. Sempre revalidado contra `membros`.
export const COOKIE_RESTAURANTE = "restaurante_ativo";

export type RestauranteResumo = {
  id: string;
  slug: string;
  nome: string;
  logoUrl: string | null;
  corPrimaria: string;
  corSecundaria: string;
  fusoHorario: string;
};

export type Vinculo = {
  membroId: string;
  nome: string;
  papel: Papel;
  restaurante: RestauranteResumo;
};

export type Usuario = { id: string; email: string | null };

export const obterUsuario = cache(async (): Promise<Usuario | null> => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims?.sub) return null;
  return { id: claims.sub, email: typeof claims.email === "string" ? claims.email : null };
});

export const obterVinculos = cache(async (): Promise<Vinculo[]> => {
  const usuario = await obterUsuario();
  if (!usuario) return [];

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("membros")
    .select(
      "id, nome, papel, restaurante:restaurantes(id, slug, nome, logo_url, cor_primaria, cor_secundaria, fuso_horario, excluido_em)",
    )
    .eq("user_id", usuario.id)
    .eq("ativo", true);

  if (error) throw new Error(`Falha ao carregar vínculos: ${error.message}`);

  return data
    .flatMap((m): Vinculo[] => {
      const r = m.restaurante;
      if (!r || r.excluido_em || !ehPapel(m.papel)) return [];
      return [
        {
          membroId: m.id,
          nome: m.nome,
          papel: m.papel,
          restaurante: {
            id: r.id,
            slug: r.slug,
            nome: r.nome,
            logoUrl: r.logo_url,
            corPrimaria: r.cor_primaria,
            corSecundaria: r.cor_secundaria,
            fusoHorario: r.fuso_horario,
          },
        },
      ];
    })
    .sort((a, b) => a.restaurante.nome.localeCompare(b.restaurante.nome, "pt-BR"));
});

export type Contexto = {
  usuario: Usuario | null;
  vinculos: Vinculo[];
  ativo: Vinculo | null;
};

export const obterContexto = cache(async (): Promise<Contexto> => {
  const usuario = await obterUsuario();
  if (!usuario) return { usuario: null, vinculos: [], ativo: null };

  const vinculos = await obterVinculos();
  const escolhido = (await cookies()).get(COOKIE_RESTAURANTE)?.value;
  const ativo =
    vinculos.find((v) => v.restaurante.id === escolhido) ??
    (vinculos.length === 1 ? vinculos[0] : null);

  return { usuario, vinculos, ativo };
});

export type Acesso = Vinculo & { usuario: Usuario; vinculos: Vinculo[] };

// Para onde mandar o usuário que ainda não está numa área.
export async function destinoInicial(): Promise<string> {
  const { usuario, vinculos, ativo } = await obterContexto();
  if (!usuario) return "/login";
  if (vinculos.length === 0) return "/sem-acesso";
  if (!ativo) return "/selecionar";
  return rotaInicial(ativo.papel);
}

// Garante usuário logado, restaurante ativo e papel permitido na área; senão redireciona.
// Chamar em toda página e Server Action da área: layouts não rodam a cada navegação.
// A autorização definitiva continua sendo a RLS do banco.
export const exigirAcesso = cache(async (area: Area): Promise<Acesso> => {
  const { usuario, vinculos, ativo } = await obterContexto();
  if (!usuario) redirect("/login");
  if (vinculos.length === 0) redirect("/sem-acesso");
  if (!ativo) redirect("/selecionar");
  if (!podeAcessar(ativo.papel, area)) redirect(rotaInicial(ativo.papel));
  return { ...ativo, usuario, vinculos };
});
