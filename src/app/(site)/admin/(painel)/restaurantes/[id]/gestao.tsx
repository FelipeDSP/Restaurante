"use client";

import { Copy, KeyRound, LogIn, Pencil, UserPlus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { mensagemFalhaRede, useAcao } from "@/components/staff/acoes-cliente";
import { BotaoConfirmar } from "@/components/staff/botao-confirmar";
import { cn } from "@/lib/utils";

import type { EquipeAdmin, IdModulo } from "../../../dados";
import { adicionarPessoa, definirModulos, entrarComo, salvarPessoa, trocarSenha } from "../../../gestao-actions";

const CAMPO =
  "h-10 w-full rounded-lg border border-black/10 bg-[#f6f1ea]/60 px-3 text-sm outline-none focus:border-uau-laranja focus:ring-2 focus:ring-uau-laranja/30";
const BOTAO = "h-10 rounded-lg bg-uau-marrom px-4 text-sm font-bold text-uau-creme hover:opacity-90 disabled:opacity-50";
const BOTAO_CLARO = "h-10 rounded-lg border border-black/10 px-3 text-sm font-bold hover:bg-uau-marrom/5 disabled:opacity-50";

// Senha gerada: aparece uma vez, com botão de copiar, para mandar à pessoa.
function SenhaGerada({ email, senha, aoFechar }: { email: string; senha: string; aoFechar: () => void }) {
  async function copiar() {
    try {
      await navigator.clipboard.writeText(`E-mail: ${email}\nSenha: ${senha}`);
      toast.success("Copiado.");
    } catch {
      toast.error("Não foi possível copiar.");
    }
  }
  return (
    <div className="flex flex-col gap-2 rounded-xl border-2 border-uau-laranja bg-uau-laranja/10 p-3 text-sm">
      <p className="font-bold">Senha de {email}</p>
      <p className="font-mono text-lg tracking-wider">{senha}</p>
      <p className="text-xs text-uau-marrom-claro">Ela só aparece agora. Depois a pessoa pode trocar em Esqueci minha senha.</p>
      <div className="flex gap-2">
        <button type="button" onClick={copiar} className={cn(BOTAO_CLARO, "flex items-center gap-1.5")}>
          <Copy className="size-4" aria-hidden /> Copiar e-mail e senha
        </button>
        <button type="button" onClick={aoFechar} className={BOTAO_CLARO}>
          Fechar
        </button>
      </div>
    </div>
  );
}

const MODULOS: { id: IdModulo; nome: string }[] = [
  { id: "mesas", nome: "Mesas pelo caixa" },
  { id: "garcom", nome: "App do garçom" },
  { id: "qr", nome: "Pedido pelo QR da mesa" },
  { id: "cozinha", nome: "Tela da cozinha e impressão" },
  { id: "relatorios", nome: "Relatórios" },
  { id: "cupons", nome: "Cupons" },
  { id: "entregadores", nome: "Entregadores" },
];

type Escolha = "plano" | "liberado" | "bloqueado";

// Cada módulo: segue o plano (padrão), liberado ou bloqueado só para este restaurante.
export function Modulos({ restauranteId, modulos }: { restauranteId: string; modulos: NonNullable<EquipeAdmin["modulos"]> }) {
  const inicial = Object.fromEntries(
    MODULOS.map((m) => [m.id, modulos.liberados.includes(m.id) ? "liberado" : modulos.bloqueados.includes(m.id) ? "bloqueado" : "plano"]),
  ) as Record<IdModulo, Escolha>;
  const [escolhas, setEscolhas] = useState(inicial);
  const { executar, pendente } = useAcao();
  const mudou = MODULOS.some((m) => escolhas[m.id] !== inicial[m.id]);

  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-col divide-y divide-black/5">
        {MODULOS.map((m) => {
          const vale = modulos.efetivos.includes(m.id);
          return (
            <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
              <span className="flex items-center gap-2 text-sm font-bold">
                <span aria-hidden className={cn("size-2.5 rounded-full", vale ? "bg-green-600" : "bg-zinc-300")} />
                {m.nome}
              </span>
              <span className="flex rounded-lg border border-black/10 p-0.5 text-xs font-bold" role="group" aria-label={m.nome}>
                {(["plano", "liberado", "bloqueado"] as const).map((e) => (
                  <button
                    key={e}
                    type="button"
                    aria-pressed={escolhas[m.id] === e}
                    onClick={() => setEscolhas((x) => ({ ...x, [m.id]: e }))}
                    className={cn(
                      "rounded-md px-2.5 py-1.5",
                      escolhas[m.id] === e
                        ? e === "liberado"
                          ? "bg-green-600 text-white"
                          : e === "bloqueado"
                            ? "bg-red-600 text-white"
                            : "bg-uau-marrom text-uau-creme"
                        : "text-uau-marrom-claro hover:bg-uau-marrom/5",
                    )}
                  >
                    {e === "plano" ? "Pelo plano" : e === "liberado" ? "Liberado" : "Bloqueado"}
                  </button>
                ))}
              </span>
            </li>
          );
        })}
      </ul>
      <p className="text-xs text-uau-marrom-claro">Bolinha verde: o módulo está valendo agora (no teste grátis, tudo vale, exceto o que estiver bloqueado).</p>
      <button
        type="button"
        disabled={!mudou || pendente}
        onClick={() =>
          executar(() =>
            definirModulos(
              restauranteId,
              MODULOS.filter((m) => escolhas[m.id] === "liberado").map((m) => m.id),
              MODULOS.filter((m) => escolhas[m.id] === "bloqueado").map((m) => m.id),
            ),
          )
        }
        className={cn(BOTAO, "self-end")}
      >
        Salvar módulos
      </button>
    </div>
  );
}

