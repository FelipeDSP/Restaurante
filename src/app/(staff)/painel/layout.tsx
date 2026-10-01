export default function PainelLayout({ children }: LayoutProps<"/painel">) {
  return <div className="flex min-h-full flex-1 flex-col">{children}</div>;
}
