// Impressão em impressoras instaladas no Windows (USB), sem módulos nativos:
//  - RAW: os bytes ESC/POS vão direto para a fila de impressão do Windows (como um "copy /b"),
//    via PowerShell + winspool.drv. Serve para térmicas de qualquer marca.
//  - driver: feito no processo principal do Electron (desenha o ticket e imprime pelo driver).
const { execFile } = require("node:child_process");
const { mkdtempSync, rmSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");

const SCRIPT_RAW = String.raw`
param([string]$impressora, [string]$arquivo)
$ErrorActionPreference = 'Stop'
if (-not ('RawPrinter' -as [type])) {
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public static class RawPrinter {
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
  public class DOCINFO {
    [MarshalAs(UnmanagedType.LPWStr)] public string pDocName;
    [MarshalAs(UnmanagedType.LPWStr)] public string pOutputFile;
    [MarshalAs(UnmanagedType.LPWStr)] public string pDataType;
  }
  [DllImport("winspool.drv", EntryPoint = "OpenPrinterW", SetLastError = true, CharSet = CharSet.Unicode)]
  public static extern bool OpenPrinter(string nome, out IntPtr h, IntPtr padrao);
  [DllImport("winspool.drv", SetLastError = true)]
  public static extern bool ClosePrinter(IntPtr h);
  [DllImport("winspool.drv", EntryPoint = "StartDocPrinterW", SetLastError = true, CharSet = CharSet.Unicode)]
  public static extern int StartDocPrinter(IntPtr h, int nivel, [In, MarshalAs(UnmanagedType.LPStruct)] DOCINFO doc);
  [DllImport("winspool.drv", SetLastError = true)]
  public static extern bool EndDocPrinter(IntPtr h);
  [DllImport("winspool.drv", SetLastError = true)]
  public static extern bool StartPagePrinter(IntPtr h);
  [DllImport("winspool.drv", SetLastError = true)]
  public static extern bool EndPagePrinter(IntPtr h);
  [DllImport("winspool.drv", SetLastError = true)]
  public static extern bool WritePrinter(IntPtr h, byte[] dados, int tamanho, out int escritos);
  public static void Enviar(string impressora, byte[] dados) {
    IntPtr h;
    if (!OpenPrinter(impressora, out h, IntPtr.Zero)) throw new Exception("Impressora nao encontrada no Windows: " + impressora);
    try {
      var doc = new DOCINFO { pDocName = "Pedido", pDataType = "RAW" };
      if (StartDocPrinter(h, 1, doc) == 0) throw new Exception("O Windows recusou a impressao (codigo " + Marshal.GetLastWin32Error() + ").");
      try {
        StartPagePrinter(h);
        int escritos;
        if (!WritePrinter(h, dados, dados.Length, out escritos) || escritos != dados.Length)
          throw new Exception("Falha ao enviar para a impressora (codigo " + Marshal.GetLastWin32Error() + ").");
        EndPagePrinter(h);
      } finally { EndDocPrinter(h); }
    } finally { ClosePrinter(h); }
  }
}
"@
}
try {
  [RawPrinter]::Enviar($impressora, [System.IO.File]::ReadAllBytes($arquivo))
} catch {
  # Só a mensagem original, sem o prefixo do PowerShell (que muda com o idioma do Windows).
  $e = $_.Exception
  while ($e.InnerException) { $e = $e.InnerException }
  [Console]::Error.WriteLine($e.Message)
  exit 1
}
`;

let pastaScripts = null;
function caminhoScript() {
  if (!pastaScripts) {
    pastaScripts = mkdtempSync(join(tmpdir(), "impressao-"));
    writeFileSync(join(pastaScripts, "raw.ps1"), SCRIPT_RAW, "utf8");
  }
  return join(pastaScripts, "raw.ps1");
}

function imprimirRaw(impressora, bytes) {
  if (process.platform !== "win32") return Promise.reject(new Error("Impressora USB só no Windows."));
  const pasta = mkdtempSync(join(tmpdir(), "impressao-trabalho-"));
  const arquivo = join(pasta, "ticket.bin");
  writeFileSync(arquivo, bytes);
  return new Promise((resolver, rejeitar) => {
    execFile(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", caminhoScript(), "-impressora", impressora, "-arquivo", arquivo],
      { windowsHide: true, timeout: 30_000 },
      (erro, _saida, stderr) => {
        rmSync(pasta, { recursive: true, force: true });
        if (!erro) return resolver();
        const linhas = String(stderr || erro.message)
          .split(/\r?\n/)
          .map((l) => l.trim())
          .filter(Boolean);
        rejeitar(new Error(linhas[0] ?? "Falha ao imprimir."));
      },
    );
  });
}

module.exports = { imprimirRaw };
