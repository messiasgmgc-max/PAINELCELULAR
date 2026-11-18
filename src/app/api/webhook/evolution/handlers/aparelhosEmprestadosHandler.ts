import type { SupabaseClient } from '@supabase/supabase-js';
import { bateriaParaLista, getEmojiItem } from '@/lib/estoque/listaWhatsapp';
import { getAparelhoCodigo } from '@/lib/utils';

export interface RegistroAparelhoEmprestado {
  imei: string;
  clienteNome: string;
  modeloResumo: string;
  aparelhoId?: string | null;
  cadastradoPor: string;
  emprestadoEm: string;
}

export type ComandoAparelhoEmprestado =
  | {
      acao: 'emprestar';
      imei: string;
      clienteNome: string;
      modeloInformado?: string;
    }
  | {
      acao: 'devolver';
      imei: string;
      observacao?: string;
    };

const PREFIXOS_GENERICOS_APARELHO = /^(?:o\s+)?(?:aparelho|celular|telefone|aparelhos|celulares)$/i;

function limparNomePessoa(bruto: string): string {
  return bruto
    .replace(/^["“']+|["”']+$/g, '')
    .replace(/[.,;!?]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function extrairModeloPrefixo(prefixo?: string): string | undefined {
  if (!prefixo) return undefined;
  const limpo = prefixo
    .replace(/\b(?:o|um|meu|nosso|esse|este)\b/gi, ' ')
    .replace(/\b(?:aparelho|celular|telefone)\b/gi, ' ')
    .replace(/[:\-]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!limpo || PREFIXOS_GENERICOS_APARELHO.test(limpo)) return undefined;
  return limpo;
}

/**
 * Verifica se a mensagem solicita a listagem de aparelhos emprestados (`!emprestados`).
 */
export function ehComandoListarEmprestados(texto: string): boolean {
  if (!texto || typeof texto !== 'string') return false;
  return /^!(?:emprestados?)(?:\s+lista)?(?=\s|$)/i.test(texto.trim());
}

/**
 * Detecta mensagens para registrar empréstimo ou devolução de celular em garantia/reparo:
 * - "aparelho imei 350015753668064 emprestado para Lucas"
 * - "aparelho 350015753668064 emprestado pro João Silva"
 * - "iphone 11 imei 9911 emprestado pra Maria"
 * - "350015753668064 [EMPRESTADO \"Lucas\"]"
 * - "!emprestar 350015753668064 Lucas" / "emprestar imei 9911 para Lucas"
 * - "!devolver 350015753668064" / "aparelho imei 350015753668064 devolvido"
 */
export function detectarComandoAparelhoEmprestado(
  texto: string
): ComandoAparelhoEmprestado | null {
  if (!texto || typeof texto !== 'string') return null;
  const limpo = texto.replace(/\s+/g, ' ').trim();
  if (!limpo || limpo.endsWith('?')) return null;

  // 1. Devolução explícita: "!devolver IMEI [obs]" ou "!devolvido IMEI"
  const matchDevolverCmd = limpo.match(
    /^!(?:devolver|devolvido|retornar)\s+(?:(?:o\s+)?(?:aparelho|celular|telefone)\s+)?(?:imei\s*[:=-]?\s*)?#?(\d{4,16})(?:\s+(.+))?$/i
  );
  if (matchDevolverCmd) {
    const obs = matchDevolverCmd[2] ? limparNomePessoa(matchDevolverCmd[2]) : undefined;
    return {
      acao: 'devolver',
      imei: matchDevolverCmd[1],
      ...(obs ? { observacao: obs } : {}),
    };
  }

  // 2. Devolução em linguagem natural: "aparelho imei 3500... devolvido [por Nome]"
  const matchDevolverNatural = limpo.match(
    /^(?:(?:o\s+)?(?:aparelho|celular|telefone)\s+)?(?:imei\s*[:=-]?\s*)?#?(\d{4,16})\s+(?:foi\s+)?devolvid[oa](?:\s+(?:por|pelo|pela)\s+(.+))?$/i
  );
  if (matchDevolverNatural) {
    const obs = matchDevolverNatural[2] ? limparNomePessoa(matchDevolverNatural[2]) : undefined;
    return {
      acao: 'devolver',
      imei: matchDevolverNatural[1],
      ...(obs ? { observacao: obs } : {}),
    };
  }

  // 3. Comando explícito "!emprestar IMEI [para] Nome" ou "!emprestado IMEI [para] Nome"
  const matchCmdEmprestar = limpo.match(
    /^!(?:emprestar|emprestado)\s+(?:(?:o\s+)?(?:aparelho|celular|telefone)\s+)?(?:imei\s*[:=-]?\s*)?#?(\d{4,16})\s+(?:(?:para|pro|pra|p\/|a)\s+)?(.+)$/i
  );
  if (matchCmdEmprestar) {
    const clienteNome = limparNomePessoa(matchCmdEmprestar[2]);
    if (clienteNome && !/^(?:quem|algu[eé]m|qual|lista)\b/i.test(clienteNome)) {
      return {
        acao: 'emprestar',
        imei: matchCmdEmprestar[1],
        clienteNome,
      };
    }
  }

  // 4. Tag entre colchetes: "IMEI [EMPRESTADO "Nome"]"
  const matchColchete = limpo.match(
    /^(?:(?:aparelho|celular|telefone)\s+)?(?:imei\s*[:=-]?\s*)?#?(\d{4,16})\s*\[\s*emprestad[oa]\s+["“']?([^\]"”']+)["”']?\s*\]$/i
  );
  if (matchColchete) {
    const clienteNome = limparNomePessoa(matchColchete[2]);
    if (clienteNome) {
      return {
        acao: 'emprestar',
        imei: matchColchete[1],
        clienteNome,
      };
    }
  }

  // 5. Frase natural com "imei" explícito: "[modelo/aparelho] imei 3500... [foi] emprestado para Nome"
  const matchComPalavraImei = limpo.match(
    /^(.*?)\bimei\s*[:=-]?\s*#?(\d{4,16})\s+(?:foi\s+|est[aá]\s+)?emprestad[oa]\s+(?:para|pro|pra|p\/|a)\s+(.+)$/i
  );
  if (matchComPalavraImei) {
    const clienteNome = limparNomePessoa(matchComPalavraImei[3]);
    if (clienteNome && !/^(?:quem|algu[eé]m|qual)\b/i.test(clienteNome)) {
      const modeloInformado = extrairModeloPrefixo(matchComPalavraImei[1]);
      return {
        acao: 'emprestar',
        imei: matchComPalavraImei[2],
        clienteNome,
        ...(modeloInformado ? { modeloInformado } : {}),
      };
    }
  }

  // 6. Frase natural sem palavra "imei": "aparelho 3500... emprestado para Nome" ou "emprestar aparelho 3500... para Nome"
  const matchNaturalDireto =
    limpo.match(
      /^(?:(?:o\s+)?(?:aparelho|celular|telefone)\s+)?#?(\d{4,16})\s+(?:foi\s+|est[aá]\s+)?emprestad[oa]\s+(?:para|pro|pra|p\/|a)\s+(.+)$/i
    ) ||
    limpo.match(
      /^(?:emprestar|emprestei)(?:\s+(?:o\s+)?(?:aparelho|celular|telefone))?\s+(?:imei\s*[:=-]?\s*)?#?(\d{4,16})\s+(?:para|pro|pra|p\/|a)\s+(.+)$/i
    );

  if (matchNaturalDireto) {
    const clienteNome = limparNomePessoa(matchNaturalDireto[2]);
    if (clienteNome && !/^(?:quem|algu[eé]m|qual)\b/i.test(clienteNome)) {
      return {
        acao: 'emprestar',
        imei: matchNaturalDireto[1],
        clienteNome,
      };
    }
  }

  return null;
}

function formatarResumoAparelhoBanco(ap: Record<string, any>): string {
  const emoji = getEmojiItem(ap);
  const modelo = String(ap.modelo || 'Aparelho').replace(/^Apple\s+/i, '').trim();
  const cap = ap.capacidade && !/^n\/a$/i.test(String(ap.capacidade)) ? String(ap.capacidade).trim() : '';
  const cor = String(ap.cor || '')
    .replace(/[\p{Emoji_Presentation}\p{Extended_Pictographic}\uFE0F\u200D]/gu, '')
    .trim();
  const corLimpa = /^(?:padr[aã]o|n\/a)$/i.test(cor) ? '' : cor;
  const bat = bateriaParaLista(ap);
  const ident = String(ap.imei || '').trim() || getAparelhoCodigo(ap);
  const desc = [modelo, cap, corLimpa, bat].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
  return `${emoji} ${desc || 'Aparelho'}${ident ? ` (${ident})` : ''}`.trim();
}

function chaveEmprestimo(lojaId: string, imei: string): string {
  return `emprestado:${lojaId}:${imei.replace(/\D/g, '')}`;
}

/**
 * Registra (ou atualiza) um celular emprestado a um cliente durante garantia/conserto.
 * Não altera a tabela `aparelhos` nem falha caso o aparelho reserva não esteja cadastrado no estoque.
 */
export async function registrarAparelhoEmprestado(
  supabase: SupabaseClient,
  lojaId: string,
  comando: Extract<ComandoAparelhoEmprestado, { acao: 'emprestar' }>,
  usuarioNome: string = 'Equipe'
): Promise<string> {
  const imeiDigits = comando.imei.replace(/\D/g, '');
  const filtro =
    imeiDigits.length > 4
      ? `imei.eq.${imeiDigits},imei.ilike.%${imeiDigits},codigo.eq.${imeiDigits}`
      : `imei.eq.${imeiDigits},imei.ilike.%${imeiDigits}`;

  const { data: encontrados } = await supabase
    .from('aparelhos')
    .select('id, loja_id, marca, modelo, capacidade, cor, imei, codigo, saude_bateria, condicao')
    .eq('loja_id', lojaId)
    .or(filtro)
    .limit(5);

  const listaEncontrados = (encontrados || []) as Array<Record<string, any>>;
  const aparelhoBanco =
    listaEncontrados.find((a) => String(a.imei || '').replace(/\D/g, '') === imeiDigits) ||
    (listaEncontrados.length === 1 ? listaEncontrados[0] : null);

  const imeiCanonical =
    String(aparelhoBanco?.imei || '').replace(/\D/g, '') || imeiDigits;
  const modeloResumo = aparelhoBanco
    ? formatarResumoAparelhoBanco(aparelhoBanco).replace(/\s*\([^)]+\)$/, '').trim()
    : `📱 ${comando.modeloInformado || 'Aparelho reserva'}`;

  const agoraIso = new Date().toISOString();
  const registro: RegistroAparelhoEmprestado = {
    imei: imeiCanonical,
    clienteNome: comando.clienteNome,
    modeloResumo,
    aparelhoId: aparelhoBanco?.id || null,
    cadastradoPor: usuarioNome,
    emprestadoEm: agoraIso,
  };

  const { error } = await supabase.from('whatsapp_acoes_pendentes').upsert(
    {
      chave: chaveEmprestimo(lojaId, imeiCanonical),
      loja_id: lojaId,
      tipo: 'confirmacao',
      action: 'aparelho_emprestado',
      params: registro as unknown as Record<string, unknown>,
      resumo: `${modeloResumo} (${imeiCanonical}) -> ${comando.clienteNome}`,
      criado_em: agoraIso,
    },
    { onConflict: 'chave' }
  );

  if (error) {
    return `⚠️ Não consegui salvar o empréstimo do IMEI *${imeiCanonical}*: ${error.message}`;
  }

  return (
    `🤝 *Aparelho Emprestado Registrado!*\n` +
    `${modeloResumo} - IMEI \`${imeiCanonical}\`\n` +
    `👤 *Emprestado para:* ${comando.clienteNome}\n` +
    `📝 *Registrado por:* ${usuarioNome}\n\n` +
    `💡 _Envie *!emprestados* para ver a lista completa ou *!devolver ${imeiCanonical}* quando o cliente devolver._`
  );
}

/**
 * Registra a devolução de um aparelho emprestado removendo-o da lista de empréstimos ativos.
 */
export async function registrarDevolucaoEmprestado(
  supabase: SupabaseClient,
  lojaId: string,
  imeiBusca: string,
  observacao?: string
): Promise<string> {
  const digits = imeiBusca.replace(/\D/g, '');
  const { data: rows, error } = await supabase
    .from('whatsapp_acoes_pendentes')
    .select('chave, params, criado_em')
    .eq('loja_id', lojaId)
    .eq('action', 'aparelho_emprestado');

  if (error) {
    return `⚠️ Erro ao consultar aparelhos emprestados: ${error.message}`;
  }

  const ativos = (rows || []) as Array<{
    chave: string;
    params?: Partial<RegistroAparelhoEmprestado>;
    criado_em?: string;
  }>;

  const exato = ativos.find(
    (r) => String(r.params?.imei || '').replace(/\D/g, '') === digits
  );
  const candidatos = exato
    ? [exato]
    : ativos.filter((r) => {
        const imeiReg = String(r.params?.imei || '').replace(/\D/g, '');
        return imeiReg.endsWith(digits) || digits.endsWith(imeiReg);
      });

  if (candidatos.length === 0) {
    return `⚠️ Nenhum aparelho emprestado ativo encontrado para o IMEI *${digits}*. Envie *!emprestados* para conferir a lista.`;
  }

  if (candidatos.length > 1) {
    const listaCand = candidatos
      .map((c) => `• \`${c.params?.imei || '?'}\` — ${c.params?.clienteNome || 'Cliente'}`)
      .join('\n');
    return `⚠️ Encontrei mais de um aparelho emprestado terminando em *${digits}*:\n${listaCand}\n\nInforme o IMEI completo para dar baixa.`;
  }

  const alvo = candidatos[0];
  await supabase.from('whatsapp_acoes_pendentes').delete().eq('chave', alvo.chave);

  const info = alvo.params || {};
  return (
    `✅ *Devolução Registrada!*\n` +
    `${info.modeloResumo || '📱 Aparelho'} - IMEI \`${info.imei || digits}\`\n` +
    `👤 *Estava com:* ${info.clienteNome || 'Cliente'}` +
    (observacao ? `\n📝 *Obs:* ${observacao}` : '')
  );
}

function formatarTempoEmprestimo(isoData?: string): string {
  if (!isoData) return 'Data desconhecida';
  const dt = new Date(isoData);
  if (Number.isNaN(dt.getTime())) return 'Data desconhecida';

  const dataBr = dt.toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  const diffDias = Math.floor((Date.now() - dt.getTime()) / (24 * 60 * 60 * 1000));
  const prazoTexto =
    diffDias <= 0 ? 'hoje' : diffDias === 1 ? 'há 1 dia' : `há ${diffDias} dias`;

  return `${dataBr} (${prazoTexto})`;
}

/**
 * Gera a lista formatada de todos os aparelhos atualmente emprestados pela loja (`!emprestados`).
 */
export async function listarAparelhosEmprestados(
  supabase: SupabaseClient,
  lojaId: string,
  nomeLoja: string = 'Phone Center'
): Promise<string> {
  const { data: rows, error } = await supabase
    .from('whatsapp_acoes_pendentes')
    .select('chave, params, criado_em')
    .eq('loja_id', lojaId)
    .eq('action', 'aparelho_emprestado')
    .order('criado_em', { ascending: true });

  if (error) {
    return `⚠️ Erro ao buscar aparelhos emprestados: ${error.message}`;
  }

  const lista = ((rows || []) as Array<{
    chave: string;
    params?: Partial<RegistroAparelhoEmprestado>;
    criado_em?: string;
  }>).filter((r) => r.params && r.params.imei);

  if (lista.length === 0) {
    return (
      `🤝 *Aparelhos Emprestados — ${nomeLoja}*\n\n` +
      `Nenhum aparelho emprestado no momento. ✅\n\n` +
      `💡 _Para registrar um empréstimo, envie:_\n` +
      `*"aparelho imei [número] emprestado para [nome]"*`
    );
  }

  const linhas = lista.map((item, idx) => {
    const p = item.params || {};
    const tempo = formatarTempoEmprestimo(p.emprestadoEm || item.criado_em);
    const modelo = p.modeloResumo || '📱 Aparelho';
    return (
      `*${idx + 1}.* ${modelo} - IMEI \`${p.imei}\`\n` +
      `   👤 *Com:* ${p.clienteNome || 'Cliente'}\n` +
      `   🕒 *Desde:* ${tempo}`
    );
  });

  return (
    `🤝 *Aparelhos Emprestados — ${nomeLoja}* (${lista.length})\n\n` +
    `${linhas.join('\n\n')}\n\n` +
    `💡 _Quando devolverem, envie:_ *!devolver [IMEI]* ou *"aparelho imei [número] devolvido"*`
  );
}
