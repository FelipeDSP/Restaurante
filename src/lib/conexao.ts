"use client";

import { useSyncExternalStore } from "react";

function inscrever(ouvir: () => void) {
  window.addEventListener("online", ouvir);
  window.addEventListener("offline", ouvir);
  return () => {
    window.removeEventListener("online", ouvir);
    window.removeEventListener("offline", ouvir);
  };
}

// O aparelho diz que tem rede. ("online" não garante que o sistema responde; "offline" é certeza.)
export function useOnline(): boolean {
  return useSyncExternalStore(
    inscrever,
    () => navigator.onLine,
    () => true,
  );
}
