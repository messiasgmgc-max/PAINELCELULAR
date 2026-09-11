/**
 * Qual motor de leitura o BarcodeScannerModal usa e como ele reage à permissão
 * da câmera e às falhas do leitor nativo.
 *
 * No app (Capacitor) com o plugin do ML Kit instalado, a leitura é nativa. O
 * site é carregado de https://app.phonecenter.tech, então um APK antigo (sem o
 * plugin) abre o código novo: nesse caso, e no navegador e no Electron, segue o
 * html5-qrcode.
 */

export type MotorLeitura = 'nativo' | 'html5';

export interface AmbienteLeitor {
  /** `Capacitor.isNativePlatform()` */
  plataformaNativa: boolean;
  /** `Capacitor.isPluginAvailable('BarcodeScanner')` */
  pluginDisponivel: boolean;
  /** O leitor nativo já falhou nesta abertura do modal (não por permissão). */
  nativoFalhou: boolean;
}

export function escolherMotorLeitura(ambiente: AmbienteLeitor): MotorLeitura {
  return ambiente.plataformaNativa && ambiente.pluginDisponivel && !ambiente.nativoFalhou ? 'nativo' : 'html5';
}

export type AcaoPermissaoCamera = 'iniciar' | 'pedir' | 'negada';

/**
 * Estado vem de `BarcodeScanner.checkPermissions()`/`requestPermissions()`:
 * 'granted' | 'limited' | 'denied' | 'prompt' | 'prompt-with-rationale'.
 * Depois de pedir uma vez, qualquer coisa diferente de liberado conta como negada
 * (o Android não mostra o pedido de novo quando a pessoa marcou "não perguntar").
 */
export function acaoPermissaoCamera(estado: string | null | undefined, jaPediu: boolean): AcaoPermissaoCamera {
  if (estado === 'granted' || estado === 'limited') return 'iniciar';
  if (estado === 'denied') return 'negada';
  return jaPediu ? 'negada' : 'pedir';
}

export type FalhaLeitorNativo = 'permissao' | 'cancelado' | 'indisponivel';

function textoDoErro(erro: unknown): string {
  if (!erro) return '';
  if (typeof erro === 'string') return erro;
  const e = erro as { message?: unknown; code?: unknown; name?: unknown };
  const nome = e.name === 'Error' ? undefined : e.name;
  return [nome, e.code, e.message].filter((p) => typeof p === 'string').join(' ');
}

/** Permissão negada mostra a mensagem; cancelado não faz nada; o resto cai no html5-qrcode. */
export function classificarFalhaNativa(erro: unknown): FalhaLeitorNativo {
  const texto = textoDoErro(erro).toLowerCase();
  if (/permiss|denied|not ?allowed/.test(texto)) return 'permissao';
  if (/cancel/.test(texto)) return 'cancelado';
  return 'indisponivel';
}

export const MENSAGENS_LEITOR = {
  permissaoNegadaApp:
    'O Phone Center está sem permissão para usar a câmera. Toque em "Abrir configurações", vá em Permissões e libere a Câmera.',
  permissaoNegadaNavegador:
    'A câmera foi bloqueada. Libere o acesso à câmera nas permissões do site (cadeado ao lado do endereço) e abra o leitor de novo.',
  semCamera: 'Nenhuma câmera encontrada neste aparelho.',
  cameraOcupada: 'A câmera está em uso por outro aplicativo. Feche o outro app e tente de novo.',
  semHttps: 'A câmera só funciona com o site em HTTPS.',
  generico: 'Câmera não permitida ou indisponível.',
  nativoIndisponivel: 'O leitor nativo não abriu neste aparelho. Usando a câmera pelo navegador.',
} as const;

/**
 * Mensagem para o erro do html5-qrcode (getUserMedia). Ele rejeita com Error ou
 * com texto do tipo "NotAllowedError: Permission denied".
 */
export function mensagemErroCameraWeb(erro: unknown, noApp: boolean): string {
  const texto = textoDoErro(erro);
  if (/NotAllowedError|PermissionDenied|Permission denied|permiss/i.test(texto)) {
    return noApp ? MENSAGENS_LEITOR.permissaoNegadaApp : MENSAGENS_LEITOR.permissaoNegadaNavegador;
  }
  if (/NotFoundError|DevicesNotFound|Requested device not found|no camera/i.test(texto)) return MENSAGENS_LEITOR.semCamera;
  if (/NotReadableError|TrackStartError|Could not start video source/i.test(texto)) return MENSAGENS_LEITOR.cameraOcupada;
  if (/secure context|https|streaming not supported/i.test(texto)) return MENSAGENS_LEITOR.semHttps;
  return texto.trim() || MENSAGENS_LEITOR.generico;
}
