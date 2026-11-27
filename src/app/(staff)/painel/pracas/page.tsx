import { redirect } from "next/navigation";

// Endereço antigo dos "setores da cozinha" (eram "praças"): favorito e app instalado continuam
// abrindo. O banco segue com a tabela `estacoes`.
export default function PracasPage() {
  redirect("/painel/setores");
}
