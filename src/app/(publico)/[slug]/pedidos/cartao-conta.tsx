"use client";

import { MapPin, Pencil, Trash2, UserRound } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { mensagemFalhaRede } from "@/components/staff/acoes-cliente";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatarTelefone } from "@/lib/telefone";

import type { ContaCliente } from "../conta";
import { excluirConta, mudarNome, removerEndereco, type ResultadoEntrar, sair } from "../entrar/actions";

type Props = {
  slug: string;
  conta: ContaCliente | null;
  bairros: { id: string; nome: string }[];
};

// Conta opcional do cliente: convite para entrar, ou nome, telefone, endereços, sair e excluir.
export function CartaoConta({ slug, conta, bairros }: Props) {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  const [editandoNome, setEditandoNome] = useState(false);
  const [nome, setNome] = useState(conta?.nome ?? "");
  const [confirmandoExclusao, setConfirmandoExclusao] = useState(false);

  if (!conta) {
    return (
      <section className="flex flex-col gap-3 rounded-xl bg-background p-4 shadow-sm">
        <h2 className="flex items-center gap-2 font-semibold">
          <UserRound className="size-4" aria-hidden />
          Entre com o seu celular
        </h2>
        <p className="text-sm text-muted-foreground">
          Veja seus pedidos em qualquer aparelho e peça sem digitar o endereço de novo. É opcional.
        </p>
        <Button className="h-11 w-fit" nativeButton={false} render={<Link href={`/${slug}/entrar?voltar=/${slug}/pedidos`} />}>
          Entrar
        </Button>
      </section>
    );
  }

  function executar(acao: () => Promise<ResultadoEntrar>, aoSucesso?: () => void) {
    iniciar(async () => {
      try {
        const r = await acao();
        if (!r.ok) {
          toast.error(r.mensagem);
          return;
        }
        aoSucesso?.();
        router.refresh();
      } catch {
        toast.error(mensagemFalhaRede());
      }
    });
  }

  const nomeBairro = (id: string) => bairros.find((b) => b.id === id)?.nome;

  return (
    <section aria-labelledby="titulo-conta" className="flex flex-col gap-3 rounded-xl bg-background p-4 shadow-sm">
      <h2 id="titulo-conta" className="flex items-center gap-2 font-semibold">
        <UserRound className="size-4" aria-hidden />
        Minha conta
      </h2>

      {editandoNome ? (
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            executar(() => mudarNome(slug, nome), () => setEditandoNome(false));
          }}
        >
          <Input value={nome} onChange={(e) => setNome(e.target.value)} aria-label="Nome" maxLength={120} className="h-11 flex-1" autoFocus />
          <Button type="submit" className="h-11" disabled={pendente}>
            Salvar
          </Button>
        </form>
      ) : (
        <div className="flex items-center justify-between gap-2">
          <div className="flex flex-col">
            <span className="font-medium">{conta.nome}</span>
            <span className="text-sm text-muted-foreground">{formatarTelefone(conta.telefone)}</span>
          </div>
          <Button type="button" variant="ghost" size="icon" aria-label="Mudar o nome" onClick={() => setEditandoNome(true)}>
            <Pencil />
          </Button>
        </div>
      )}

      {conta.enderecos.length > 0 ? (
        <div className="flex flex-col gap-1">
          <h3 className="text-sm font-medium">Endereços usados</h3>
          <ul className="flex flex-col divide-y">
            {conta.enderecos.map((e) => (
              <li key={e.id} className="flex items-center gap-2 py-1">
                <MapPin className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                <span className="flex-1 text-sm">
                  {[`${e.rua}, ${e.numero}`, e.complemento, nomeBairro(e.bairroId)].filter(Boolean).join(" · ")}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Remover ${e.rua}, ${e.numero}`}
                  disabled={pendente}
                  onClick={() => executar(() => removerEndereco(slug, e.id))}
                >
                  <Trash2 />
                </Button>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">O endereço do seu próximo pedido fica salvo aqui.</p>
      )}

      {confirmandoExclusao ? (
        <div className="flex flex-col gap-2 rounded-lg bg-muted p-3" role="alert">
          <p className="text-sm font-medium">
            Excluir sua conta? Seu nome, telefone e endereços são apagados. Os pedidos já feitos continuam com o restaurante.
          </p>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="destructive"
              disabled={pendente}
              onClick={() => executar(() => excluirConta(slug), () => toast.success("Conta excluída."))}
            >
              Excluir conta
            </Button>
            <Button type="button" variant="outline" onClick={() => setConfirmandoExclusao(false)}>
              Cancelar
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" disabled={pendente} onClick={() => executar(sair)}>
            Sair
          </Button>
          <Button type="button" variant="ghost" className="text-destructive" onClick={() => setConfirmandoExclusao(true)}>
            Excluir minha conta
          </Button>
        </div>
      )}
    </section>
  );
}
