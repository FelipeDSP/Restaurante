export default async function AcompanhamentoPedidoPage(
  props: PageProps<"/[slug]/pedido/[id]">,
) {
  const { id } = await props.params;

  return (
    <main className="mx-auto w-full max-w-2xl p-4">
      <h1 className="text-2xl font-semibold">Acompanhar pedido</h1>
      <p className="text-muted-foreground">Pedido {id}</p>
    </main>
  );
}
