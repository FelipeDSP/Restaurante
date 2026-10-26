import { redirect } from "next/navigation";

// O app do garçom agora é o painel (abas por permissão no celular). Endereço antigo de app instalado.
export default function GarcomPage() {
  redirect("/painel/comandas");
}
