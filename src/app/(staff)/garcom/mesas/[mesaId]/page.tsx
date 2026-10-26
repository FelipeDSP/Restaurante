import { redirect } from "next/navigation";

export default async function MesaGarcomPage(props: PageProps<"/garcom/mesas/[mesaId]">) {
  const { mesaId } = await props.params;
  redirect(`/painel/comandas/${encodeURIComponent(mesaId)}`);
}
