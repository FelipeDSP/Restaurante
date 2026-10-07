"use client";

import { TriangleAlert } from "lucide-react";

import { corDeContraste, corParaTexto, razaoContraste } from "@/lib/cores";

// Prévia ao vivo de como a marca aparece no site de delivery, com aviso quando o texto
// sobre a cor escolhida fica pouco legível (o sistema já escolhe preto ou branco, mas
// tons médios demais não ficam bons com nenhum dos dois).
export function PreviaMarca({
  nome,
  logoUrl,
  corPrimaria,
  corSecundaria,
}: {
  nome: string;
  logoUrl: string | null;
  corPrimaria: string;
  corSecundaria: string;
}) {
  const textoPrimaria = corDeContraste(corPrimaria);
  const textoSecundaria = corDeContraste(corSecundaria);
  const contraste = razaoContraste(corPrimaria, textoPrimaria);
  const contrasteDestaque = razaoContraste(corSecundaria, textoSecundaria);

  return (
    <div className="flex flex-col gap-3 sm:col-span-2">
      <p className="text-sm font-medium">Prévia</p>
      <div aria-hidden className="max-w-sm overflow-hidden rounded-xl border bg-[#f6f3ef]">
        <div className="flex items-center gap-2.5 px-4 py-3" style={{ backgroundColor: corPrimaria, color: textoPrimaria }}>
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- logo do Storage do restaurante
            <img src={logoUrl} alt="" className="h-9 w-auto max-w-32 shrink-0 rounded-md bg-white/90 object-contain p-0.5" />
          ) : (
            <span
              className="flex size-9 shrink-0 items-center justify-center rounded-md font-bold"
              style={{ backgroundColor: corSecundaria, color: textoSecundaria }}
            >
              {(nome.trim()[0] ?? "R").toUpperCase()}
            </span>
          )}
          <span className="truncate font-bold">{nome}</span>
        </div>
        <div className="flex flex-col gap-2 p-3">
          <div className="flex items-center justify-between gap-2 rounded-lg bg-white p-3 shadow-sm">
            <span className="flex flex-col text-sm">
              <span className="font-medium text-neutral-900">Seu produto</span>
              <span className="text-neutral-500">R$ 25,00</span>
            </span>
            <span className="rounded-full px-3 py-1.5 text-xs font-bold" style={{ backgroundColor: corPrimaria, color: textoPrimaria }}>
              + Adicionar
            </span>
          </div>
          <span className="text-sm font-medium underline" style={{ color: corParaTexto(corPrimaria) }}>
            Falar no WhatsApp
          </span>
        </div>
      </div>
      {contraste < 4.5 || contrasteDestaque < 3 ? (
        <p role="status" className="flex max-w-sm items-start gap-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          {contraste < 4.5
            ? "Com essa cor principal, o texto dos botões fica pouco legível. Escolha um tom mais claro ou mais escuro."
            : "A cor de destaque está pouco legível com texto por cima. Escolha um tom mais claro ou mais escuro."}
        </p>
      ) : null}
    </div>
  );
}
