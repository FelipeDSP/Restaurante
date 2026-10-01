import { redirect } from "next/navigation";

import { destinoInicial } from "@/lib/auth/dal";

// Decide a área do usuário após o login (painel, garçom, seletor ou sem acesso).
export default async function InicioPage() {
  redirect(await destinoInicial());
}
