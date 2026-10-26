import { redirect } from "next/navigation";

export default async function LancarGarcomPage(props: PageProps<"/garcom/mesas/[mesaId]/lancar">) {
  const { mesaId } = await props.params;
  redirect(`/painel/comandas/${encodeURIComponent(mesaId)}/lancar`);
}
