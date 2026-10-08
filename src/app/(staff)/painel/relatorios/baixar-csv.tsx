"use client";

import { Download } from "lucide-react";

import { Button } from "@/components/ui/button";

// Planilha (CSV com ";" e vírgula decimal, como o Excel em português abre direto).
export function BaixarCsv({ nomeArquivo, cabecalho, linhas }: { nomeArquivo: string; cabecalho: string[]; linhas: (string | number)[][] }) {
  function baixar() {
    const celula = (v: string | number) => {
      const texto = typeof v === "number" ? String(v).replace(".", ",") : v;
      return /[";\n]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto;
    };
    const conteudo = [cabecalho, ...linhas].map((l) => l.map(celula).join(";")).join("\r\n");
    // BOM: o Excel reconhece os acentos.
    const url = URL.createObjectURL(new Blob(["﻿", conteudo], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = nomeArquivo;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <Button type="button" variant="outline" size="sm" onClick={baixar} disabled={linhas.length === 0}>
      <Download aria-hidden />
      Baixar planilha
    </Button>
  );
}
