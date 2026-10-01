import type { RestauranteResumo } from "@/lib/auth/dal";

// Logo (ou inicial) + nome do restaurante, sobre a cor primária.
export function MarcaRestaurante({ restaurante }: { restaurante: RestauranteResumo }) {
  return (
    <span className="flex min-w-0 items-center gap-3">
      {restaurante.logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- logo vem do Storage do restaurante
        <img
          src={restaurante.logoUrl}
          alt=""
          className="size-9 shrink-0 rounded-md bg-white/90 object-contain"
        />
      ) : (
        <span
          aria-hidden
          className="flex size-9 shrink-0 items-center justify-center rounded-md bg-[var(--cor-secundaria)] font-semibold text-[var(--cor-secundaria-contraste)]"
        >
          {restaurante.nome.charAt(0)}
        </span>
      )}
      <span className="truncate font-semibold">{restaurante.nome}</span>
    </span>
  );
}
