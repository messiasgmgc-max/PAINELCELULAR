import { SupabaseClient } from '@supabase/supabase-js';
import { sanitizarECompletarVendaParsed, normalizarNomeModelo, ParsedVenda } from '@/lib/vendas/parseVendaTexto';
import { estaNoEstoque } from '@/lib/estoque/ciclo';
import { registrarVendaAtomica, ErroVenda } from '@/lib/vendas/vendaAtomica';
import { sanitizarTextoWhatsApp } from '@/lib/whatsappFormatting';

export interface AparelhoEstoqueConsulta {
  id: string;
  modelo?: string | null;
  capacidade?: string | null;
  cor?: string | null;
  imei?: string | null;
  preco?: number | null;
  custo?: number | null;
  status?: string | null;
  ativo?: boolean | null;
  data_saida?: string | null;
  cliente?: string | null;
  dataCadastro?: string | null;
}

export interface ResultadoCruzamentoEstoque {
  status: 'confirmado' | 'ja_vendido' | 'nao_encontrado' | 'ambiguo' | 'sem_estoque';
  mensagem: string;
  aparelhoEncontrado?: AparelhoEstoqueConsulta;
  candidatos?: AparelhoEstoqueConsulta[];
}

export interface PropostaNotinha {
  id: string;
  remoteJid?: string;
  messageId?: string;
  clienteNome: string;
  cpf?: string;
  telefone?: string;
  email?: string;
  enderecoEntrega?: string;
  modelo: string;
  capacidade?: string;
  cor?: string;
  imei?: string;
  statusEstoque: string;
  aparelhoId?: string;
  valorTotal: number;
  custo?: number;
  formaPagamento: string;
  isUpgrade: boolean;
  modeloTroca?: string;
  imeiTroca?: string;
  valorTroca?: number;
  vendedor?: string;
  observacoes?: string;
  criadoEm?: number;
}

const digitos = (val: unknown) => String(val ?? '').replace(/\D/g, '');

/**
 * Limpa palavras parasitas do nome do modelo (como "imei", "lacrado", capacidade, cor)
 */
