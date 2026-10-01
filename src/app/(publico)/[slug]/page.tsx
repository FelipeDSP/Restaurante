export default async function CardapioPage(props: PageProps<"/[slug]">) {
  const { slug } = await props.params;

  return (
    <main className="mx-auto w-full max-w-2xl p-4">
      <h1 className="text-2xl font-semibold">Cardápio</h1>
      <p className="text-muted-foreground">Restaurante: {slug}</p>
    </main>
  );
}