function SeletorFuncao({ valor, aoMudar, funcoes }: { valor: string; aoMudar: (v: string) => void; funcoes: EquipeAdmin["funcoes"] }) {
  return (
    <select value={valor} onChange={(e) => aoMudar(e.target.value)} className={CAMPO} aria-label="Função">
      <option value="" disabled>
        Escolha a função
      </option>
      <option value="dono">Dono</option>
      {funcoes.map((f) => (
        <option key={f.id} value={f.id}>
          {f.nome}
        </option>
      ))}
    </select>
  );
}

type Membro = EquipeAdmin["membros"][number];

function LinhaMembro({ restauranteId, m, funcoes }: { restauranteId: string; m: Membro; funcoes: EquipeAdmin["funcoes"] }) {
  const [editando, setEditando] = useState(false);
  const [nome, setNome] = useState(m.nome);
  const [funcao, setFuncao] = useState(m.papel === "dono" ? "dono" : (m.funcao_id ?? ""));
  const [senha, setSenha] = useState<string | null>(null);
  const [trocando, iniciar] = useTransition();
  const { executar, pendente } = useAcao();

  function novaSenha() {
    iniciar(async () => {
      try {
        const r = await trocarSenha(restauranteId, m.user_id, m.email ?? "");
        if (r.ok && r.senha) setSenha(r.senha);
        else toast.error(r.mensagem);
      } catch {
        toast.error(mensagemFalhaRede());
      }
    });
  }

  return (
    <li className={cn("flex flex-col gap-2 py-3", !m.ativo && "opacity-60")}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <span className="min-w-0">
          <span className="block font-bold">
            {m.nome}
            {!m.ativo ? <span className="ml-2 text-xs font-normal">(desativado)</span> : null}
          </span>
          <span className="block truncate text-xs text-uau-marrom-claro">{m.email ?? "—"}</span>
          <span className="text-xs text-uau-marrom-claro">
            {m.papel === "dono" ? "Dono" : (m.funcao ?? m.papel)} · {m.ultimo_acesso ? `entrou ${new Date(m.ultimo_acesso).toLocaleDateString("pt-BR")}` : "nunca entrou"}
          </span>
        </span>
        <span className="flex gap-1">
          <button type="button" onClick={() => setEditando((e) => !e)} className={cn(BOTAO_CLARO, "flex items-center gap-1")} aria-label={`Editar ${m.nome}`}>
            <Pencil className="size-3.5" aria-hidden /> Editar
          </button>
          <button type="button" onClick={novaSenha} disabled={trocando} className={cn(BOTAO_CLARO, "flex items-center gap-1")} aria-label={`Nova senha para ${m.nome}`}>
            <KeyRound className="size-3.5" aria-hidden /> {trocando ? "..." : "Nova senha"}
          </button>
        </span>
      </div>
      {senha ? <SenhaGerada email={m.email ?? ""} senha={senha} aoFechar={() => setSenha(null)} /> : null}
      {editando ? (
        <div className="flex flex-col gap-2 rounded-xl bg-[#f6f1ea]/70 p-3">
          <div className="grid gap-2 sm:grid-cols-2">
            <input value={nome} onChange={(e) => setNome(e.target.value)} maxLength={120} className={CAMPO} aria-label="Nome" />
            <SeletorFuncao valor={funcao} aoMudar={setFuncao} funcoes={funcoes} />
          </div>
          <div className="flex flex-wrap justify-between gap-2">
            {m.ativo ? (
              <BotaoConfirmar
                rotulo={`Desativar ${m.nome}`}
                confirmar="Desativar acesso"
                icone={false}
                desabilitado={pendente}
                aoConfirmar={() => executar(() => salvarPessoa(m.id, { nome, funcao, ativo: false }), () => setEditando(false))}
              >
                Desativar acesso
              </BotaoConfirmar>
            ) : (
              <button
                type="button"
                disabled={pendente}
                onClick={() => executar(() => salvarPessoa(m.id, { nome, funcao, ativo: true }), () => setEditando(false))}
                className={BOTAO_CLARO}
              >
                Reativar acesso
              </button>
            )}
            <button
              type="button"
              disabled={pendente || !nome.trim() || !funcao}
              onClick={() => executar(() => salvarPessoa(m.id, { nome, funcao, ativo: m.ativo }), () => setEditando(false))}
              className={BOTAO}
            >
              Salvar
            </button>
          </div>
        </div>
      ) : null}
    </li>
  );
}

