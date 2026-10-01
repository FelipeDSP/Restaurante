// Layout mobile-first do PWA do garçom.
export default function GarcomLayout({ children }: LayoutProps<"/garcom">) {
  return (
    <div className="mx-auto flex min-h-full w-full max-w-md flex-1 flex-col">
      {children}
    </div>
  );
}
