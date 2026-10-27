import type { Metadata } from "next";

import { exigirPermissao } from "@/lib/auth/dal";
import { lerHorarios } from "@/lib/horarios";
import { createClient } from "@/lib/supabase/server";
import { origemDoSite } from "@/lib/url";

import { FormRestaurante } from "./form-restaurante";
import { LinkDoSite } from "./link-do-site";

export const metadata: Metadata = { title: "Restaurante" };

export default async function RestaurantePage() {
  const acesso = await exigirPermissao("painel", "restaurante");
  const supabase = await createClient();

  const { data: r, error } = await supabase
    .from("restaurantes")
    .select(
      "id, slug, nome, telefone, whatsapp, endereco, cor_primaria, cor_secundaria, logo_url, fuso_horario, horarios, aceita_delivery, pedido_minimo, tempo_estimado_entrega_min, taxa_entrega_modo, taxa_entrega_fixa, servico_percentual, couvert_valor, couvert_dias",
    )
    .eq("id", acesso.restaurante.id)
    .single();
  if (error) throw new Error(error.message);

  const endereco =
    r.endereco && typeof r.endereco === "object" && !Array.isArray(r.endereco)
      ? (r.endereco as Record<string, string | null>)
      : {};

  return (
    <main className="flex flex-col gap-6 p-4 md:p-6">
      <h1 className="sr-only">Dados e delivery</h1>
      <LinkDoSite url={`${await origemDoSite()}/${r.slug}`} />
      <FormRestaurante
        restaurante={{
          ...r,
          endereco,
          horarios: lerHorarios(r.horarios),
          taxa_entrega_modo: r.taxa_entrega_modo === "bairro" ? "bairro" : "fixa",
        }}
      />
    </main>
  );
}