export function Equipe({ restauranteId, equipe }: { restauranteId: string; equipe: EquipeAdmin }) {
  const [aberto, setAberto] = useState(false);
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [funcao, setFuncao] = useState("");
  const [senha, setSenha] = useState<{ email: string; senha: string } | null>(null);
  const [enviando, iniciar] = useTransition();

  function adicionar() {
    iniciar(async () => {
      try {
        const r = await adicionarPessoa(restauranteId, { nome, email, funcao });
        if (!r.ok) {
          toast.error(r.mensagem);
          return;
        }
        toast.success(r.mensagem);
        if (r.senha) setSenha({ email: email.trim().toLowerCase(), senha: r.senha });
        setNome("");
        setEmail("");
        setFuncao("");
        setAberto(false);
      } catch {
        toast.error(mensagemFalhaRede());
      }
    });
  }

  return (
    <div className="flex flex-col gap-3">
      {senha ? <SenhaGerada email={senha.email} senha={senha.senha} aoFechar={() => setSenha(null)} /> : null}
      {aberto ? (
        <div className="flex flex-col gap-2 rounded-xl bg-[#f6f1ea]/70 p-3">
          <div className="grid gap-2 sm:grid-cols-3">
            <input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Nome" maxLength={120} className={CAMPO} aria-label="Nome" />
            <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="E-mail" type="email" className={CAMPO} aria-label="E-mail" />
            <SeletorFuncao valor={funcao} aoMudar={setFuncao} funcoes={equipe.funcoes} />
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setAberto(false)} className={BOTAO_CLARO}>
              Cancelar
            </button>
            <button type="button" onClick={adicionar} disabled={enviando || !nome.trim() || !email.trim() || !funcao} className={BOTAO}>
              {enviando ? "Adicionando..." : "Adicionar"}
            </button>
          </div>
        </div>
      ) : (
        <button type="button" onClick={() => setAberto(true)} className={cn(BOTAO_CLARO, "flex w-fit items-center gap-1.5")}>
          <UserPlus className="size-4" aria-hidden /> Adicionar pessoa
        </button>
      )}
      <ul className="flex flex-col divide-y divide-black/5 text-sm">
        {equipe.membros.map((m) => (
          <LinhaMembro key={m.id} restauranteId={restauranteId} m={m} funcoes={equipe.funcoes} />
        ))}
      </ul>
    </div>
  );
}

export function EntrarComo({ restauranteId }: { restauranteId: string }) {
  const router = useRouter();
  const { executar, pendente } = useAcao();
  return (
    <BotaoConfirmar
      rotulo="Entrar como o dono"
      confirmar="Entrar como o dono"
      icone={false}
      desabilitado={pendente}
      aoConfirmar={() => executar(() => entrarComo(restauranteId), () => router.push("/painel"))}
      className="flex min-h-11 items-center gap-2 rounded-xl border border-black/10 px-4 text-sm font-bold hover:bg-uau-marrom/5"
    >
      <LogIn className="size-4" aria-hidden />
      Entrar como o dono
    </BotaoConfirmar>
  );
}