export function limparNomeModelo(m: string): string {
  let limpo = (m || '').trim();
  // Remove menção a imei, lacrado, seminovo, gb, cores comuns
  limpo = limpo
    .replace(/\bimei\b.*$/i, '')
    .replace(/\b(?:lacrado|seminovo|novo|usado)\b/gi, '')
    .replace(/\b\d+\s*(?:gb|tb)\b/gi, '')
    .replace(/\b(?:preto|branco|azul|dourado|prata|verde|roxo|cinza|grafite|tit[aâ]nio|rose|amarelo|vermelho|natural|black|white|blue|gold|silver|green|purple|gray|graphite|titanium)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();

  // Capitaliza modelos populares
  limpo = limpo
    .replace(/\bpro\s*max\b/gi, 'Pro Max')
    .replace(/\bpro\b/gi, 'Pro')
    .replace(/\bplus\b/gi, 'Plus')
    .replace(/\bmini\b/gi, 'Mini');

  return normalizarNomeModelo(limpo);
}

/**
 * Detecta se a mensagem enviada contém dados de um pedido ou venda a ser faturada.
 */
export function detectarFormularioOuPedidoVenda(texto: string): ParsedVenda | null {
  if (!texto || typeof texto !== 'string') return null;
  const t = texto.trim();
  if (t.length < 15) return null;

  // Checa se tem indício de venda/pedido
  const indicios = [
    /para finalizar seu pedido/i,
    /dados pessoais/i,
    /endereço para entrega/i,
    /forma de pagamento/i,
    /\bvendido\b/i,
    /\bvendi\b/i,
    /\bnova venda\b/i,
    /\bpedido\b/i,
    /\bimei\b/i,
    /\bupgrade\b/i,
  ];

  const temIndicio = indicios.some((regex) => regex.test(t));
  if (!temIndicio) return null;

  let parsed = sanitizarECompletarVendaParsed(null, t);

  // Fallback para frases em linha única (ex: "Vendido iPhone 15 128gb preto por 3500 para Carlos no Pix")
  if (!parsed.aparelho?.modelo || !parsed.valorTotal) {
    const matchLinhaSimples = t.match(/(?:vendido|vendi|venda)\s+(.+?)(?:\s+por|\s+de|\s+a|\s+valor|\s*R?\$)\s*([\d.,]+)(?:\s+(?:para|pro|pra)\s+([A-Za-zÀ-ÖØ-öø-ÿ\s]+?))?(?:\s+(?:no|via|em)\s+([A-Za-z\s]+))?$/i);
    if (matchLinhaSimples) {
      const modeloRaw = matchLinhaSimples[1].trim();
      const valorRaw = matchLinhaSimples[2].replace(/\./g, '').replace(',', '.');
      const compradorRaw = matchLinhaSimples[3]?.trim();
      const formaPgtoRaw = matchLinhaSimples[4]?.trim();

      parsed = {
        cliente: { nome: compradorRaw || parsed.cliente?.nome || null },
        aparelho: { modelo: modeloRaw },
        isUpgrade: false,
        tradeIn: null,
        formaPagamento: formaPgtoRaw || 'dinheiro',
        valorTotal: parseFloat(valorRaw) || null,
        camposFaltantes: [],
      };
    }
  }

  // Se não identificou nem modelo nem valor, não é uma venda válida
  if (!parsed.aparelho?.modelo && !parsed.valorTotal) {
    return null;
  }

  // Se tem modelo, limpa e normaliza
  if (parsed.aparelho?.modelo) {
    parsed.aparelho.modelo = limparNomeModelo(parsed.aparelho.modelo);
  }

  return parsed;
}

/**
 * Cruza os dados do aparelho a ser vendido com a base de estoque (ativos e saídos).
 */
export function cruzarAparelhoComEstoque(
  estoque: AparelhoEstoqueConsulta[],
  dadosAparelho: {
    modelo?: string | null;
    capacidade?: string | null;
    cor?: string | null;
    imei?: string | null;
  }
): ResultadoCruzamentoEstoque {
  const imeiAlvo = digitos(dadosAparelho.imei);

  // 1. Busca prioritária por IMEI quando informado
  if (imeiAlvo.length >= 4) {
    const comMesmoImei = estoque.filter((a) => {
      const cad = digitos(a.imei);
      if (cad.length < 4) return false;
      if (imeiAlvo.length >= 15 && cad.length >= 15) return imeiAlvo === cad;
      return cad.endsWith(imeiAlvo) || imeiAlvo.endsWith(cad);
    });

    if (comMesmoImei.length > 0) {
      const primeiro = comMesmoImei[0];
      const noEstoqueAtivo = estaNoEstoque(primeiro as any);

      if (noEstoqueAtivo) {
        return {
          status: 'confirmado',
          mensagem: 'Aparelho confirmado no estoque ✅',
          aparelhoEncontrado: primeiro,
        };
      } else {
        const dataSaidaFmt = primeiro.data_saida
          ? new Date(primeiro.data_saida).toLocaleDateString('pt-BR')
          : 'data anterior';
        const comprador = primeiro.cliente ? ` para ${primeiro.cliente}` : '';
        return {
          status: 'ja_vendido',
          mensagem: `⚠️ Este IMEI já consta como vendido/baixado em ${dataSaidaFmt}${comprador}.`,
          aparelhoEncontrado: primeiro,
        };
      }
    } else {
      return {
        status: 'nao_encontrado',
        mensagem: 'IMEI não localizado no estoque (será associado à venda)',
      };
    }
  }

  // 2. Busca por modelo/capacidade/cor quando não tem IMEI
  const modeloAlvo = (dadosAparelho.modelo || '').toLowerCase().trim();
  const capacidadeAlvo = (dadosAparelho.capacidade || '').toLowerCase().trim();

  const ativos = estoque.filter((a) => estaNoEstoque(a as any));
  const candidatos = ativos.filter((a) => {
    const mod = (a.modelo || '').toLowerCase();
    const cap = (a.capacidade || '').toLowerCase();
    const bateModelo = mod.includes(modeloAlvo) || modeloAlvo.includes(mod);
    const bateCap = !capacidadeAlvo || cap.includes(capacidadeAlvo) || capacidadeAlvo.includes(cap);
    return bateModelo && bateCap;
  });

  if (candidatos.length === 1) {
    return {
      status: 'confirmado',
      mensagem: `Aparelho único localizado no estoque (IMEI: ${candidatos[0].imei || 's/n'}) ✅`,
      aparelhoEncontrado: candidatos[0],
    };
  }

  if (candidatos.length > 1) {
    return {
      status: 'ambiguo',
      mensagem: `Existem ${candidatos.length} aparelhos deste modelo no estoque.`,
      candidatos,
    };
  }

  return {
    status: 'sem_estoque',
    mensagem: 'Nenhum aparelho deste modelo disponível no estoque no momento.',
  };
}

/**
 * Formata a mensagem de prévia da notinha para envio no WhatsApp.
 */
export function formatarMensagemPreviaNotinha(proposta: PropostaNotinha): string {
  const valorFmt = Number(proposta.valorTotal || 0).toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  const linhas: string[] = [
    '🧾 *PRÉVIA DA NOTINHA — LUCAS IMPORTS*',
    '──────────────────────────',
    `👤 *Cliente:* ${proposta.clienteNome || 'Cliente Não Informado'}${proposta.cpf ? ` (CPF: ${proposta.cpf})` : ''}`,
    `📱 *Aparelho:* ${proposta.modelo} ${proposta.capacidade || ''} ${proposta.cor || ''}`.replace(/\s+/g, ' ').trim(),
  ];

  if (proposta.imei) {
    linhas.push(`🔢 *IMEI:* ${proposta.imei} [${proposta.statusEstoque}]`);
  } else {
    linhas.push(`📦 *Estoque:* ${proposta.statusEstoque}`);
  }

  linhas.push(`💰 *Valor Total:* R$ ${valorFmt}`);
  linhas.push(`💳 *Forma de Pagamento:* ${proposta.formaPagamento || 'Não informada'}`);

  if (proposta.isUpgrade && proposta.modeloTroca) {
    const valTrocaFmt = proposta.valorTroca
      ? ` (Avaliado em R$ ${Number(proposta.valorTroca).toLocaleString('pt-BR', { minimumFractionDigits: 2 })})`
      : '';
    linhas.push(`🔄 *Upgrade / Troca:* ${proposta.modeloTroca}${valTrocaFmt}`);
    if (proposta.imeiTroca) {
      linhas.push(`   *IMEI Entrada:* ${proposta.imeiTroca}`);
    }
  }

  if (proposta.enderecoEntrega) {
    linhas.push(`📍 *Entrega:* ${proposta.enderecoEntrega}`);
  }

  linhas.push('──────────────────────────');
  linhas.push('👉 Reaja com ✅ nesta mensagem para EMITIR A NOTINHA e dar baixa no estoque.');
  linhas.push('❌ Reaja com ❌ para cancelar ou responda corrigindo qualquer dado.');

  return sanitizarTextoWhatsApp(linhas.join('\n'));
}

/**
 * Interpreta se uma reação é de confirmação ou recusa da nota.
 */
export function interpretarReacaoNotinha(emoji: string): 'confirmar' | 'cancelar' | null {
  if (!emoji || typeof emoji !== 'string') return null;
  const e = emoji.trim();

  const confirmacoes = ['✅', '💚', '👍', '🟢', '✔️', '✔'];
  if (confirmacoes.includes(e)) return 'confirmar';

  const cancelamentos = ['❌', '👎', '🔴', '✖️', '✖'];
  if (cancelamentos.includes(e)) return 'cancelar';

  return null;
}

/**
 * Interpreta texto de resposta com correção de dados de uma proposta de venda.
 */
export function interpretarTextoCorrecaoVenda(
  texto: string
): { campo: 'valor' | 'imei' | 'cliente' | 'modelo'; valor: any } | null {
  if (!texto || typeof texto !== 'string') return null;
  const t = texto.trim();

  // Correção de valor
  const matchValor = t.match(/(?:valor|preco|preço|por|total)\s*(?:certo|correto|novo)?\s*(?:é|e|sera|será|pra|para)?\s*R?\$?\s*([\d.,]+)/i);
  if (matchValor) {
    const rawVal = matchValor[1].replace(/\./g, '').replace(',', '.');
    const num = parseFloat(rawVal);
    if (!isNaN(num) && num > 0) {
      return { campo: 'valor', valor: num };
    }
  }

  // Correção de IMEI
  const matchImei = t.match(/\b(?:imei)\s*(?:é|e|correto|certo|novo|\s)*[:=-]?\s*(\d{14,16})\b/i);
  if (matchImei) {
    return { campo: 'imei', valor: matchImei[1] };
  }

  // Correção de cliente
  const matchCliente = t.match(/(?:cliente|comprador|nome)\s*(?:é|e|correto|certo)?\s*[:=-]?\s*([A-Za-zÀ-ÖØ-öø-ÿ\s]{3,35})/i);
  if (matchCliente) {
    const nome = matchCliente[1].trim();
    if (nome.length >= 3 && !/^(valor|imei|preco)$/i.test(nome)) {
      return { campo: 'cliente', valor: nome };
    }
  }

  return null;
}

/**
 * Salva uma proposta de notinha no banco para aguardar reação.
 */
export async function salvarPropostaNotinha(
  supabase: SupabaseClient,
  lojaId: string,
  remoteJid: string,
  messageId: string,
  proposta: PropostaNotinha
): Promise<void> {
  const agora = Date.now();
  proposta.messageId = messageId;
  proposta.remoteJid = remoteJid;
  proposta.criadoEm = agora;

  try {
    // 1. Salva indexada pelo messageId enviado pelo bot
    await supabase.from('whatsapp_acoes_pendentes').upsert(
      {
        chave: `notinha:${remoteJid}:${messageId}`,
        loja_id: lojaId,
        tipo: 'confirmacao',
        action: 'emitir_notinha',
        params: proposta as any,
        resumo: `Notinha ${proposta.modelo} para ${proposta.clienteNome}`,
        criado_em: new Date(agora).toISOString(),
      },
      { onConflict: 'chave' }
    );

    // 2. Salva também como última proposta do chat
    await supabase.from('whatsapp_acoes_pendentes').upsert(
      {
        chave: `notinha:${remoteJid}:ultima`,
        loja_id: lojaId,
        tipo: 'confirmacao',
        action: 'emitir_notinha',
        params: proposta as any,
        resumo: `Última notinha ${proposta.modelo}`,
        criado_em: new Date(agora).toISOString(),
      },
      { onConflict: 'chave' }
    );
  } catch (err) {
    console.warn('[Notinha Automática] Erro ao salvar proposta pendente:', err);
  }
}

/**
 * Executa a emissão atômica da venda e baixa no estoque.
 */
export async function emitirNotinhaVenda(
  supabase: SupabaseClient,
  lojaId: string,
  proposta: PropostaNotinha,
  usuarioNome: string = 'Bot WhatsApp'
): Promise<{ sucesso: boolean; mensagem: string; vendaId?: string }> {
  try {
    const agora = new Date().toISOString();
    const descricao = `Venda WhatsApp - ${proposta.modelo} para ${proposta.clienteNome}`;

    const registroVenda = {
      loja_id: lojaId,
      clienteNome: proposta.clienteNome,
      cpf: proposta.cpf || null,
      valor: proposta.valorTotal,
      custo: proposta.custo || 0,
      lucro: (proposta.valorTotal || 0) - (proposta.custo || 0),
      metodo: proposta.formaPagamento.toLowerCase().includes('cart') ? 'cartao_credito' : (proposta.formaPagamento.toLowerCase().includes('pix') ? 'pix' : 'dinheiro'),
      status: 'pago',
      valorPago: proposta.valorTotal,
      saldoDevedor: 0,
      tipoEntrega: 'Varejo',
      vendedor: usuarioNome,
      dataPagamento: agora,
      descricao,
      itens: [
        {
          id: Date.now().toString(),
          aparelhoId: proposta.aparelhoId || undefined,
          descricao: `${proposta.modelo} ${proposta.capacidade || ''} ${proposta.cor || ''}`.trim(),
          quantidade: 1,
          valorInterno: proposta.custo || 0,
          valorExibir: proposta.valorTotal,
          desconto: 0,
          tipoDesconto: 'R$',
          total: proposta.valorTotal,
          observacao: proposta.imei ? `IMEI: ${proposta.imei}` : '',
          imei: proposta.imei || '',
        },
      ],
      ativo: true,
      taxa_cartao: 0,
    };

    const aparelhoIds = proposta.aparelhoId ? [proposta.aparelhoId] : [];
    const camposAparelho = proposta.aparelhoId
      ? { [proposta.aparelhoId]: { cliente: proposta.clienteNome } }
      : undefined;

    let tradeInPayload: Record<string, unknown> | null = null;
    if (proposta.isUpgrade && proposta.modeloTroca) {
      tradeInPayload = {
        loja_id: lojaId,
        modelo: proposta.modeloTroca,
        imei: proposta.imeiTroca || null,
        valor: proposta.valorTroca || 0,
        condicao: 'seminovo',
        ativo: true,
        status: 'disponivel',
        origem: 'upgrade_venda',
      };
    }

    const resultado = await registrarVendaAtomica(supabase, {
      venda: registroVenda,
      aparelhoIds,
      camposAparelho,
      tradeIn: tradeInPayload,
      origem: 'whatsapp_notinha_automatica',
      usuarioNome,
    });

    const vendaId = resultado.venda?.id ? String(resultado.venda.id).slice(0, 8).toUpperCase() : 'OK';

    const msgSucesso = `✅ *NOTINHA EMITIDA COM SUCESSO!* 🧾\n` +
      `──────────────────────────\n` +
      `📄 *Venda:* #${vendaId}\n` +
      `👤 *Cliente:* ${proposta.clienteNome}\n` +
      `📱 *Aparelho:* ${proposta.modelo}\n` +
      `💰 *Valor:* R$ ${Number(proposta.valorTotal).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}\n` +
      `📦 *Estoque:* Baixa realizada com sucesso no sistema!\n` +
      (proposta.isUpgrade ? `🔄 *Troca recebida:* ${proposta.modeloTroca}\n` : '') +
      `──────────────────────────\n` +
      `_Venda registrada e auditada no Phone Center!_`;

    return {
      sucesso: true,
      mensagem: sanitizarTextoWhatsApp(msgSucesso),
      vendaId,
    };
  } catch (err: any) {
    console.error('❌ Falha ao emitir notinha automática:', err);
    let msgErro = 'Não foi possível concluir a emissão da nota.';
    if (err instanceof ErroVenda) {
      msgErro = err.message;
    } else if (err?.message) {
      msgErro = err.message;
    }

    return {
      sucesso: false,
      mensagem: `⚠️ *Falha na emissão da notinha:*\n${msgErro}`,
    };
  }
}
