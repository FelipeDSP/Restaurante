import { redirect } from "next/navigation";

// Taxa por bairro fora do ar por enquanto (só taxa fixa): quem abrir o endereço antigo vai para o delivery.
export default function BairrosPage() {
  redirect("/painel/restaurante#delivery");
}
