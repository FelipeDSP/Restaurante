import type { Metadata } from "next";

import { exigirDono } from "@/lib/auth/dal";
import { ConteudoAssinatura } from "@/modulos/assinatura/conteudo";

export const metadata: Metadata = { title: "Assinatura" };

export default async function AssinaturaPage() {
  const acesso = await exigirDono();
  return <ConteudoAssinatura acesso={acesso} />;
}
