"use client";

import { Copy, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { mensagemFalhaRede } from "@/components/staff/acoes-cliente";
import { FUSOS } from "@/lib/horarios";
import { gerarSlug } from "@/lib/slug";

import { criarRestaurante } from "../../gestao-actions";

const CAMPO =
  "h-11 w-full rounded-lg border border-black/10 bg-[#f6f1ea]/60 px-3 text-sm outline-none focus:border-uau-laranja focus:ring-2 focus:ring-uau-laranja/30";

// Cadastro de restaurante pelo admin, já com a conta do dono (senha gerada, mostrada uma vez).
export function NovoRestaurante() {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [nome, setNome] = useState("");
  const [slug, setSlug] = useState("");
  const [slugMexido, setSlugMexido] = useState(false);
  const [nomeDono, setNomeDono] = useState("");
  const [emailDono, setEmailDono] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [fuso, setFuso] = useState("America/Sao_Paulo");
  const [criado, setCriado] = useState<{ id: string; email: string; senha?: string } | null>(null);
  const [enviando, iniciar] = useTransition();

  function criar() {
    iniciar(async () => {
      try {
        const r = await criarRestaurante({ nome, slug, nomeDono, emailDono, whatsapp, fuso });
        if (!r.ok || !r.restauranteId) {
          toast.error(r.mensagem);
          return;
        }
        toast.success(r.mensagem);
        setCriado({ id: r.restauranteId, email: emailDono.trim().toLowerCase(), senha: r.senha });
      } catch {
        toast.error(mensagemFalhaRede());
      }
    });
  }

  if (criado) {
    return (
      <div className="flex flex-col gap-3 rounded-2xl border-2 border-uau-laranja bg-white p-5 shadow-sm">
        <p className="font-black">Restaurante criado</p>
        {criado.senha ? (
          <>
            <p className="text-sm">
              Acesso do dono: <strong>{criado.email}</strong> · senha <span className="font-mono text-base tracking-wider">{criado.senha}</span>
            </p>
            <p className="text-xs text-uau-marrom-claro">A senha só aparece agora. O dono entra em /login.</p>
          </>
        ) : (
          <p className="text-sm">O dono ({criado.email}) já tinha conta e entra com a senha dele.</p>
        )}
        <div className="flex flex-wrap gap-2">
          {criado.senha ? (
            <button
              type="button"
              onClick={() => navigator.clipboard.writeText(`E-mail: ${criado.email}\nSenha: ${criado.senha}`).then(() => toast.success("Copiado."))}
              className="flex h-10 items-center gap-1.5 rounded-lg border border-black/10 px-3 text-sm font-bold hover:bg-uau-marrom/5"
            >
              <Copy className="size-4" aria-hidden /> Copiar acesso
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => router.push(`/admin/restaurantes/${criado.id}`)}
            className="h-10 rounded-lg bg-uau-marrom px-4 text-sm font-bold text-uau-creme hover:opacity-90"
          >
            Abrir a ficha
          </button>
        </div>
      </div>
    );
  }

  if (!aberto) {
    return (
      <button
        type="button"
        onClick={() => setAberto(true)}
        className="flex min-h-11 items-center gap-2 rounded-xl bg-uau-laranja px-4 text-sm font-black text-uau-marrom hover:opacity-90"
      >
        <Plus className="size-4" aria-hidden />
        Novo restaurante
      </button>
    );
  }

  return (
    <div className="flex w-full flex-col gap-3 rounded-2xl border border-black/5 bg-white p-5 shadow-sm">
      <p className="font-black">Novo restaurante</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm font-bold">
          Nome do restaurante
          <input
            value={nome}
            onChange={(e) => {
              setNome(e.target.value);
              if (!slugMexido) setSlug(gerarSlug(e.target.value));
            }}
            maxLength={80}
            className={CAMPO}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm font-bold">
          Endereço do site
          <input
            value={slug}
            onChange={(e) => {
              setSlug(e.target.value.toLowerCase());
              setSlugMexido(true);
            }}
            maxLength={40}
            className={CAMPO}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm font-bold">
          Nome do dono
          <input value={nomeDono} onChange={(e) => setNomeDono(e.target.value)} maxLength={80} className={CAMPO} />
        </label>
        <label className="flex flex-col gap-1 text-sm font-bold">
          E-mail do dono
          <input value={emailDono} onChange={(e) => setEmailDono(e.target.value)} type="email" className={CAMPO} />
        </label>
        <label className="flex flex-col gap-1 text-sm font-bold">
          WhatsApp (opcional)
          <input value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} inputMode="tel" maxLength={20} className={CAMPO} />
        </label>
        <label className="flex flex-col gap-1 text-sm font-bold">
          Fuso horário
          <select value={fuso} onChange={(e) => setFuso(e.target.value)} className={CAMPO}>
            {FUSOS.map((f) => (
              <option key={f.valor} value={f.valor}>
                {f.rotulo}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="flex justify-end gap-2">
        <button type="button" onClick={() => setAberto(false)} className="h-10 rounded-lg border border-black/10 px-4 text-sm font-bold hover:bg-uau-marrom/5">
          Cancelar
        </button>
        <button
          type="button"
          onClick={criar}
          disabled={enviando || !nome.trim() || !slug || !nomeDono.trim() || !emailDono.trim()}
          className="h-10 rounded-lg bg-uau-marrom px-4 text-sm font-bold text-uau-creme hover:opacity-90 disabled:opacity-50"
        >
          {enviando ? "Criando..." : "Criar restaurante"}
        </button>
      </div>
    </div>
  );
}
