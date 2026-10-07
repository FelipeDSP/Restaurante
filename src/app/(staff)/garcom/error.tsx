"use client";

import { TelaErro } from "@/components/tela-erro";

export default function Erro(props: { error: Error & { digest?: string }; retry: () => void }) {
  return <TelaErro {...props} />;
}
