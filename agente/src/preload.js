// Ponte segura entre a janela e o processo principal (sem acesso a Node na página).
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("agente", {
  estado: () => ipcRenderer.invoke("estado"),
  parear: (servidor, codigo) => ipcRenderer.invoke("parear", servidor, codigo),
  desconectar: () => ipcRenderer.invoke("desconectar"),
  definirInicioAutomatico: (ligado) => ipcRenderer.invoke("inicio-automatico", ligado),
  aoMudar: (callback) => ipcRenderer.on("estado", (_evento, estado) => callback(estado)),
});
