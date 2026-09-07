import { NextResponse, after } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { buildWhatsAppText, parseGeminiPlan, gerarPlanoComGemini, responderConversaNaturalComGemini } from './commandExecutor';
import { processImageVision, VisionEtiquetaResult } from '../../../../lib/image-vision-ocr';
import { verificarPermissaoRecursoPlano, obterPlanoPorTipo, TipoPlano, WHATSAPP_SUPORTE_URL } from '@/lib/planos-config';

export const maxDuration = 300; // Permite até 5 minutos para ciclo de vida do PIX no Vercel

// Instancia cliente do Supabase com Service Role Key para bypass de RLS no backend
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseServiceKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SERVICE_ROLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  '';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Configurações do Evolution API
function getCleanEvolutionUrl(): string {
  let url = (process.env.EVOLUTION_API_URL || 'http://13.140.36.50:8080').trim().replace(/\/+$/, '');
  if (!url) return 'http://13.140.36.50:8080';
  
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    url = `http://${url}`;
  }
  
  // Se informou o IP da VPS mas esqueceu da porta 8080, anexa a porta 8080
  if (url === 'http://13.140.36.50' || url === 'https://13.140.36.50') {
    url = 'http://13.140.36.50:8080';
  }
  
  return url;
}

const EVOLUTION_URL = getCleanEvolutionUrl();
const EVOLUTION_API_KEY = (process.env.EVOLUTION_API_KEY || '806DF49FA0E9-4088-B016-1CB736FAF449').trim();
const DEFAULT_INSTANCE = (process.env.EVOLUTION_INSTANCE_NAME || 'lucasimports').trim();

// ── GET: Endpoint de Validação & Healthcheck do Webhook ──
export async function GET() {
  return NextResponse.json(
    {
      status: 'online',
      service: 'Phone Center Evolution Webhook Engine + IA Vision OCR',
      timestamp: new Date().toISOString(),
      evolution_url: EVOLUTION_URL ? 'Configurado' : 'Pendente',
      instance: DEFAULT_INSTANCE,
    },
    { status: 200 }
  );
}

// ── AUXILIAR: Enviar Mensagem via Evolution API ──
async function enviarMensagemWhatsApp(instanceName: string, destination: string, text: string) {
  if (!EVOLUTION_URL || !EVOLUTION_API_KEY) {
    console.warn('⚠️ EVOLUTION_API_URL ou EVOLUTION_API_KEY não configurados no .env.local');
    return false;
  }

  const isGroup = destination.endsWith('@g.us');
  const cleanDestination = isGroup ? destination : destination.replace(/\D/g, '');
  if (!cleanDestination) return false;

  const targetInstance = instanceName || DEFAULT_INSTANCE;
  const endpoint = `${EVOLUTION_URL}/message/sendText/${targetInstance}`;

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: EVOLUTION_API_KEY,
      },
      body: JSON.stringify({
        number: cleanDestination,
        text,
        options: {
          delay: 800,
          presence: 'composing',
        },
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error(`❌ Erro ao enviar mensagem via Evolution API (${response.status}):`, errText);
      return false;
    }

    console.log(`✅ Mensagem enviada com sucesso para ${cleanDestination} via instância "${targetInstance}"`);
    return true;
  } catch (err: any) {
    console.error('❌ Falha na requisição para Evolution API:', err?.message || err);
    return false;
  }
}

// ── AUXILIAR: Enviar Imagem / QR Code via Evolution API ──
async function enviarImagemWhatsApp(
  instanceName: string,
  destination: string,
  mediaUrlOrBase64: string,
  caption?: string
) {
  if (!EVOLUTION_URL || !EVOLUTION_API_KEY) {
    console.warn('⚠️ EVOLUTION_API_URL ou EVOLUTION_API_KEY não configurados no .env.local');
    return false;
  }

  const isGroup = destination.endsWith('@g.us');
  const cleanDestination = isGroup ? destination : destination.replace(/\D/g, '');
  if (!cleanDestination) return false;

  const targetInstance = instanceName || DEFAULT_INSTANCE;
  const endpoint = `${EVOLUTION_URL}/message/sendMedia/${targetInstance}`;

  // Se for string base64 pura sem o prefixo data URI, inclui o prefixo
  let mediaPayload = mediaUrlOrBase64;
  if (!mediaPayload.startsWith('http://') && !mediaPayload.startsWith('https://') && !mediaPayload.startsWith('data:')) {
    mediaPayload = `data:image/png;base64,${mediaPayload}`;
  }

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: EVOLUTION_API_KEY,
      },
      body: JSON.stringify({
        number: cleanDestination,
        mediatype: 'image',
        mimetype: 'image/png',
        caption: caption || '',
        media: mediaPayload,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error(`❌ Erro ao enviar imagem via Evolution API (${response.status}):`, errText);
      return false;
    }

    console.log(`✅ Imagem enviada com sucesso para ${cleanDestination} via instância "${targetInstance}"`);
    return true;
  } catch (err: any) {
    console.error('❌ Falha na requisição sendMedia para Evolution API:', err?.message || err);
    return false;
  }
}

// ── AUXILIAR: Aprovar Renovação de Loja e Notificar no WhatsApp ──
async function aprovarRenovacaoLoja(
  lojaId: string,
  diasAdicionar: number,
  paymentId: string,
  valor: number,
  instanceName?: string,
  destination?: string
) {
  const { data: loja } = await supabase
    .from('lojas')
    .select('*')
    .eq('id', lojaId)
    .maybeSingle();

  if (!loja) return;

  // Calcula nova data de vencimento
  let baseDate = new Date();
  if (loja.data_vencimento) {
    const parts = String(loja.data_vencimento).split('T')[0].split('-');
    if (parts.length === 3) {
      const year = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10) - 1;
      const day = parseInt(parts[2], 10);
      const vencAtual = new Date(year, month, day);
      if (vencAtual.getTime() > baseDate.getTime()) {
        baseDate = vencAtual;
      }
    }
  }

  const novaDataMs = baseDate.getTime() + diasAdicionar * 24 * 60 * 60 * 1000;
  const novoVencimento = new Date(novaDataMs).toISOString().split('T')[0];
  const [ny, nm, nd] = novoVencimento.split('-');
  const novoVencimentoFmt = `${nd}/${nm}/${ny}`;

  // 1. Atualizar a loja para ativo
  await supabase
    .from('lojas')
    .update({
      plano_status: 'ativo',
      data_vencimento: novoVencimento,
      solicitacao_liberacao_status: 'aprovado',
      ativo: true,
    })
    .eq('id', lojaId);

  // 2. Atualizar histórico
  await supabase
    .from('historico_pagamentos_planos')
    .update({
      status: 'aprovado',
      observacao: `Aprovado (ID: ${paymentId}) | Renovado +${diasAdicionar} dias até ${novoVencimentoFmt}`,
    })
    .eq('mp_payment_id', paymentId);

  // 3. Notificar no WhatsApp
  if (destination) {
    const msgAprovado = `🎉 *PAGAMENTO CONFIRMADO COM SUCESSO!*\n\n` +
      `Recebemos seu PIX de *R$ ${valor.toFixed(2).replace('.', ',')}*!\n` +
      `Sua assinatura foi estendida em *+${diasAdicionar} dias*.\n\n` +
      `📅 *Novo Vencimento*: *${novoVencimentoFmt}*\n` +
      `✅ O sistema está 100% liberado. Boas vendas! 🚀`;
    await enviarMensagemWhatsApp(instanceName || DEFAULT_INSTANCE, destination, msgAprovado);
  }
}

// ── AUXILIAR: Monitorar Ciclo de Vida do PIX (5 minutos com aviso a 1 min de expirar) ──
async function monitorarCicloVidaPix(params: {
  paymentId: string;
  lojaId: string;
  diasAdicionar: number;
  valorFinal: number;
  instanceName: string;
  targetDestination: string;
  tokenMercadoPago: string;
}) {
  const { paymentId, lojaId, diasAdicionar, valorFinal, instanceName, targetDestination, tokenMercadoPago } = params;

  const verificarSeAprovado = async () => {
    // 1. Verifica no banco se já foi aprovado pelo Webhook
    const { data: hist } = await supabase
      .from('historico_pagamentos_planos')
      .select('status')
      .eq('mp_payment_id', paymentId)
      .maybeSingle();

    if (hist?.status === 'aprovado') return true;

    // 2. Consulta API do Mercado Pago
    try {
      const res = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
        headers: { Authorization: `Bearer ${tokenMercadoPago}` },
      });
      if (res.ok) {
        const mpData = await res.json();
        if (mpData.status === 'approved') {
          await aprovarRenovacaoLoja(lojaId, diasAdicionar, paymentId, valorFinal, instanceName, targetDestination);
          return true;
        }
      }
    } catch (e) {
      console.error('Erro ao consultar Mercado Pago no monitoramento:', e);
    }
    return false;
  };

  // Aguarda 4 minutos (240 segundos)
  await new Promise((resolve) => setTimeout(resolve, 240 * 1000));

  if (await verificarSeAprovado()) {
    return;
  }

  // Avisa no WhatsApp que falta 1 minuto para expirar
  await enviarMensagemWhatsApp(
    instanceName,
    targetDestination,
    `⚠️ *Aviso de Expiração do PIX*\n\nResta apenas *1 minuto* para o código PIX de *R$ ${valorFinal.toFixed(2).replace('.', ',')}* expirar!\n\nCaso já tenha efetuado o pagamento, aguarde alguns instantes pela confirmação automática. ✅`
  );

  // Aguarda o minuto final (60 segundos)
  await new Promise((resolve) => setTimeout(resolve, 60 * 1000));

  if (await verificarSeAprovado()) {
    return;
  }

  // Marca como expirado e avisa
  await supabase
    .from('historico_pagamentos_planos')
    .update({
      status: 'expirado',
      observacao: `Expirado após 5 minutos sem pagamento (ID: ${paymentId})`,
    })
    .eq('mp_payment_id', paymentId);

  await enviarMensagemWhatsApp(
    instanceName,
    targetDestination,
    `⌛ *Código PIX Expirado*\n\nO prazo de 5 minutos encerrou e o código PIX foi cancelado para sua segurança.\n\nPara gerar um novo quando quiser, basta enviar:\n👉 *!plano pagar*`
  );
}

// ── AUXILIAR: Resolver ID da Loja ──

// ── AUXILIAR: Gerar Variantes de Telefone Brasileiro (DDI, DDD, 9º Dígito) ──
function obterVariantesTelefone(rawPhone: string): string[] {
  const digits = String(rawPhone || '').replace(/\D/g, '');
  if (!digits) return [];
  const variants = new Set<string>();
  variants.add(digits);

  if (digits.startsWith('55') && digits.length >= 12) {
    const local = digits.substring(2);
    variants.add(local);
    const ddd = local.substring(0, 2);
    const num = local.substring(2);
    if (num.length === 9 && num.startsWith('9')) {
      variants.add(`55${ddd}${num.substring(1)}`);
      variants.add(`${ddd}${num.substring(1)}`);
    } else if (num.length === 8) {
      variants.add(`55${ddd}9${num}`);
      variants.add(`${ddd}9${num}`);
    }
  } else if (digits.length >= 10 && digits.length <= 11) {
    variants.add(`55${digits}`);
    const ddd = digits.substring(0, 2);
    const num = digits.substring(2);
    if (num.length === 9 && num.startsWith('9')) {
      variants.add(`55${ddd}${num.substring(1)}`);
      variants.add(`${ddd}${num.substring(1)}`);
    } else if (num.length === 8) {
      variants.add(`55${ddd}9${num}`);
      variants.add(`${ddd}9${num}`);
    }
  }

  return Array.from(variants);
}

export interface UsuarioResolvido {
  lojaId: string;
  lojaNome: string;
  usuarioNome: string;
  papel: 'owner' | 'staff' | 'motoboy' | 'nenhum';
  planoTipo?: string;
  planoStatus?: string;
  dataVencimento?: string;
  diasRestantes?: number;
  isTrial?: boolean;
}

// ── AUXILIAR: Resolver Loja e Usuário a partir do Telefone de Quem Enviou ──
async function resolverLojaEUsuarioPorTelefone(
  authorPhone: string,
  instanceName?: string
): Promise<UsuarioResolvido | null> {
  const variants = obterVariantesTelefone(authorPhone);
  if (variants.length === 0) return null;

  // 1. Busca em whatsapp_permissoes (fonte prioritária de permissão no WhatsApp)
  try {
    const { data: perms } = await supabase
      .from('whatsapp_permissoes')
      .select('loja_id, telefone, nome, papel, ativo')
      .in('telefone', variants)
      .eq('ativo', true)
      .limit(1);

    if (perms && perms.length > 0) {
      const p = perms[0];
      const { data: loja } = await supabase
        .from('lojas')
        .select('id, nome, plano_tipo, plano_status, data_vencimento, plano_trial_ate')
        .eq('id', p.loja_id)
        .maybeSingle();

      if (loja) {
        let diasRestantes = 0;
        if (loja.data_vencimento) {
          const vDate = new Date(loja.data_vencimento);
          const agora = new Date();
          diasRestantes = Math.ceil((vDate.getTime() - agora.getTime()) / (1000 * 60 * 60 * 24));
        }

        return {
          lojaId: loja.id,
          lojaNome: loja.nome || 'Phone Center',
          usuarioNome: p.nome || 'Colaborador',
          papel: (p.papel as any) || 'staff',
          planoTipo: loja.plano_tipo || 'entrada',
          planoStatus: loja.plano_status || 'ativo',
          dataVencimento: loja.data_vencimento || undefined,
          diasRestantes,
        };
      }
    }
  } catch (err) {
    console.warn('Erro ao consultar whatsapp_permissoes:', err);
  }

  // 2. Busca na tabela lojas (dono da loja)
  try {
    const { data: lojas } = await supabase
      .from('lojas')
      .select('id, nome, telefone, dono_whatsapp, plano_tipo, plano_status, data_vencimento, plano_trial_ate')
      .eq('ativo', true);

    if (lojas && lojas.length > 0) {
      const matchLoja = lojas.find((l) => {
        const tel1 = (l.telefone || '').replace(/\D/g, '');
        const tel2 = (l.dono_whatsapp || '').replace(/\D/g, '');
        return variants.some((v) => (tel1 && (tel1 === v || v.endsWith(tel1) || tel1.endsWith(v))) ||
                                  (tel2 && (tel2 === v || v.endsWith(tel2) || tel2.endsWith(v))));
      });

      if (matchLoja) {
        let diasRestantes = 0;
        if (matchLoja.data_vencimento) {
          const vDate = new Date(matchLoja.data_vencimento);
          const agora = new Date();
          diasRestantes = Math.ceil((vDate.getTime() - agora.getTime()) / (1000 * 60 * 60 * 24));
        }

        return {
          lojaId: matchLoja.id,
          lojaNome: matchLoja.nome || 'Phone Center',
          usuarioNome: 'Proprietário',
          papel: 'owner',
          planoTipo: matchLoja.plano_tipo || 'entrada',
          planoStatus: matchLoja.plano_status || 'ativo',
          dataVencimento: matchLoja.data_vencimento || undefined,
          diasRestantes,
        };
      }
    }
  } catch (err) {
    console.warn('Erro ao consultar lojas:', err);
  }

  // 3. Busca na tabela tecnicos (colaboradores cadastrados pelo lojista como vendedor, técnico ou gerente)
  try {
    const { data: tecs, error: errTecs } = await supabase
      .from('tecnicos')
      .select('id, nome, telefone, whatsapp, cargo, tipo, loja_id, ativo');

    if (!errTecs && tecs && tecs.length > 0) {
      const matchTec = tecs.find((t) => {
        if (t.ativo === false) return false;
        const tel1 = (t.whatsapp || '').replace(/\D/g, '');
        const tel2 = (t.telefone || '').replace(/\D/g, '');
        return variants.some((v) => {
          if (!v) return false;
          if (tel1 && (tel1 === v || v.endsWith(tel1) || tel1.endsWith(v))) return true;
          if (tel2 && (tel2 === v || v.endsWith(tel2) || tel2.endsWith(v))) return true;
          // Compara os últimos 8 dígitos (elimina inconsistências de 9º dígito / DDD / 55)
          if (v.length >= 8) {
            const vLast8 = v.slice(-8);
            if (tel1 && tel1.length >= 8 && tel1.slice(-8) === vLast8) return true;
            if (tel2 && tel2.length >= 8 && tel2.slice(-8) === vLast8) return true;
          }
          return false;
        });
      });

      if (matchTec && matchTec.loja_id) {
        const { data: loja } = await supabase
          .from('lojas')
          .select('id, nome, plano_tipo, plano_status, data_vencimento, plano_trial_ate')
          .eq('id', matchTec.loja_id)
          .maybeSingle();

        if (loja) {
          let diasRestantes = 0;
          if (loja.data_vencimento) {
            const vDate = new Date(loja.data_vencimento);
            const agora = new Date();
            diasRestantes = Math.ceil((vDate.getTime() - agora.getTime()) / (1000 * 60 * 60 * 24));
          }

          const cargoStr = String(matchTec.cargo || matchTec.tipo || '').toLowerCase();
          const papel: 'owner' | 'staff' | 'motoboy' =
            ['owner', 'dono', 'admin', 'gerente', 'administrador'].some(c => cargoStr.includes(c))
              ? 'owner'
              : ['motoboy', 'entregador'].some(c => cargoStr.includes(c))
              ? 'motoboy'
              : 'staff';

          return {
            lojaId: loja.id,
            lojaNome: loja.nome || 'Phone Center',
            usuarioNome: matchTec.nome || 'Colaborador',
            papel,
            planoTipo: loja.plano_tipo || 'entrada',
            planoStatus: loja.plano_status || 'ativo',
            dataVencimento: loja.data_vencimento || undefined,
            diasRestantes,
          };
        }
      }
    }
  } catch (err) {
    console.warn('Erro ao consultar tecnicos:', err);
  }

  // 4. Fallback por instância (especialmente para grupos multi-loja)
  if (instanceName) {
    const lojaIdFallback = await resolverLojaId(instanceName);
    if (lojaIdFallback) {
      const { data: loja } = await supabase
        .from('lojas')
        .select('id, nome, plano_tipo, plano_status, data_vencimento')
        .eq('id', lojaIdFallback)
        .maybeSingle();

      if (loja) {
        return {
          lojaId: loja.id,
          lojaNome: loja.nome || 'Phone Center',
          usuarioNome: 'Lojista',
          papel: 'staff',
          planoTipo: loja.plano_tipo || 'entrada',
          planoStatus: loja.plano_status || 'ativo',
          dataVencimento: loja.data_vencimento || undefined,
        };
      }
    }
  }

  return null;
}

async function resolverLojaId(instanceName?: string): Promise<string | null> {
  if (instanceName && instanceName.startsWith('loja-')) {
    const extractedId = instanceName.replace('loja-', '').trim();
    if (extractedId.length >= 30) return extractedId;
  }

  if (instanceName) {
    const { data: session } = await supabase
      .from('whatsapp_sessions')
      .select('loja_id')
      .or(`session_name.eq.${instanceName},loja_id.eq.${instanceName}`)
      .maybeSingle();

    if (session?.loja_id) return session.loja_id;

    // Busca loja por aproximação de nome (ex: lucasimports -> Lucas Imports)
    const { data: lojas } = await supabase.from('lojas').select('id, nome').eq('ativo', true);
    if (lojas && lojas.length > 0) {
      const cleanInst = instanceName.toLowerCase().replace(/[^a-z0-9]/g, '');
      const lojaMatch = lojas.find((l) => {
        const cleanNome = (l.nome || '').toLowerCase().replace(/[^a-z0-9]/g, '');
        return cleanNome.includes(cleanInst) || cleanInst.includes(cleanNome);
      });
      if (lojaMatch) return lojaMatch.id;
    }
  }

  return null;
}

interface PermissaoWhatsAppResult {
  autorizado: boolean;
  papel: 'owner' | 'staff' | 'motoboy' | 'nenhum' | 'nao_configurado';
  motivo?: string;
}

// ── AUXILIAR: Verificar Permissão de Usuário por WhatsApp ──
async function verificarPermissaoWhatsApp(
  lojaId: string,
  telefone: string,
  papeisPermitidos: ('owner' | 'staff' | 'motoboy')[] = ['owner', 'staff']
): Promise<PermissaoWhatsAppResult> {
  if (!lojaId) {
    return { autorizado: false, papel: 'nenhum', motivo: 'Loja não identificada' };
  }

  const cleanPhone = (telefone || '').replace(/\D/g, '');
  if (!cleanPhone) {
    return { autorizado: false, papel: 'nenhum', motivo: 'Telefone inválido' };
  }

  try {
    const { data: permissoes, error } = await supabase
      .from('whatsapp_permissoes')
      .select('*')
      .eq('loja_id', lojaId)
      .eq('ativo', true);

    if (error) {
      console.warn('⚠️ Erro ao consultar whatsapp_permissoes (tabela pode estar pendente no Supabase):', error.message);
      return { autorizado: true, papel: 'nao_configurado' };
    }

    // Rollout seguro: se não há permissões cadastradas para esta loja,
    // permite a execução e registra aviso em logs_sistema para não quebrar lojas em produção.
    if (!permissoes || permissoes.length === 0) {
      try {
        await supabase.from('logs_sistema').insert({
          loja_id: lojaId,
          tipo_evento: 'permissao_nao_configurada',
          ator_telefone: cleanPhone,
          ator_papel: 'nao_configurado',
          acao: 'Acesso sem permissões cadastradas',
          detalhes: `Loja ${lojaId} não possui registros em whatsapp_permissoes. Acesso liberado por fallback de rollout.`,
        });
      } catch (logErr) {
        // Silêncio para não quebrar fluxo
      }
      return { autorizado: true, papel: 'nao_configurado' };
    }

    // Compara telefone considerando DDI (55), DDD e 9º dígito
    const permissaoEncontrada = permissoes.find((p: any) => {
      const pClean = (p.telefone || '').replace(/\D/g, '');
      if (!pClean) return false;
      if (pClean === cleanPhone) return true;
      if (cleanPhone.endsWith(pClean) || pClean.endsWith(cleanPhone)) return true;
      if (cleanPhone.length >= 8 && pClean.length >= 8) {
        const last8User = cleanPhone.slice(-8);
        const last8Perm = pClean.slice(-8);
        if (last8User === last8Perm) {
          if (cleanPhone.length >= 10 && pClean.length >= 10) {
            const dddUser = cleanPhone.length >= 11 ? cleanPhone.slice(-11, -9) : cleanPhone.slice(-10, -8);
            const dddPerm = pClean.length >= 11 ? pClean.slice(-11, -9) : pClean.slice(-10, -8);
            return dddUser === dddPerm;
          }
          return true;
        }
      }
      return false;
    });

    if (!permissaoEncontrada) {
      return { autorizado: false, papel: 'nenhum', motivo: 'Número não cadastrado nas permissões da loja' };
    }

    const papel = (permissaoEncontrada.papel || 'staff') as 'owner' | 'staff' | 'motoboy' | 'nenhum';
    if (papeisPermitidos.includes(papel as any)) {
      return { autorizado: true, papel };
    }

    return { autorizado: false, papel, motivo: `Papel '${papel}' não autorizado para esta ação` };
  } catch (err: any) {
    console.error('❌ Falha inesperada ao verificar permissão:', err);
    return { autorizado: true, papel: 'nao_configurado' };
  }
}

// ── AUXILIAR: Verificar se a loja é a Lucas Imports ──
async function verificarSeLojaLucasImports(lojaId: string | null, instanceName: string): Promise<boolean> {
  const cleanInst = (instanceName || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  if (cleanInst.includes('lucasimports')) return true;

  if (lojaId) {
    const { data: loja } = await supabase
      .from('lojas')
      .select('nome')
      .eq('id', lojaId)
      .maybeSingle();

    const cleanNome = (loja?.nome || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    if (cleanNome.includes('lucasimports')) return true;
  }

  return false;
}

// ── AUXILIAR: Buscar Base64 de Mídia na Evolution API caso não venha no webhook ──
async function buscarMidiaBase64Evolution(
  instanceName: string,
  messageId: string,
  messageObj: any
): Promise<{ base64: string; mimetype: string } | null> {
  if (!EVOLUTION_URL || !EVOLUTION_API_KEY) return null;
  const targetInstance = instanceName || DEFAULT_INSTANCE;

  // 1. Tenta POST /chat/findMediaBase64/${targetInstance}
  try {
    const res = await fetch(`${EVOLUTION_URL}/chat/findMediaBase64/${targetInstance}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: EVOLUTION_API_KEY,
      },
      body: JSON.stringify({
        message: {
          key: { id: messageId },
        },
        convertToMp4: false,
      }),
    });

    if (res.ok) {
      const data = await res.json();
      const b64 = data.base64 || data.data?.base64 || data.media;
      if (b64 && typeof b64 === 'string') {
        return {
          base64: b64,
          mimetype: data.mimetype || 'image/jpeg',
        };
      }
    }
  } catch (err) {
    console.warn('⚠️ Falha ao buscar media via /chat/findMediaBase64:', err);
  }

  // 2. Tenta POST /chat/getBase64FromMediaMessage/${targetInstance}
  try {
    const res2 = await fetch(`${EVOLUTION_URL}/chat/getBase64FromMediaMessage/${targetInstance}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: EVOLUTION_API_KEY,
      },
      body: JSON.stringify({
        message: messageObj,
        convertToMp4: false,
      }),
    });

    if (res2.ok) {
      const data2 = await res2.json();
      const b64_2 = data2.base64 || data2.data?.base64 || data2.media;
      if (b64_2 && typeof b64_2 === 'string') {
        return {
          base64: b64_2,
          mimetype: data2.mimetype || 'image/jpeg',
        };
      }
    }
  } catch (err2) {
    console.warn('⚠️ Falha ao buscar media via /chat/getBase64FromMediaMessage:', err2);
  }

  return null;
}

// ── AUXILIAR: Checagem de IMEI Roubado / Bloqueio de Segurança ──
interface ChecagemImeiResult {
  bloqueado: boolean;
  motivo?: string;
  origem: 'base_local' | 'base_oficial_mock';
}

async function verificarImeiRoubado(lojaId: string, imei: string): Promise<ChecagemImeiResult> {
  const cleanImei = imei.replace(/\D/g, '');

  // 1. Checagem interna na base de dados do Phone Center
  const { data: aparRestrito } = await supabase
    .from('aparelhos')
    .select('id, modelo, observacoes, status')
    .eq('imei', cleanImei)
    .or('status.eq.bloqueado,observacoes.ilike.%furto%,observacoes.ilike.%roubo%,observacoes.ilike.%bloqueado%')
    .limit(1)
    .maybeSingle();

  if (aparRestrito) {
    return {
      bloqueado: true,
      motivo: `Aparelho consta com alerta de restrição interna no sistema (${aparRestrito.modelo || 'Identificado'})`,
      origem: 'base_local',
    };
  }

  // TODO: Integrar com API oficial de consulta de IMEI (ex: Anatel / GSMA Device Check / Base Nacional SINESP).
  // Atualmente operando em validação de formato e checagem da base local do sistema.
  return {
    bloqueado: false,
    origem: 'base_oficial_mock',
  };
}

// ── AUXILIAR: Processar e Comparar Resultado do OCR de Etiqueta com Supabase ──
async function processarResultadoVisionEtiqueta(
  vision: VisionEtiquetaResult,
  lojaId: string | null,
  pushName: string
): Promise<string> {
  if (!lojaId) {
    return "❌ Não consegui identificar sua loja para executar este comando, contate o suporte";
  }

  // 1. Se for comprovante de pagamento bancário (Pix/TED)
  if (vision.tipo_documento === 'comprovante_pagamento' || (vision.amount && !vision.imei && !vision.modelo)) {
    const valorFmt = vision.amount ? `R$ ${Number(vision.amount).toFixed(2).replace('.', ',')}` : 'Não identificado';
    const mod = vision.modality || 'Pix / Transferência';
    const tx = vision.machine_serial || 'N/A';
    const pessoa = vision.pagador_ou_recebedor ? `\n👤 *Envolvido:* ${vision.pagador_ou_recebedor}` : '';

    return `🧾 *COMPROVANTE BANCÁRIO IDENTIFICADO COM IA!*

💰 *Valor:* *${valorFmt}*
💳 *Modalidade:* ${mod}${pessoa}
🆔 *Autenticação/TXID:* \`${tx}\`

✅ *Comprovante lido com sucesso!*
💡 *Dica:* Para dar baixa em dívida de lojista, utilize:
\`!abater [Nome do Lojista] ${vision.amount || ''}\``.trim();
  }

  // 2. Se for etiqueta de aparelho celular
  const imei = vision.imei ? String(vision.imei).replace(/\D/g, '') : null;
  const codigoEtiqueta = vision.codigo_etiqueta ? String(vision.codigo_etiqueta).trim() : null;
  const modeloLido = vision.modelo ? String(vision.modelo).trim() : null;
  const capacidadeLida = vision.capacidade ? String(vision.capacidade).trim() : null;
  const corLida = vision.cor ? String(vision.cor).trim() : null;
  const bateriaLida = vision.saude_bateria ? Number(vision.saude_bateria) : null;
  const precoLido = vision.preco ? Number(vision.preco) : null;

  let aparelhoEncontrado: any = null;

  // Busca 1: Por IMEI no Supabase (exato ou que termine com os dígitos)
  if (imei && imei.length >= 4) {
    const qImei = supabase.from('aparelhos').select('*').eq('loja_id', lojaId);

    const { data: porImei } = await qImei.or(`imei.eq.${imei},imei.ilike.%${imei}%`).limit(1);
    if (porImei && porImei.length > 0) {
      aparelhoEncontrado = porImei[0];
    }
  }

  // Busca 2: Por Código da Etiqueta / Código Único
  if (!aparelhoEncontrado && codigoEtiqueta) {
    const qCod = supabase.from('aparelhos').select('*').eq('loja_id', lojaId);

    const { data: porCod } = await qCod.or(`codigo.eq.${codigoEtiqueta},codigoUnico.eq.${codigoEtiqueta},id.eq.${codigoEtiqueta}`).limit(1);
    if (porCod && porCod.length > 0) {
      aparelhoEncontrado = porCod[0];
    }
  }

  // Busca 3: Por Modelo + Capacidade (se houver correspondência única em estoque)
  if (!aparelhoEncontrado && modeloLido) {
    let qMod = supabase.from('aparelhos').select('*').ilike('modelo', `%${modeloLido}%`).eq('loja_id', lojaId);
    if (capacidadeLida) qMod = qMod.ilike('capacidade', `%${capacidadeLida}%`);

    const { data: porMod } = await qMod.eq('ativo', true).neq('status', 'vendido').limit(2);
    if (porMod && porMod.length === 1) {
      aparelhoEncontrado = porMod[0];
    }
  }

  // ── CASO A: Aparelho LOCALIZADO no Banco de Dados ──
  if (aparelhoEncontrado) {
    const isVendido =
      aparelhoEncontrado.condicao === 'vendido' ||
      aparelhoEncontrado.status === 'vendido' ||
      aparelhoEncontrado.ativo === false;

    // Se já foi vendido, busca histórico na tabela 'vendas'
    if (isVendido) {
      const qVenda = supabase.from('vendas').select('*').eq('loja_id', lojaId);

      const { data: vendas } = await qVenda
        .or(`aparelho_id.eq.${aparelhoEncontrado.id},imei.eq.${aparelhoEncontrado.imei || imei}`)
        .order('created_at', { ascending: false })
        .limit(1);

      const venda = vendas?.[0];
      const dataVendaFmt = venda?.dataPagamento || venda?.created_at || aparelhoEncontrado.dataVenda || 'Data recente';
      const comprador = venda?.clienteNome || aparelhoEncontrado.comprador || 'Cliente';
      const valorVendaFmt = (venda?.valor || aparelhoEncontrado.precoVenda)
        ? `R$ ${Number(venda?.valor || aparelhoEncontrado.precoVenda).toFixed(2).replace('.', ',')}`
        : 'Valor não informado';

      return `⚠️ *ALERTA DE SEGURANÇA: APARELHO JÁ CONSTA COMO VENDIDO!*

📱 *Aparelho:* ${aparelhoEncontrado.marca || ''} ${aparelhoEncontrado.modelo} (${aparelhoEncontrado.capacidade || 'N/A'})
🎨 *Cor:* ${aparelhoEncontrado.cor || 'Padrão'}
🔢 *IMEI:* \`${aparelhoEncontrado.imei || imei || 'Não registrado'}\`
🏷️ *Código:* \`${aparelhoEncontrado.codigo || aparelhoEncontrado.id.slice(0, 8)}\`

📋 *Histórico da Saída:*
• *Status:* 🔴 *VENDIDO / BAIXADO*
• *Comprador:* ${comprador}
• *Valor da Venda:* ${valorVendaFmt}
• *Data de Venda:* ${dataVendaFmt}

⚠️ *Atenção:* Este aparelho já saiu do estoque oficial. Não o comercialize novamente sem antes reativá-lo!`.trim();
    }

    // Aparelho ATIVO e DISPONÍVEL em estoque!
    // Comparação de dados:
    let comparativoBateria = '';
    const batSistema = parseInt(String(aparelhoEncontrado.saudeBateria || aparelhoEncontrado.saude_bateria || '0').replace(/\D/g, ''), 10);
    if (bateriaLida && batSistema > 0) {
      if (bateriaLida === batSistema) {
        comparativoBateria = `🔋 *Saúde Bateria:* ${batSistema}% ✅ *(confere com sistema)*`;
      } else {
        comparativoBateria = `🔋 *Saúde Bateria:* ${bateriaLida}% na etiqueta *(sistema marca ${batSistema}% ⚠️)*`;
      }
    } else if (batSistema > 0) {
      comparativoBateria = `🔋 *Saúde Bateria:* ${batSistema}% (no sistema)`;
    } else if (bateriaLida) {
      comparativoBateria = `🔋 *Saúde Bateria:* ${bateriaLida}% (lida na etiqueta)`;
    }

    const precoVarejo = aparelhoEncontrado.preco ? `R$ ${Number(aparelhoEncontrado.preco).toFixed(2).replace('.', ',')}` : 'Consulte';
    const precoAtacado = (aparelhoEncontrado.precoAtacado || aparelhoEncontrado.preco_atacado)
      ? `R$ ${Number(aparelhoEncontrado.precoAtacado || aparelhoEncontrado.preco_atacado).toFixed(2).replace('.', ',')}`
      : 'Não definido';

    const identificadorAcao = aparelhoEncontrado.imei || aparelhoEncontrado.codigo || aparelhoEncontrado.id;

    return `🏷️ *ETIQUETA IDENTIFICADA COM SUCESSO!*

📱 *${aparelhoEncontrado.marca || ''} ${aparelhoEncontrado.modelo}* (${aparelhoEncontrado.capacidade || capacidadeLida || 'N/A'})
🎨 *Cor:* ${aparelhoEncontrado.cor || corLida || 'Padrão'}
🔢 *IMEI:* \`${aparelhoEncontrado.imei || imei || 'N/A'}\`
🏷️ *Código Sistema:* \`${aparelhoEncontrado.codigo || aparelhoEncontrado.id.slice(0, 8)}\`
${comparativoBateria ? comparativoBateria + '\n' : ''}
📦 *Status:* 🟢 *DISPONÍVEL EM ESTOQUE*
💵 *Preço Varejo:* ${precoVarejo}
🤝 *Preço Atacado:* ${precoAtacado}

⚡ *Ações Rápidas via WhatsApp:*
• *Vender aparelho:* Digite \`!vender ${identificadorAcao} [valor] [nome]\`
• *Alterar preço:* Digite \`!preco ${identificadorAcao} [novo_valor]\``.trim();
  }

  // ── CASO B: Aparelho NÃO ENCONTRADO no banco de dados ──
  const precoSugerido = precoLido ? `R$ ${precoLido.toFixed(2).replace('.', ',')}` : 'Não informado';
  const capFmt = capacidadeLida || '128GB';
  const modFmt = modeloLido || 'Smartphone';
  const imeiFmt = imei || 'SEM-IMEI';

  return `🔍 *APARELHO NÃO ENCONTRADO NO ESTOQUE*

🤖 *Dados lidos da etiqueta com IA:*
• *Modelo:* ${modFmt}
• *Capacidade:* ${capFmt}
• *Cor:* ${corLida || 'Padrão'}
• *IMEI:* \`${imei || 'Não identificado'}\`
• *Bateria:* ${bateriaLida ? bateriaLida + '%' : 'Não informada'}
• *Preço na Etiqueta:* ${precoSugerido}
• *Código da Etiqueta:* ${codigoEtiqueta || 'N/A'}

📥 *Deseja dar entrada desse aparelho no sistema?*
Basta responder:
\`!cadastrar ${modFmt} ${capFmt} ${imeiFmt} ${precoLido || ''}\`
e eu cadastro no estoque da loja instantaneamente!`.trim();
}

// ── AUXILIAR: Processar Lista de Preços de Fornecedor ──
async function processarListaPrecos(lines: string[], senderName: string, lojaId: string) {
  let currentModelName = '';
  let currentCapacity = '';
  let pendingColors: string[] = [];
  const extractedData: Record<string, number[]> = {};

  for (const line of lines) {
    const cleanLine = line.trim();
    if (!cleanLine) continue;

    const modelMatch = cleanLine.match(/^[📲📱]\s*\*?([^*🇺🇸%]+)\*?/iu);
    if (modelMatch) {
      let fullModel = modelMatch[1]
        .replace(/\*/g, '')
        .replace(/IPHONE/gi, 'iPhone')
        .replace(/\p{Extended_Pictographic}/gu, '')
        .trim();

      const capMatch = fullModel.match(/(\d+\s*(?:GB|TB))/i);
      if (capMatch) {
        currentCapacity = capMatch[1].toUpperCase().replace(/\s/g, '');
        currentModelName = fullModel.replace(capMatch[0], '').trim();
      } else {
        currentModelName = fullModel;
        currentCapacity = 'N/A';
      }
      pendingColors = [];
      continue;
    }

    const priceMatch = cleanLine.match(
      /(?:💰|💵|R\$|[\u26aa\u26ab\ud83d\udd35\ud83d\udfe0\ud83c\udf38\ud83d\udfe2\ud83d\udfe1\ud83d\udfe3\ud83d\udc2a\ud83d\udc2d\ud83d\udd18])\s*(?:R\$)?\s*(?:\d+%\s*)?(\d{1,3}(?:\.\d{3})*,\d{2}|\d+,\d{2}|\d{3,})/i
    );

    if (priceMatch && currentModelName) {
      const rawPrice = priceMatch[1].replace(/\./g, '').replace(',', '.');
      const price = parseFloat(rawPrice);

      if (!isNaN(price) && price > 0) {
        const colorsToProcess = [...pendingColors];
        if (colorsToProcess.length === 0) {
          let detectedColor = 'Padrão';
          if (cleanLine.includes('⚫')) detectedColor = 'Preto';
          else if (cleanLine.includes('⚪')) detectedColor = 'Branco/Prata';
          else if (cleanLine.includes('🔵')) detectedColor = 'Azul';
          else if (cleanLine.includes('🟡')) detectedColor = 'Dourado/Amarelo';
          else if (cleanLine.includes('🔴')) detectedColor = 'Vermelho';
          else if (cleanLine.includes('🟣')) detectedColor = 'Roxo';
          else if (cleanLine.includes('🟢')) detectedColor = 'Verde';
          else if (cleanLine.includes('🩷')) detectedColor = 'Rosa';
          else if (cleanLine.includes('🩶')) detectedColor = 'Cinza';
          colorsToProcess.push(detectedColor);
        }

        for (const cor of colorsToProcess) {
          const key = `${currentModelName}|${currentCapacity}|${cor}`;
          if (!extractedData[key]) extractedData[key] = [];
          extractedData[key].push(price);
        }
        pendingColors = [];
      }
    }
  }

  const entries = Object.entries(extractedData);
  if (entries.length === 0) return 0;

  let cadastradosOuAtualizados = 0;

  for (const [modelKey, prices] of entries) {
    if (prices.length === 0) continue;
    const sorted = [...prices].sort((a, b) => b - a);
    let basePrice = sorted[0];
    basePrice += 300; // Margem padrão

    const [modelName, capacity, cor] = modelKey.split('|');

    const { data: existentes } = await supabase
      .from('aparelhos')
      .select('id')
      .ilike('modelo', modelName)
      .eq('loja_id', lojaId)
      .eq('condicao', 'seminovo');

    if (existentes && existentes.length > 0) {
      await supabase
        .from('aparelhos')
        .update({
          preco: basePrice,
          observacoes: `Atualizado via WhatsApp (${senderName})`,
        })
        .ilike('modelo', modelName)
        .eq('loja_id', lojaId);
    } else {
      await supabase.from('aparelhos').insert({
        loja_id: lojaId,
        marca: modelName.toUpperCase().includes('IPHONE') ? 'Apple' : 'Smartphone',
        modelo: modelName,
        capacidade: capacity,
        cor,
        condicao: 'seminovo',
        preco: basePrice,
        ativo: true,
        observacoes: `Importado de lista WhatsApp (${senderName})`,
      });
    }

    cadastradosOuAtualizados++;
  }

  return cadastradosOuAtualizados;
}

// ── AUXILIAR: Normalizar Nome de Modelo para Ordenação e Agrupamento ──
function normalizarModelo(mod?: string | null): string {
  return (mod || '').trim().replace(/^iphone\s*/i, 'iPhone ');
}

// ── AUXILIAR: Extrair Emoji da Cor e Nome Limpo ──
function formatarCorEEmoji(corOriginal?: string | null): { emoji: string; nomeCor: string } {
  if (!corOriginal || corOriginal.trim() === '' || corOriginal === 'N/A') {
    return { emoji: '▫️', nomeCor: '' };
  }

  const texto = corOriginal.trim();
  const lower = texto.toLowerCase();

  let emoji = '';
  if (lower.includes('preto') || lower.includes('black') || lower.includes('grafite') || lower.includes('meia-noite') || lower.includes('space gray')) {
    emoji = '⚫';
  } else if (lower.includes('branco') || lower.includes('white') || lower.includes('prata') || lower.includes('silver') || lower.includes('estelar')) {
    emoji = '⚪';
  } else if (lower.includes('azul') || lower.includes('blue') || lower.includes('sierra') || lower.includes('ultramarine') || lower.includes('ultramarino')) {
    emoji = '🔵';
  } else if (lower.includes('roxo') || lower.includes('purple') || lower.includes('lilas') || lower.includes('lilás')) {
    emoji = '🟣';
  } else if (lower.includes('dourado') || lower.includes('gold') || lower.includes('amarelo') || lower.includes('yellow')) {
    emoji = '🟡';
  } else if (lower.includes('verde') || lower.includes('green') || lower.includes('teal')) {
    emoji = '🟢';
  } else if (lower.includes('vermelho') || lower.includes('red')) {
    emoji = '🔴';
  } else if (lower.includes('rosa') || lower.includes('pink') || lower.includes('rose')) {
    emoji = '🌸';
  } else if (lower.includes('desert') || lower.includes('deserto')) {
    emoji = '🏜️';
  } else if (lower.includes('natural') || lower.includes('titanium') || lower.includes('titânio') || lower.includes('cinza') || lower.includes('gray')) {
    emoji = '🔘';
  } else if (lower.includes('laranja') || lower.includes('orange') || lower.includes('coral')) {
    emoji = '🟠';
  }

  if (!emoji) {
    const emojiMatch = texto.match(/^(\p{Emoji_Presentation}|\p{Extended_Pictographic})/u);
    if (emojiMatch) {
      emoji = emojiMatch[0];
    } else {
      emoji = '▫️';
    }
  }

  const nomeCorLimpo = texto
    .replace(/[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]|\uFE0F/gu, '')
    .trim();

  return { emoji, nomeCor: nomeCorLimpo };
}

// ── CACHE DE BUFFER E ANTI-FLOOD PARA GRUPOS DE WHATSAPP ──
// Buffer da última mensagem por participante para lidar com mensagens divididas (ex: "15 Pro Max" + "Quem tem?")
const bufferUltimaMensagemParticipante = new Map<string, { texto: string; timestamp: number }>();

// Histórico de respostas enviadas no grupo para evitar flood e repetição desnecessária
const historicoRespostasGrupo = new Map<string, number>();

// Sincronização assíncrona com tabela whatsapp_antiflood_cache para escala horizontal
async function persistirAntiFloodTimestamp(chave: string, timestamp: number) {
  try {
    await supabase.from('whatsapp_antiflood_cache').upsert({
      chave,
      timestamp,
      created_at: new Date().toISOString(),
    });
  } catch {
    // Falha silenciosa para não onerar o fluxo
  }
}

// ── AUXILIAR: Obter tipo do plano da loja ──
async function obterPlanoLoja(lojaId: string): Promise<TipoPlano> {
  try {
    const { data: loja } = await supabase
      .from('lojas')
      .select('plano_tipo')
      .eq('id', lojaId)
      .maybeSingle();
    return (loja?.plano_tipo as TipoPlano) || 'entrada';
  } catch {
    return 'entrada';
  }
}

// ── AUXILIAR: Obter lojas para consulta de estoque (Grupos: todas as lojas ativas | Privado: loja da conversa) ──
async function obterLojasParaConsulta(
  lojaIdContexto: string | null,
  isGroup: boolean
): Promise<Array<{ id: string; nome: string }>> {
  // 1. Em grupos: busca TODAS as lojas ativas cadastradas no sistema Phone Center
  // Permitindo que o lojista veja opções de todas as lojas parceiras da rede
  if (isGroup) {
    const { data: todasLojas } = await supabase
      .from('lojas')
      .select('id, nome')
      .eq('ativo', true);

    if (todasLojas && todasLojas.length > 0) {
      return todasLojas.map((l: any) => ({ id: l.id, nome: l.nome || 'Loja' }));
    }
    return [];
  }

  // 2. No privado: consulta a loja específica vinculada à conversa/instância
  if (lojaIdContexto) {
    const { data: loja } = await supabase
      .from('lojas')
      .select('id, nome')
      .eq('id', lojaIdContexto)
      .eq('ativo', true)
      .maybeSingle();

    if (loja) {
      return [{ id: loja.id, nome: loja.nome || 'Loja' }];
    }
  }

  // Se não foi identificado pelo ID no privado, busca todas as lojas ativas como fallback
  const { data: todasLojas } = await supabase
    .from('lojas')
    .select('id, nome')
    .eq('ativo', true);

  return (todasLojas || []).map((l: any) => ({ id: l.id, nome: l.nome || 'Loja' }));
}

// ── AUXILIAR: Resposta Natural de Estoque / iPhone para Grupos e Privado ──
async function responderConsultaEstoqueNatural(
  texto: string,
  pushName: string,
  lojaId: string | null,
  instanceName: string,
  isGroup: boolean,
  senderPhone?: string,
  remoteJid?: string
): Promise<string | null> {
  const lojasParaConsulta = await obterLojasParaConsulta(lojaId, isGroup);
  if (lojasParaConsulta.length === 0) {
    return null;
  }

  const cleanSender = (senderPhone || '').replace(/\D/g, '');
  const cleanPushName = (pushName || '').toLowerCase();

  // Em grupos, ignora mensagens da própria equipe / bot
  if (isGroup) {
    if (
      cleanSender.endsWith('94986029') ||
      cleanSender.endsWith('994986029') ||
      cleanPushName.includes('lucas imports') ||
      cleanPushName === 'lucas'
    ) {
      return null;
    }
  }

  const textoLimpo = texto.toLowerCase().trim();

  // Em grupos, ignora textos excessivamente longos (listas longas de terceiros)
  if (isGroup && textoLimpo.length > 180) {
    return null;
  }

  const participantKey = `${remoteJid || 'direct'}:${cleanSender || 'unknown'}`;
  let textoParaAnalise = textoLimpo;

  const IPHONE_REGEX = /(?:iphone\s*|ip\s*)?(1[1-7]|xr|xs|se|16e)\s*(pro\s*max|promax|pmax|pmx|pm|pro|p|plus|\+|mini)?(?:\b|\s|[?!.,]|$)/i;

  const agora = Date.now();
  if (isGroup) {
    const prevMsg = bufferUltimaMensagemParticipante.get(participantKey);
    if (prevMsg && agora - prevMsg.timestamp < 20000) {
      if (!IPHONE_REGEX.test(textoLimpo)) {
        textoParaAnalise = `${prevMsg.texto} ${textoLimpo}`.trim();
      }
    }
    bufferUltimaMensagemParticipante.set(participantKey, { texto: textoLimpo, timestamp: agora });
  }

  // 1. FILTRO DE PRODUTOS EXCLUÍDOS (Não são smartphones/iPhones)
  const EXCLUDED_PRODUCTS = [
    /\bipad\b/i,
    /\bwatch\b/i,
    /\bapple\s*watch\b/i,
    /\bmacbook\b/i,
    /\bmac\b/i,
    /\bairpod[s]?\b/i,
    /\bpencil\b/i,
    /\bcaneta\b/i,
    /\btv\s*box\b/i,
    /\bjbl\b/i,
    /\bboombox\b/i,
    /\bcarregador\b/i,
    /\bfonte\b/i,
    /\baxor\b/i,
    /\bcaminh[aã]o\b/i,
    /\bmotoca\b/i,
    /\broupa\b/i
  ];
  if (EXCLUDED_PRODUCTS.some((p) => p.test(textoParaAnalise))) {
    return null;
  }

  if (/\b(4[0-9]mm|series\s*\d|s[789]\b|s1[0-9]\b|gps|cellular)\b/i.test(textoParaAnalise) && !/iphone\b/i.test(textoParaAnalise)) {
    return null;
  }

  // 2. FILTRO DE VENDEDORES ANUNCIANDO OU RESPOSTAS (Apenas em Grupos)
  if (isGroup) {
    const isPergunta = textoParaAnalise.includes('?') || /\b(quem\s+tem|algu[eé]m|tem\s+a[ií]|tem\s+aqui|preciso|procuro)\b/i.test(textoParaAnalise);

    const SELLER_OR_CHAT_PATTERNS = [
      /^\s*tenho\b/i,
      /\beu\s+tenho\b/i,
      /\btemos\b/i,
      /\bvem\s+nele\b/i,
      /\bvem\s+que\s+tem\b/i,
      /\bpasso\s+por\b/i,
      /\bfa[cç]o\s+a\b/i,
      /\bt[oô]\s+vendendo\b/i,
      /\bvendo\b/i,
      /\b0\s*ciclos\b/i,
      /\bnunca\s+viu\s+chave\b/i,
      /\btela\s+ori\b/i,
      /\btrocadinho\b/i,
      /\btomar\s+no\b/i,
      /\bcu\b/i,
      /\bfdp\b/i,
      /\bkkk/i,
      /\bhaha/i,
      /\bengra[cç]ado\b/i,
      /\bcasamento\b/i,
      /\bde\s+volta\s+no\b/i,
      /\bdando\s+\d+\s+pro\b/i,
      /\banos\b/i,
      /^\s*(\d{1,2}[.,]\d{3}|\d{3,4})\s*$/
    ];

    if (!isPergunta && /^\s*tem\b/i.test(textoParaAnalise) && !/\b(quem|algu[eé]m|a[ií]|aqui)\b/i.test(textoParaAnalise)) {
      return null;
    }

    if (SELLER_OR_CHAT_PATTERNS.some((p) => p.test(textoParaAnalise))) {
      return null;
    }
  }

  // 3. INTENÇÃO DE COMPRA / CONSULTA
  if (isGroup) {
    const BUYER_INTENT_PATTERNS = [
      /\bquem\s+tem\b/i,
      /\balgu[eé]m\b/i,
      /\balgm\b/i,
      /\bpreciso\s+de\b/i,
      /\bt[oô]\s+precisando\b/i,
      /\bprocuro\b/i,
      /\bprocurando\b/i,
      /\bcompro\b/i,
      /\bcomprando\b/i,
      /\bqual\s+tem\b/i,
      /\bonde\s+tem\b/i,
      /\btem\s+a[ií]\b/i,
      /\btem\s+aqui\b/i,
      /\btem\s+dispon[ií]vel\b/i,
      /\bquem\s+t[aá]\s+tendo\b/i,
      /\bpra\s+hoje\b/i,
      /\bpra\s+agora\b/i,
      /\bpego\s+hoje\b/i,
      /\bpre[cç]o\s+campe[aã]o\b/i,
      /\bpre[cç]o\s+de\s+noia\b/i,
      /\bmelhor\s+pre[cç]o\b/i,
      /\bmenor\s+valor\b/i,
      /\bquem\s+tiver\b/i,
      /\bmanda\s+pv\b/i,
      /\bdispon[ií]vel\b.*\?/i,
      /\b(64|128|256|512|1tb)\s*(?:gb|gigas|g)?\s*\?+/i,
      /\b(pro|promax|pm|pmx|plus|mini)\b.*\?+/i
    ];

    const temIntencaoCompra = BUYER_INTENT_PATTERNS.some((p) => p.test(textoParaAnalise)) || textoParaAnalise.includes('?');
    if (!temIntencaoCompra) {
      return null;
    }
  }

  const isPerguntaQuantidade = /\b(quantos|quantas|qtos|qtas|qtd|quantidade)\b/i.test(textoParaAnalise);
  const isPerguntaGeralEstoque =
    /\b(estoque|dispon[ií]veis|disponivel|aparelhos|iphones|celulares|celular|cardapio|tabela)\b/i.test(textoParaAnalise) &&
    (/\b(o que|quais|qual|quantos|qtos|como|tem|temos)\b/i.test(textoParaAnalise) || textoParaAnalise.includes('?'));

  const modeloMatch = textoParaAnalise.match(IPHONE_REGEX);

  // 4. CONSULTA GERAL DE ESTOQUE (Sem modelo específico: "quantos tem?", "qual o estoque?", "o que tem disponível?")
  if (!modeloMatch && (isPerguntaGeralEstoque || isPerguntaQuantidade) && !isGroup) {
    const lojaIds = lojasParaConsulta.map((l) => l.id);
    const { data: todosAparelhos } = await supabase
      .from('aparelhos')
      .select('id, loja_id, marca, modelo, capacidade, cor, preco, preco_atacado, precoAtacado, saude_bateria, status, condicao')
      .in('loja_id', lojaIds)
      .eq('ativo', true)
      .neq('condicao', 'vendido')
      .neq('status', 'vendido');

    if (!todosAparelhos || todosAparelhos.length === 0) {
      return `No momento nosso estoque está zerado, mas estamos com reposição a caminho! 📦✨`;
    }

    const contagemMap = new Map<string, { count: number; menorPreco: number }>();
    todosAparelhos.forEach((ap) => {
      const modNorm = normalizarModelo(ap.modelo);
      const cap = ap.capacidade && ap.capacidade !== 'N/A' ? ap.capacidade : '';
      const chave = [modNorm, cap].filter(Boolean).join(' ');
      const precoNum = Number(ap.preco || ap.preco_atacado || (ap as any).precoAtacado || 0);
      const atual = contagemMap.get(chave) || { count: 0, menorPreco: precoNum };
      atual.count += 1;
      if (precoNum > 0 && (atual.menorPreco === 0 || precoNum < atual.menorPreco)) {
        atual.menorPreco = precoNum;
      }
      contagemMap.set(chave, atual);
    });

    const linhasResumo: string[] = [];
    contagemMap.forEach((val, mod) => {
      const precoStr = val.menorPreco > 0 ? ` - a partir de R$ ${val.menorPreco.toFixed(2).replace('.', ',')}` : '';
      linhasResumo.push(`• *${val.count}x* ${mod}${precoStr}`);
    });

    return `📱 *Estoque Disponível (${todosAparelhos.length} aparelhos no total):*\n\n${linhasResumo.join('\n')}\n\nQual desses modelos você gostaria de ver com mais detalhes? 😊`;
  }

  if (!modeloMatch) {
    return null;
  }

  // 5. EXTRAÇÃO ESPECÍFICA DO MODELO DE IPHONE
  const termoNumero = modeloMatch[1].toUpperCase();
  const sufRaw = (modeloMatch[2] || '').toLowerCase().replace(/\s+/g, '');

  let variante: 'PRO_MAX' | 'PRO' | 'PLUS' | 'MINI' | 'BASE_ONLY' | 'QUALQUER' = 'QUALQUER';
  let modeloAlvoFormatado = '';

  if (['pm', 'promax', 'pmax', 'pmx'].includes(sufRaw)) {
    variante = 'PRO_MAX';
    modeloAlvoFormatado = `iPhone ${termoNumero} Pro Max`;
  } else if (['p', 'pro'].includes(sufRaw)) {
    variante = 'PRO';
    modeloAlvoFormatado = `iPhone ${termoNumero} Pro`;
  } else if (['plus', '+', 'pl'].includes(sufRaw)) {
    variante = 'PLUS';
    modeloAlvoFormatado = `iPhone ${termoNumero} Plus`;
  } else if (sufRaw === 'mini') {
    variante = 'MINI';
    modeloAlvoFormatado = `iPhone ${termoNumero} Mini`;
  } else if (!sufRaw) {
    variante = 'BASE_ONLY';
    modeloAlvoFormatado = termoNumero === '16E' ? 'iPhone 16e' : `iPhone ${termoNumero}`;
  }

  // Anti-Flood em Grupos
  if (isGroup && remoteJid) {
    const floodKeyModelo = `${remoteJid}:${modeloAlvoFormatado}`;
    const ultimoEnvioModelo = historicoRespostasGrupo.get(floodKeyModelo);
    if (ultimoEnvioModelo && agora - ultimoEnvioModelo < 30000) {
      return null;
    }

    const floodKeyParticipante = `${remoteJid}:${cleanSender}`;
    const ultimoEnvioParticipante = historicoRespostasGrupo.get(floodKeyParticipante);
    if (ultimoEnvioParticipante && agora - ultimoEnvioParticipante < 20000) {
      return null;
    }
  }

  // 6. CONSULTA AO BANCO DE DADOS
  const lojaIds = lojasParaConsulta.map((l) => l.id);
  const mapLojas = new Map(lojasParaConsulta.map((l) => [l.id, l.nome]));

  const { data: aparelhos } = await supabase
    .from('aparelhos')
    .select('id, loja_id, marca, modelo, capacidade, cor, preco, preco_atacado, precoAtacado, saude_bateria, imei, codigo, status, condicao')
    .in('loja_id', lojaIds)
    .eq('ativo', true)
    .neq('condicao', 'vendido')
    .neq('status', 'vendido');

  if (!aparelhos || aparelhos.length === 0) {
    if (isGroup) return null;
    return `No momento nosso estoque está zerado, mas estamos recebendo novidades em breve!`;
  }

  const numLower = termoNumero.toLowerCase();
  const aparelhosDaGeracao = aparelhos.filter((a) => {
    const mod = String(a.modelo || '').toLowerCase();
    return new RegExp(`\\b${numLower}\\b`).test(mod) || mod.includes(`iphone ${numLower}`) || mod.includes(`ip ${numLower}`) || mod.startsWith(numLower);
  });

  let aparelhosEncontrados: any[] = [];
  if (variante === 'PRO_MAX') {
    aparelhosEncontrados = aparelhosDaGeracao.filter((a) => {
      const mod = String(a.modelo || '').toLowerCase();
      return mod.includes('pro max') || mod.includes('promax') || mod.includes('pmax');
    });
  } else if (variante === 'PRO') {
    aparelhosEncontrados = aparelhosDaGeracao.filter((a) => {
      const mod = String(a.modelo || '').toLowerCase();
      return (mod.includes('pro') || mod.includes(' pro ')) && !mod.includes('max') && !mod.includes('promax');
    });
  } else if (variante === 'PLUS') {
    aparelhosEncontrados = aparelhosDaGeracao.filter((a) => {
      const mod = String(a.modelo || '').toLowerCase();
      return mod.includes('plus') || mod.includes('+');
    });
  } else if (variante === 'MINI') {
    aparelhosEncontrados = aparelhosDaGeracao.filter((a) => {
      const mod = String(a.modelo || '').toLowerCase();
      return mod.includes('mini');
    });
  } else if (variante === 'BASE_ONLY') {
    const baseModels = aparelhosDaGeracao.filter((a) => {
      const mod = String(a.modelo || '').toLowerCase();
      return !mod.includes('pro') && !mod.includes('max') && !mod.includes('plus') && !mod.includes('mini');
    });
    aparelhosEncontrados = baseModels;
  } else {
    aparelhosEncontrados = aparelhosDaGeracao;
  }

  // 7. FILTRO DE CAPACIDADE (Se o comprador especificou ex: "256gb" ou "128")
  const capMatch = textoParaAnalise.match(/\b(64|128|256|512|1024|1\s*tb|1\s*tera)\s*(?:gb|gigas|g)?\b/i);
  if (capMatch) {
    const capAlvo = capMatch[1].toLowerCase().replace(/\s+/g, '');
    const filtradosPorCap = aparelhosEncontrados.filter((a) => {
      const cap = String(a.capacidade || '').toLowerCase();
      return cap.includes(capAlvo);
    });

    if (filtradosPorCap.length > 0) {
      aparelhosEncontrados = filtradosPorCap;
    } else if (isGroup) {
      return null;
    }
  }

  // 7.1. FILTRO DE COR (Se o comprador especificou uma cor na mensagem: ex: preto, branco, azul, etc.)
  const CORES_KEYWORDS: Record<string, string[]> = {
    preto: ['preto', 'black', 'grafite', 'meia-noite', 'space gray', 'space grey', 'cinza espacial'],
    branco: ['branco', 'white', 'prata', 'silver', 'estelar', 'starlight'],
    azul: ['azul', 'blue', 'sierra', 'ultramarine', 'ultramarino', 'pacífico', 'pacific'],
    roxo: ['roxo', 'purple', 'lilas', 'lilás', 'deep purple'],
    dourado: ['dourado', 'gold', 'ouro'],
    amarelo: ['amarelo', 'yellow'],
    verde: ['verde', 'green', 'teal', 'alpino', 'alpine'],
    vermelho: ['vermelho', 'red', 'product red'],
    rosa: ['rosa', 'pink', 'rose'],
    titanio_natural: ['natural', 'desert', 'deserto', 'titanium', 'titânio', 'cinza', 'gray', 'grey'],
    laranja: ['laranja', 'orange', 'coral']
  };

  let corSolicitada: string[] | null = null;
  for (const [, termos] of Object.entries(CORES_KEYWORDS)) {
    if (termos.some((termo) => new RegExp(`\\b${termo}\\b`, 'i').test(textoParaAnalise))) {
      corSolicitada = termos;
      break;
    }
  }

  if (corSolicitada) {
    const filtradosPorCor = aparelhosEncontrados.filter((a) => {
      const corAp = String(a.cor || '').toLowerCase();
      return corSolicitada!.some((termo) => corAp.includes(termo));
    });

    if (filtradosPorCor.length > 0) {
      aparelhosEncontrados = filtradosPorCor;
    } else if (isGroup) {
      return null;
    }
  }

  // 8. RESULTADO
  if (aparelhosEncontrados.length === 0) {
    if (isGroup) return null;
    return `No momento o *${modeloAlvoFormatado}* esgotou por aqui, mas estamos com novas unidades chegando! Quer ver algum outro modelo? 😊`;
  }

  if (isGroup && remoteJid) {
    historicoRespostasGrupo.set(`${remoteJid}:${modeloAlvoFormatado}`, agora);
    historicoRespostasGrupo.set(`${remoteJid}:${cleanSender}`, agora);
    persistirAntiFloodTimestamp(`${remoteJid}:${modeloAlvoFormatado}`, agora);
    persistirAntiFloodTimestamp(`${remoteJid}:${cleanSender}`, agora);
  }

  aparelhosEncontrados.sort((a, b) => normalizarModelo(a.modelo).localeCompare(normalizarModelo(b.modelo)));

  // Em grupos: Agrupar claramente por loja com visual limpo
  if (isGroup) {
    const aparelhosPorLoja = new Map<string, any[]>();
    aparelhosEncontrados.forEach((ap) => {
      const nomeLoja = (mapLojas.get(ap.loja_id) || 'Phone Center').toUpperCase().trim();
      const lista = aparelhosPorLoja.get(nomeLoja) || [];
      lista.push(ap);
      aparelhosPorLoja.set(nomeLoja, lista);
    });

    const blocosLojas: string[] = [];
    aparelhosPorLoja.forEach((itensLoja, nomeLoja) => {
      const linhasLoja: string[] = [];
      linhasLoja.push(`*${nomeLoja}*`);

      // Limitar a até 6 aparelhos por loja para manter a lista objetiva e sem poluição
      const itensExibicao = itensLoja.slice(0, 6);
      itensExibicao.forEach((a) => {
        const modNorm = normalizarModelo(a.modelo);
        const { emoji, nomeCor } = formatarCorEEmoji(a.cor);
        const cap = a.capacidade && a.capacidade !== 'N/A' ? `${a.capacidade}` : '';
        const batVal = a.saude_bateria || (a as any).saudeBateria;
        const batNum = batVal ? String(batVal).replace(/\D/g, '') : '';
        const bat = batNum ? `(${batNum}%)` : '';
        const modCap = [modNorm, cap].filter(Boolean).join(' ');
        const extras = [nomeCor, bat].filter(Boolean).join(' ');
        const precoValor = a.preco_atacado || (a as any).precoAtacado || a.preco;
        const precoFinal = precoValor ? `- R$ ${Number(precoValor).toFixed(2).replace('.', ',')}` : '';

        linhasLoja.push(`${emoji} ${modCap}${extras ? ` - ${extras}` : ''} ${precoFinal}`.replace(/\s+/g, ' ').trim());
      });

      if (itensLoja.length > 6) {
        linhasLoja.push(`_... e mais ${itensLoja.length - 6} opções_`);
      }

      blocosLojas.push(linhasLoja.join('\n'));
    });

    const prefixo = isPerguntaQuantidade
      ? `📦 Temos *${aparelhosEncontrados.length} unidade(s)* de *${modeloAlvoFormatado}* disponível(is):\n\n`
      : `Tem aqui esses modelos:\n\n`;

    return `${prefixo}${blocosLojas.join('\n\n')}`;
  }

  // No privado (atendimento direto ao cliente/lojista):
  const aparelhosExibicao = aparelhosEncontrados;
  let ultimoModelo = '';
  const linhasEncontrados: string[] = [];

  aparelhosExibicao.forEach((a) => {
    const modNorm = normalizarModelo(a.modelo);
    if (ultimoModelo && ultimoModelo !== modNorm) {
      linhasEncontrados.push('');
    }
    ultimoModelo = modNorm;

    const { emoji, nomeCor } = formatarCorEEmoji(a.cor);
    const cap = a.capacidade && a.capacidade !== 'N/A' ? `${a.capacidade}` : '';
    const batVal = a.saude_bateria || (a as any).saudeBateria;
    const batNum = batVal ? String(batVal).replace(/\D/g, '') : '';
    const bat = batNum ? `(${batNum}%)` : '';
    const modCap = [modNorm, cap].filter(Boolean).join(' ');
    const extras = [nomeCor, bat].filter(Boolean).join(' ');
    const precoValor = a.preco_atacado || (a as any).precoAtacado || a.preco;
    const precoFinal = precoValor ? `- R$ ${Number(precoValor).toFixed(2).replace('.', ',')}` : '';
    linhasEncontrados.push(`${emoji} ${modCap}${extras ? ` - ${extras}` : ''} ${precoFinal}`.replace(/\s+/g, ' ').trim());
  });

  const prefixo = isPerguntaQuantidade
    ? `📦 Temos *${aparelhosEncontrados.length} unidade(s)* de *${modeloAlvoFormatado}* disponível(is):\n\n`
    : `Temos disponível no estoque:\n\n`;

  return `${prefixo}${linhasEncontrados.join('\n')}`;
}

// ── POST: Processamento Principal do Webhook ──
export async function POST(request: Request) {
  try {
    const rawBody = await request.text();
    if (!rawBody || rawBody.trim() === '') {
      return NextResponse.json({ message: 'Payload vazio recebido.' }, { status: 200 });
    }

    let payload: any;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      return NextResponse.json({ error: 'JSON inválido no corpo da requisição.' }, { status: 400 });
    }

    console.log('📡 [Evolution Webhook Event]:', payload.event || payload.type || 'Evento sem nome');

    // 1. Extração da instância
    const instanceName =
      payload.instance ||
      payload.instanceName ||
      payload.data?.instance ||
      DEFAULT_INSTANCE;

    let lojaId = await resolverLojaId(instanceName);

    // 2. Trata eventos de Conexão / Status / QR Code
    const eventName = String(payload.event || payload.type || '').toLowerCase();

    if (eventName.includes('qrcode') || eventName.includes('connection')) {
      const qrCodeBase64 = payload.data?.qrcode?.base64 || payload.data?.qrcode || payload.qrcode;
      const connectionState = payload.data?.state || payload.data?.status || payload.state || payload.status;

      if (lojaId && (qrCodeBase64 || connectionState)) {
        let statusBanco = 'disconnected';
        if (['open', 'connected', 'isLogged', 'inChat'].includes(connectionState)) {
          statusBanco = 'connected';
        } else if (qrCodeBase64 || connectionState === 'connecting') {
          statusBanco = 'qr_code';
        }

        await supabase.from('whatsapp_sessions').upsert(
          {
            loja_id: lojaId,
            status: statusBanco,
            qr_code: statusBanco === 'connected' ? null : qrCodeBase64 || null,
            session_name: instanceName,
          },
          { onConflict: 'loja_id' }
        );
      }

      return NextResponse.json({ status: 'ok', message: 'Status de conexão atualizado.' }, { status: 200 });
    }

    // 3. Trata recebimento de mensagens (messages.upsert / MESSAGES_UPSERT)
    const isMessageEvent =
      eventName.includes('message') ||
      eventName.includes('upsert') ||
      payload.data?.key?.remoteJid ||
      payload.key?.remoteJid;

    if (!isMessageEvent) {
      return NextResponse.json({ status: 'ok', message: 'Evento ignorado.' }, { status: 200 });
    }

    // Extrai dados da mensagem
    const msgData = payload.data?.message ? payload.data : payload;
    const key = msgData.key || {};
    const remoteJid = String(key.remoteJid || '');

    // Ignora chamadas de status broadcast ou mensagens enviadas pelo próprio bot (fromMe)
    if (key.fromMe || remoteJid.includes('status@broadcast')) {
      return NextResponse.json({ status: 'ok', message: 'Mensagem própria ou broadcast ignorada.' }, { status: 200 });
    }

    const isGroup = remoteJid.endsWith('@g.us');
    const participantJid = String(key.participant || msgData.participant || key.remoteJid || '');
    const participantPhone = participantJid.replace(/@.*$/, '').replace(/\D/g, '');
    const senderPhone = remoteJid.replace(/@.*$/, '').replace(/\D/g, '');
    const authorPhone = isGroup ? (participantPhone || senderPhone) : senderPhone;
    const pushName = msgData.pushName || msgData.verifiedBizName || (isGroup ? 'Participante' : senderPhone);
    const targetDestination = isGroup ? remoteJid : senderPhone;

    // ── IDENTIFICAÇÃO MULTI-LOJA DO USUÁRIO PELO NÚMERO DO WHATSAPP ──
    const usuarioResolvido = await resolverLojaEUsuarioPorTelefone(authorPhone, instanceName);
    if (usuarioResolvido?.lojaId) {
      lojaId = usuarioResolvido.lojaId;
    }
    const nomeLoja = usuarioResolvido?.lojaNome || 'Phone Center';
    const nomeUsuario = usuarioResolvido?.usuarioNome || pushName;
    const papelUsuario = usuarioResolvido?.papel || 'staff';

    // ── BLOQUEIO DE SEGURANÇA: NÚMERO NÃO CADASTRADO EM NENHUMA LOJA (CHAT PRIVADO) ──
    if (!isGroup && !usuarioResolvido) {
      console.warn(`🔒 [Segurança] Acesso negado para telefone não cadastrado: ${authorPhone}`);
      const msgBloqueio = `🔒 *Acesso Não Vinculado — Phone Center*\n\nOlá! O seu número de WhatsApp (*${authorPhone}*) ainda não possui acesso vinculado a nenhuma loja no sistema.\n\n👉 *Se você já faz parte de uma equipe:* Peça ao administrador/dono da sua loja que cadastre seu número em *Configurações > Equipe* (ou *Técnicos & Vendedores*).\n\n👉 *Se você deseja criar sua própria loja:* Conheça nossos planos e inicie seu teste grátis em:\n🌐 *https://app.phonecenter.tech/assinar*`;
      await enviarMensagemWhatsApp(instanceName, targetDestination, msgBloqueio);
      return NextResponse.json({ status: 'unauthorized', message: 'Telefone não vinculado a nenhuma loja.' }, { status: 200 });
    }

    const messageContent = msgData.message || {};

    // ── 3.1. RECONHECIMENTO DE IMAGEM / ETIQUETA COM IA VISION OCR ──
    const hasImage = Boolean(
      messageContent.imageMessage ||
      msgData.imageMessage ||
      msgData.messageType === 'imageMessage' ||
      payload.data?.messageType === 'imageMessage'
    );

    if (hasImage) {
      console.log(`📸 Imagem recebida de ${pushName} (${targetDestination}). Iniciando OCR Vision...`);

      let rawBase64 =
        msgData.base64 ||
        msgData.message?.base64 ||
        payload.data?.base64 ||
        payload.data?.message?.base64 ||
        messageContent.imageMessage?.base64 ||
        '';

      let mimeType = messageContent.imageMessage?.mimetype || 'image/jpeg';

      // Se não veio base64 direto no payload, busca na Evolution API
      if (!rawBase64 && key.id) {
        console.log(`📥 Buscando mídia base64 na Evolution API para a mensagem ${key.id}...`);
        const mediaResult = await buscarMidiaBase64Evolution(instanceName, key.id, msgData);
        if (mediaResult) {
          rawBase64 = mediaResult.base64;
          mimeType = mediaResult.mimetype || mimeType;
        }
      }

      if (rawBase64) {
        if (lojaId) {
          const perm = await verificarPermissaoWhatsApp(lojaId, authorPhone, ['owner', 'staff']);
          if (!perm.autorizado) {
            await enviarMensagemWhatsApp(instanceName, targetDestination, '⚠️ *Acesso Restrito:* Este comando é restrito à equipe autorizada da loja.');
            return NextResponse.json({ status: 'error', message: 'Acesso negado' }, { status: 200 });
          }
        }

        // Envia mensagem imediata informando processamento
        await enviarMensagemWhatsApp(instanceName, targetDestination, '🔍 *Analisando foto com IA Vision...* Só um instante! ⏳');

        try {
          const visionData = await processImageVision(rawBase64, mimeType);

          if (visionData) {
            console.log('🤖 Resultado do OCR Vision:', JSON.stringify(visionData));
            const respostaEtiqueta = await processarResultadoVisionEtiqueta(visionData, lojaId, pushName);
            await enviarMensagemWhatsApp(instanceName, targetDestination, respostaEtiqueta);

            if (lojaId) {
              await supabase.from('whatsapp_logs').insert({
                loja_id: lojaId,
                contato: `${pushName} (${isGroup ? 'Grupo' : senderPhone})`,
                mensagem: `[FOTO/OCR] Lidos: ${visionData.modelo || visionData.tipo_documento} (IMEI: ${visionData.imei || '-'})`,
                created_at: new Date().toISOString(),
              });
            }

            return NextResponse.json({ status: 'ok', message: 'Foto processada com sucesso via IA Vision.' }, { status: 200 });
          } else {
            await enviarMensagemWhatsApp(
              instanceName,
              targetDestination,
              '⚠️ Não consegui extrair as informações da foto. Certifique-se de que a etiqueta está focada e com boa iluminação!'
            );
            return NextResponse.json({ status: 'ok', message: 'Falha na leitura da imagem.' }, { status: 200 });
          }
        } catch (visionErr: any) {
          console.error('❌ Erro no processamento de visão OCR:', visionErr);
          await enviarMensagemWhatsApp(
            instanceName,
            targetDestination,
            '⚠️ Ocorreu uma instabilidade momentânea ao ler a foto. Por favor, tente enviar novamente!'
          );
          return NextResponse.json({ error: visionErr.message }, { status: 500 });
        }
      }
    }

    // ── 3.2. EXTRAÇÃO E TRATAMENTO DE TEXTO ──
    const textContent =
      messageContent.conversation ||
      messageContent.extendedTextMessage?.text ||
      messageContent.imageMessage?.caption ||
      messageContent.buttonsResponseMessage?.selectedButtonId ||
      messageContent.listResponseMessage?.singleSelectReply?.selectedRowId ||
      '';

    if (!textContent || textContent.trim() === '') {
      return NextResponse.json({ status: 'ok', message: 'Mensagem sem conteúdo textual.' }, { status: 200 });
    }

    console.log(`📩 Mensagem recebida de ${pushName} (${isGroup ? 'Grupo ' + remoteJid : senderPhone}): "${textContent.slice(0, 60)}..."`);

    // 4. Salva log no Supabase (`whatsapp_logs`)
    if (lojaId) {
      await supabase.from('whatsapp_logs').insert({
        loja_id: lojaId,
        contato: `${pushName} (${isGroup ? 'Grupo' : senderPhone})`,
        mensagem: textContent,
        created_at: new Date().toISOString(),
      });
    }

    const lowerText = textContent.toLowerCase().trim();

    // ── 4.1. CONSULTA DE PLANOS DA PLATAFORMA PHONE CENTER ──
    const ehPerguntaPlanos =
      /quais planos temos|quais s[aã]o os planos|tabela de planos|planos do sistema|valores dos planos|como funcionam os planos|planos phone center/i.test(lowerText);

    if (ehPerguntaPlanos) {
      const planoAtualFormatado = (usuarioResolvido?.planoTipo || 'entrada').toUpperCase();
      const statusFormatado = usuarioResolvido?.planoStatus === 'ativo' ? 'Ativo' : (usuarioResolvido?.planoStatus || 'Ativo');

      const msgPlanos = `📋 *Planos Phone Center — Gestão Inteligente para Lojistas*

Olá, *${nomeUsuario}*! Sua loja (*${nomeLoja}*) atualmente está no:
⭐ *Plano ${planoAtualFormatado}* (${statusFormatado})

Conheça os 3 planos disponíveis na nossa plataforma:

1️⃣ *Plano Entrada* — R$ 99,90/mês (ou R$ 79,90 no anual):
• Painel completo de estoque, vendas e produtos
• Ordens de Serviço (OS) com garantia documentada
• Leitor de código de barras e OCR de etiquetas com IA
• Bot assistente no WhatsApp (!estoque, !vender, !cadastrar, !os)

2️⃣ *Plano Intermediário* — R$ 189,00/mês (ou R$ 149,00 no anual) *(Mais Escolhido)*:
• *Tudo do Entrada* +
• Gestão milimétrica de fiado e devedores (!abater, !saldo)
• Bot de cobrança automática com horários programados
• Checagem de IMEI roubado / bloqueado (!checarimei)
• Transmissão de listas de estoque para grupos (!broadcast)

3️⃣ *Plano Avançado* — R$ 299,00/mês (ou R$ 239,00 no anual) *(Máxima Potência)*:
• *Tudo do Intermediário* +
• Escuta e busca em catálogo unificado multi-loja em grupos
• Trilha de auditoria completa com registro de operadores
• API REST com Token próprio para sistemas e robôs externos

💡 *Deseja testar ou alterar seu plano?*
Você pode solicitar um teste de 3 dias grátis de qualquer plano superior no menu *Meu Plano* do painel web!`;

      await enviarMensagemWhatsApp(instanceName, targetDestination, msgPlanos);
      return NextResponse.json({ status: 'ok', message: 'Tabela de planos enviada.' }, { status: 200 });
    }

    const ehPerguntaVencimento =
      /(?:quando (?:meu|o)? ?plano (?:vai )?venc|quando vence|vencimento (?:do )?plano|plano (?:vai )?venc|meu plano t[aá] ativo|quantos dias de plano|dias restantes do plano|validade do plano)/i.test(lowerText);

    if (ehPerguntaVencimento) {
      const isVitalicio = usuarioResolvido?.planoStatus === 'vitalicio';
      const planoAtualFormatado = (usuarioResolvido?.planoTipo || 'entrada').toUpperCase();
      const statusFormatado = isVitalicio ? 'Ativo (Acesso Vitalício ♾️)' : (usuarioResolvido?.planoStatus === 'ativo' ? 'Ativo' : (usuarioResolvido?.planoStatus || 'Ativo'));
      const dataVenc = isVitalicio ? 'Permanente (Sem cobrança periódica)' : (usuarioResolvido?.dataVencimento ? formatarDataSegura(usuarioResolvido.dataVencimento) : 'Não definida');
      const dias = usuarioResolvido?.diasRestantes !== undefined ? usuarioResolvido.diasRestantes : 0;
      const diasTexto = isVitalicio ? '♾️ Acesso Vitalício Garantido' : (dias <= 0 ? '⚠️ Vencido hoje ou atrasado' : `${dias} dia(s) restante(s)`);

      const msgVencimento = `🗓️ *Status da Assinatura — ${nomeLoja}*

Olá, *${nomeUsuario}*! Seguem os detalhes da sua assinatura no Phone Center:
• Loja: *${nomeLoja}*
• Plano Atual: *Plano ${planoAtualFormatado}*
• Status: *${statusFormatado}*
• Data de Vencimento: *${dataVenc}*
• Prazo: *${diasTexto}*

${isVitalicio ? '🎉 Sua loja possui acesso vitalício permanente liberado pelo Super Admin!' : (papelUsuario === 'owner' ? '💡 *Para renovar ou pagar via PIX:* envie *!plano pagar* ou acesse o menu *Meu Plano* no site para pagar no Cartão de Crédito em até 12x.' : '💡 Entre em contato com o proprietário da sua loja para renovações ou upgrades de plano.')}`;

      await enviarMensagemWhatsApp(instanceName, targetDestination, msgVencimento);
      return NextResponse.json({ status: 'ok', message: 'Informações de vencimento enviadas.' }, { status: 200 });
    }

    // ── 5. COMANDO: !vender [identificador] [valor] [comprador?] ──
    if (lowerText.startsWith('!vender')) {
      if (!lojaId) {
        await enviarMensagemWhatsApp(instanceName, targetDestination, "❌ Não consegui identificar sua loja para executar este comando, contate o suporte");
        return NextResponse.json({ status: 'error', message: 'Loja não identificada' }, { status: 200 });
      }

      const perm = await verificarPermissaoWhatsApp(lojaId, authorPhone, ['owner', 'staff']);
      if (!perm.autorizado) {
        await enviarMensagemWhatsApp(instanceName, targetDestination, '⚠️ *Acesso Restrito:* Este comando é restrito à equipe autorizada da loja.');
        return NextResponse.json({ status: 'error', message: 'Acesso negado' }, { status: 200 });
      }

      const partes = textContent.trim().split(/\s+/);
      if (partes.length < 3) {
        const msgErro = `⚠️ *Formato de venda incompleto!*\nUse: *!vender [IMEI ou ID] [Valor] [Nome do Cliente (opcional)]*\nExemplo: *!vender 356829104829102 2800 Lucas*`;
        await enviarMensagemWhatsApp(instanceName, targetDestination, msgErro);
        return NextResponse.json({ status: 'ok' }, { status: 200 });
      }

      const termoBusca = partes[1].trim();
      const valorNum = parseFloat(partes[2].replace(/[^\d.,]/g, '').replace(',', '.'));
      const compradorNome = partes.slice(3).join(' ').trim() || pushName || 'Cliente WhatsApp';

      if (isNaN(valorNum) || valorNum <= 0) {
        await enviarMensagemWhatsApp(instanceName, targetDestination, `⚠️ Valor numérico inválido: "${partes[2]}". Digite um valor válido.`);
        return NextResponse.json({ status: 'ok' }, { status: 200 });
      }

      const qApar = supabase.from('aparelhos').select('*').eq('loja_id', lojaId);

      const { data: aparelhos } = await qApar
        .or(`imei.eq.${termoBusca},imei.ilike.%${termoBusca}%,codigo.eq.${termoBusca},id.eq.${termoBusca}`)
        .limit(1);

      const aparelho = aparelhos?.[0];

      if (!aparelho) {
        await enviarMensagemWhatsApp(instanceName, targetDestination, `❌ Não encontrei nenhum aparelho com o código ou IMEI "${termoBusca}". Verifique se o identificador está correto!`);
        return NextResponse.json({ status: 'ok' }, { status: 200 });
      }

      if (aparelho.status === 'vendido' || aparelho.condicao === 'vendido' || aparelho.ativo === false) {
        await enviarMensagemWhatsApp(instanceName, targetDestination, `⚠️ O aparelho *${aparelho.modelo}* (IMEI: ${aparelho.imei}) já consta como vendido no sistema!`);
        return NextResponse.json({ status: 'ok' }, { status: 200 });
      }

      // Checagem de limite de aprovação manual da loja
      const { data: lojaRow } = await supabase
        .from('lojas')
        .select('configuracoes')
        .eq('id', lojaId)
        .maybeSingle();

      const limiteAprovacao = Number((lojaRow?.configuracoes as any)?.limite_aprovacao_manual || 0);

      if (limiteAprovacao > 0 && valorNum > limiteAprovacao) {
        try {
          await supabase.from('acoes_pendentes_aprovacao').insert({
            loja_id: lojaId,
            tipo: 'venda',
            payload: {
              aparelho_id: aparelho.id,
              termoBusca,
              modelo: aparelho.modelo,
              marca: aparelho.marca,
              capacidade: aparelho.capacidade,
              imei: aparelho.imei,
              valor: valorNum,
              compradorNome,
              pushName,
              authorPhone,
              targetDestination,
              instanceName,
            },
            status: 'pendente',
            criado_por_telefone: authorPhone,
            criado_em: new Date().toISOString(),
          });
        } catch (penErr) {
          console.error('Erro ao inserir acoes_pendentes_aprovacao:', penErr);
        }

        try {
          await supabase.from('logs_sistema').insert({
            loja_id: lojaId,
            tipo_evento: 'aprovacao_pendente',
            acao: `Venda retida para aprovação: ${aparelho.modelo}`,
            detalhes: `Venda no valor de R$ ${valorNum.toFixed(2)} acima do limite de confirmação automática (R$ ${limiteAprovacao.toFixed(2)}).`,
            ator_telefone: authorPhone,
            ator_papel: perm.papel,
            valor_anterior: { status: aparelho.status, condicao: aparelho.condicao },
            valor_novo: { status: 'pendente_aprovacao', valor: valorNum, limite: limiteAprovacao },
            created_at: new Date().toISOString(),
          });
        } catch (logErr) {
          console.warn('Falha silenciosa ao registrar log_sistema:', logErr);
        }

        const msgRetida = `⚠️ *VENDA RETIDA PARA APROVAÇÃO MANUAL*

📱 *Aparelho:* ${aparelho.marca} ${aparelho.modelo} (${aparelho.capacidade || 'N/A'})
🔢 *IMEI:* \`${aparelho.imei || termoBusca}\`
💰 *Valor:* R$ ${valorNum.toFixed(2).replace('.', ',')}
👤 *Comprador:* ${compradorNome}

🔒 Este valor ultrapassa o limite de confirmação automática configurado na loja (R$ ${limiteAprovacao.toFixed(2).replace('.', ',')}).
A venda foi enviada para validação de um administrador no painel!`;

        await enviarMensagemWhatsApp(instanceName, targetDestination, msgRetida);
        return NextResponse.json({ status: 'ok', message: 'Venda pendente de aprovação manual.' }, { status: 200 });
      }

      // 1. Atualiza o aparelho para vendido
      await supabase.from('aparelhos').update({
        condicao: 'vendido',
        status: 'vendido',
        ativo: false,
        comprador: compradorNome,
        precoVenda: valorNum,
        dataVenda: new Date().toISOString(),
      }).eq('id', aparelho.id);

      // 2. Insere na tabela 'vendas'
      const custoNum = Number(aparelho.custo || aparelho.precoCusto || 0);
      const lucroNum = valorNum - custoNum;
      const margemPercent = custoNum > 0 ? ((lucroNum / custoNum) * 100).toFixed(1) : '100';

      await supabase.from('vendas').insert({
        loja_id: lojaId,
        lojaId: lojaId,
        clienteNome: compradorNome,
        vendedor: `WhatsApp (${pushName})`,
        tipoEntrega: 'Varejo',
        valor: valorNum,
        custo: custoNum,
        lucro: lucroNum,
        percentualLucro: parseFloat(margemPercent) || 0,
        dataPagamento: new Date().toISOString(),
        status: 'pago',
        metodo: 'pix',
        valorPago: valorNum,
        saldoDevedor: 0,
        descricao: `Venda via WhatsApp: ${aparelho.marca} ${aparelho.modelo}`,
        garantia: '3 Meses (Garantia Legal)',
        descontoTotal: 0,
        itens: [
          {
            id: Date.now().toString(),
            aparelhoId: aparelho.id,
            descricao: `${aparelho.marca} ${aparelho.modelo} (${aparelho.capacidade || 'N/A'}) - IMEI: ${aparelho.imei || termoBusca}`,
            quantidade: 1,
            valorInterno: custoNum,
            valorExibir: valorNum,
            desconto: 0,
            tipoDesconto: 'R$',
            total: valorNum,
            observacao: `Venda balcão via WhatsApp para ${compradorNome}`,
          },
        ],
        pagamentos: [
          {
            id: Date.now().toString(),
            metodo: 'pix',
            valor: valorNum,
            parcelas: 1,
          },
        ],
      });

      // 3. Log de auditoria estruturado
      try {
        await supabase.from('logs_sistema').insert({
          loja_id: lojaId,
          tipo_evento: 'venda',
          acao: `Venda WhatsApp: ${aparelho.modelo}`,
          detalhes: `Aparelho ${aparelho.modelo} (IMEI ${aparelho.imei}) vendido para ${compradorNome} por R$ ${valorNum.toFixed(2)}`,
          ator_telefone: authorPhone,
          ator_papel: perm.papel,
          valor_anterior: {
            status: aparelho.status,
            condicao: aparelho.condicao,
            comprador: aparelho.comprador,
            precoVenda: aparelho.precoVenda,
          },
          valor_novo: {
            status: 'vendido',
            condicao: 'vendido',
            comprador: compradorNome,
            precoVenda: valorNum,
          },
          created_at: new Date().toISOString(),
        });
      } catch (logErr) {
        console.warn('Falha silenciosa ao registrar log_sistema:', logErr);
      }

      const respVenda = `🎉 *VENDA REGISTRADA COM SUCESSO!*

📱 *Aparelho:* ${aparelho.marca} ${aparelho.modelo} (${aparelho.capacidade || 'N/A'})
🔢 *IMEI:* \`${aparelho.imei || termoBusca}\`
👤 *Comprador:* ${compradorNome}
💰 *Valor Final:* R$ ${valorNum.toFixed(2).replace('.', ',')}
📦 *Status:* Baixado do estoque oficial!

Os relatórios de vendas e auditoria da loja já foram atualizados. 🚀`;

      await enviarMensagemWhatsApp(instanceName, targetDestination, respVenda);
      return NextResponse.json({ status: 'ok', message: 'Venda registrada via WhatsApp.' }, { status: 200 });
    }

    // ── 6. COMANDO: !cadastrar [modelo] [capacidade] [imei] [preco] ──
    if (lowerText.startsWith('!cadastrar')) {
      if (!lojaId) {
        await enviarMensagemWhatsApp(instanceName, targetDestination, "❌ Não consegui identificar sua loja para executar este comando, contate o suporte");
        return NextResponse.json({ status: 'error', message: 'Loja não identificada' }, { status: 200 });
      }

      const perm = await verificarPermissaoWhatsApp(lojaId, authorPhone, ['owner', 'staff']);
      if (!perm.autorizado) {
        await enviarMensagemWhatsApp(instanceName, targetDestination, '⚠️ *Acesso Restrito:* Este comando é restrito à equipe autorizada da loja.');
        return NextResponse.json({ status: 'error', message: 'Acesso negado' }, { status: 200 });
      }

      const partes = textContent.trim().split(/\s+/);
      if (partes.length < 3) {
        const msgErro = `⚠️ *Formato de cadastro incompleto!*\nUse: *!cadastrar [Modelo] [Capacidade] [IMEI] [Preço]*\nExemplo: *!cadastrar iPhone 13 128GB 356829104829102 2800*`;
        await enviarMensagemWhatsApp(instanceName, targetDestination, msgErro);
        return NextResponse.json({ status: 'ok' }, { status: 200 });
      }

      let precoCad = 0;
      const ultimo = partes[partes.length - 1].replace(/[^\d.,]/g, '').replace(',', '.');
      if (!isNaN(parseFloat(ultimo))) {
        precoCad = parseFloat(ultimo);
        partes.pop();
      }

      let imeiCad = '';
      const penultimo = partes[partes.length - 1].replace(/\D/g, '');
      if (penultimo.length >= 8) {
        imeiCad = penultimo;
        partes.pop();
      }

      let capCad = '128GB';
      const antepenultimo = partes[partes.length - 1];
      if (/^\d+\s*(?:gb|tb)$/i.test(antepenultimo)) {
        capCad = antepenultimo.toUpperCase();
        partes.pop();
      }

      const modeloCad = partes.slice(1).join(' ').trim() || 'iPhone';

      const novoAparelho = {
        loja_id: lojaId,
        marca: modeloCad.toUpperCase().includes('IPHONE') ? 'Apple' : 'Smartphone',
        modelo: modeloCad,
        capacidade: capCad,
        imei: imeiCad || null,
        preco: precoCad > 0 ? precoCad : 0,
        condicao: 'seminovo',
        status: 'disponivel',
        ativo: true,
        dataCadastro: new Date().toISOString(),
        observacoes: `Cadastrado via WhatsApp IA (${pushName})`,
      };

      const { data: inserido, error: errCad } = await supabase.from('aparelhos').insert(novoAparelho).select().single();

      if (errCad) {
        console.error('❌ Erro ao cadastrar aparelho via WhatsApp:', errCad);
        await enviarMensagemWhatsApp(instanceName, targetDestination, `❌ Erro ao cadastrar aparelho: ${errCad.message}`);
        return NextResponse.json({ status: 'error' }, { status: 500 });
      }

      try {
        await supabase.from('logs_sistema').insert({
          loja_id: lojaId,
          tipo_evento: 'estoque',
          acao: `Entrada via WhatsApp: ${modeloCad}`,
          detalhes: `Aparelho ${modeloCad} (${capCad}) cadastrado por ${pushName} (${authorPhone})`,
          ator_telefone: authorPhone,
          ator_papel: perm.papel,
          valor_anterior: null,
          valor_novo: {
            id: inserido?.id,
            modelo: modeloCad,
            capacidade: capCad,
            imei: imeiCad,
            preco: precoCad,
          },
          created_at: new Date().toISOString(),
        });
      } catch (logErr) {
        console.warn('Falha silenciosa no log_sistema:', logErr);
      }

      const respCad = `✅ *NOVO APARELHO CADASTRADO NO ESTOQUE!*

📱 *Modelo:* ${modeloCad}
💾 *Capacidade:* ${capCad}
🔢 *IMEI:* \`${imeiCad || 'Não informado'}\`
💵 *Preço de Venda:* ${precoCad > 0 ? `R$ ${precoCad.toFixed(2).replace('.', ',')}` : 'A definir'}
📦 *Status:* 🟢 Disponível para venda

ID do Sistema: \`${inserido?.id?.slice(0, 8) || 'Criado'}\` ✨`;

      await enviarMensagemWhatsApp(instanceName, targetDestination, respCad);
      return NextResponse.json({ status: 'ok', message: 'Aparelho cadastrado com sucesso.' }, { status: 200 });
    }

    // ── 7. COMANDO: !preco [identificador] [novo_valor] ──
    if (lowerText.startsWith('!preco') || lowerText.startsWith('!preço')) {
      if (!lojaId) {
        await enviarMensagemWhatsApp(instanceName, targetDestination, "❌ Não consegui identificar sua loja para executar este comando, contate o suporte");
        return NextResponse.json({ status: 'error', message: 'Loja não identificada' }, { status: 200 });
      }

      const perm = await verificarPermissaoWhatsApp(lojaId, authorPhone, ['owner', 'staff']);
      if (!perm.autorizado) {
        await enviarMensagemWhatsApp(instanceName, targetDestination, '⚠️ *Acesso Restrito:* Este comando é restrito à equipe autorizada da loja.');
        return NextResponse.json({ status: 'error', message: 'Acesso negado' }, { status: 200 });
      }

      const partes = textContent.trim().split(/\s+/);
      if (partes.length < 3) {
        await enviarMensagemWhatsApp(instanceName, targetDestination, `⚠️ Use: *!preco [IMEI ou Código] [Novo Valor]*\nExemplo: *!preco 356829104829102 2750*`);
        return NextResponse.json({ status: 'ok' }, { status: 200 });
      }

      const ident = partes[1].trim();
      const novoValor = parseFloat(partes[2].replace(/[^\d.,]/g, '').replace(',', '.'));

      if (isNaN(novoValor) || novoValor <= 0) {
        await enviarMensagemWhatsApp(instanceName, targetDestination, `⚠️ Valor numérico inválido: "${partes[2]}".`);
        return NextResponse.json({ status: 'ok' }, { status: 200 });
      }

      const qP = supabase.from('aparelhos').select('*').eq('loja_id', lojaId);

      const { data: apars } = await qP
        .or(`imei.eq.${ident},imei.ilike.%${ident}%,codigo.eq.${ident},id.eq.${ident}`)
        .limit(1);

      const apar = apars?.[0];

      if (!apar) {
        await enviarMensagemWhatsApp(instanceName, targetDestination, `❌ Aparelho não encontrado para o identificador "${ident}".`);
        return NextResponse.json({ status: 'ok' }, { status: 200 });
      }

      await supabase.from('aparelhos').update({ preco: novoValor }).eq('id', apar.id);

      try {
        await supabase.from('logs_sistema').insert({
          loja_id: lojaId,
          tipo_evento: 'estoque',
          acao: `Preço alterado: ${apar.modelo}`,
          detalhes: `Preço de ${apar.modelo} alterado de R$ ${apar.preco} para R$ ${novoValor} via WhatsApp por ${pushName} (${authorPhone})`,
          ator_telefone: authorPhone,
          ator_papel: perm.papel,
          valor_anterior: { preco: apar.preco },
          valor_novo: { preco: novoValor },
          created_at: new Date().toISOString(),
        });
      } catch (logErr) {
        console.warn('Falha silenciosa no log_sistema:', logErr);
      }

      const respPreco = `✅ *PREÇO ATUALIZADO COM SUCESSO!*

📱 *Aparelho:* ${apar.modelo} (${apar.capacidade || ''})
💵 *Novo Preço de Varejo:* R$ ${novoValor.toFixed(2).replace('.', ',')}
🔢 *IMEI:* \`${apar.imei || ident}\``;

      await enviarMensagemWhatsApp(instanceName, targetDestination, respPreco);
      return NextResponse.json({ status: 'ok', message: 'Preço atualizado via WhatsApp.' }, { status: 200 });
    }

    // ── 8. LISTA DE PREÇOS DE FORNECEDOR ──
    const isListaPrecos =
      !isGroup &&
      (textContent.includes('📲') ||
        textContent.includes('📱') ||
        (textContent.split('\n').length > 4 && /iPhone\s*\d+/i.test(textContent)));

    if (isListaPrecos) {
      if (!lojaId) {
        await enviarMensagemWhatsApp(instanceName, targetDestination, "❌ Não consegui identificar sua loja para executar este comando, contate o suporte");
        return NextResponse.json({ status: 'error', message: 'Loja não identificada' }, { status: 200 });
      }

      const perm = await verificarPermissaoWhatsApp(lojaId, authorPhone, ['owner', 'staff']);
      if (!perm.autorizado) {
        await enviarMensagemWhatsApp(instanceName, targetDestination, '⚠️ *Acesso Restrito:* Este comando é restrito à equipe autorizada da loja.');
        return NextResponse.json({ status: 'error', message: 'Acesso negado' }, { status: 200 });
      }

      const lines = textContent.split('\n');
      const totalProcessados = await processarListaPrecos(lines, pushName, lojaId);

      if (totalProcessados > 0) {
        const respostaLista = `🚀 *Phone Center Auto-Bot*\n\nRecebemos sua lista! Processamos *${totalProcessados} modelos* e atualizamos o estoque da loja automaticamente.\n\nObrigado! ✅`;
        await enviarMensagemWhatsApp(instanceName, targetDestination, respostaLista);
        return NextResponse.json({ status: 'ok', message: `Lista processada: ${totalProcessados} modelos.` }, { status: 200 });
      }
    }

    // ── 9. COMANDO: !plano e !assinatura ──
    if (lowerText.startsWith('!plano') || lowerText.startsWith('!assinatura') || lowerText === 'plano' || lowerText === 'assinatura') {
      const resolvedLojaId = lojaId || (await resolverLojaId(instanceName));
      if (!resolvedLojaId) {
        await enviarMensagemWhatsApp(instanceName, targetDestination, '❌ Nenhuma loja encontrada vinculada a esta sessão do WhatsApp.');
        return NextResponse.json({ status: 'error', message: 'Loja não encontrada' }, { status: 200 });
      }

      const perm = await verificarPermissaoWhatsApp(resolvedLojaId, authorPhone, ['owner', 'staff']);
      if (!perm.autorizado) {
        await enviarMensagemWhatsApp(instanceName, targetDestination, '⚠️ *Acesso Restrito:* Este comando é restrito à equipe autorizada da loja.');
        return NextResponse.json({ status: 'error', message: 'Acesso negado' }, { status: 200 });
      }

      const { data: loja } = await supabase
        .from('lojas')
        .select('*')
        .eq('id', resolvedLojaId)
        .maybeSingle();

      if (!loja) {
        await enviarMensagemWhatsApp(instanceName, targetDestination, '❌ Informações da loja não localizadas.');
        return NextResponse.json({ status: 'error', message: 'Loja não encontrada' }, { status: 200 });
      }

      // 1. Calcular dias restantes e status
      let diasRestantes = 0;
      let dataVencimentoFmt = 'Não definida';
      let isVencido = false;

      if (loja.data_vencimento) {
        const parts = String(loja.data_vencimento).split('T')[0].split('-');
        if (parts.length === 3) {
          const year = parseInt(parts[0], 10);
          const month = parseInt(parts[1], 10) - 1;
          const day = parseInt(parts[2], 10);
          const venc = new Date(year, month, day, 23, 59, 59, 999);
          const diffTime = venc.getTime() - Date.now();
          diasRestantes = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
          dataVencimentoFmt = `${String(day).padStart(2, '0')}/${String(month + 1).padStart(2, '0')}/${year}`;
          isVencido = diasRestantes <= 0;
        }
      }

      const valorMensalBase = Number(loja.valor_mensalidade || 99.90);
      const valorDiaria = valorMensalBase / 30;

      // 2. Se for apenas consulta (!plano ou !assinatura sem intenção explícita de pagar)
      const querPagar = lowerText.includes('pagar') || lowerText.includes('renovar') || lowerText.includes('pix');
      if (!querPagar) {
        let label1Mes = `R$ ${valorMensalBase.toFixed(2).replace('.', ',')} (30 dias)`;
        if (diasRestantes > 0 && diasRestantes < 30 && (loja.plano_status === 'ativo' || !loja.plano_status)) {
          const diasFaltantes = 30 - diasRestantes;
          const valorParcial = Math.max(1.00, Number((diasFaltantes * valorDiaria).toFixed(2)));
          label1Mes = `R$ ${valorParcial.toFixed(2).replace('.', ',')} (Proporcional: ${diasFaltantes} dias p/ completar 30 dias)`;
        }

        const v3Meses = (valorMensalBase * 3).toFixed(2).replace('.', ',');
        const v6Meses = (valorMensalBase * 6).toFixed(2).replace('.', ',');
        const v1Ano = (valorMensalBase * 12).toFixed(2).replace('.', ',');

        const statusTexto = isVencido 
          ? `🔴 *Vencido* (Vencido há ${Math.abs(diasRestantes)} dias)` 
          : `🟢 *Ativo* (Restam ${diasRestantes} dias)`;

        const msgMenuPlano = `📋 *ASSINATURA - ${loja.nome || 'SISTEMA'}*\n\n` +
          `• *Status*: ${statusTexto}\n` +
          `• *Vencimento*: ${dataVencimentoFmt}\n` +
          `• *Mensalidade Base*: R$ ${valorMensalBase.toFixed(2).replace('.', ',')}/mês\n\n` +
          `💡 *Deseja renovar ou adiantar sua assinatura?*\n` +
          `Envie um dos comandos abaixo para gerar o PIX imediato:\n\n` +
          `👉 *!plano pagar*\n` +
          `_${label1Mes}_\n\n` +
          `👉 *!plano pagar 3 meses*\n` +
          `_3 Meses (+90 dias): R$ ${v3Meses}_\n\n` +
          `👉 *!plano pagar 6 meses*\n` +
          `_6 Meses (+180 dias): R$ ${v6Meses}_\n\n` +
          `👉 *!plano pagar 1 ano*\n` +
          `_1 Ano (+365 dias): R$ ${v1Ano}_\n\n` +
          `_⚡ O PIX gerado possui validade de 5 minutos com Copia e Cola e imagem do QR Code._`;

        await enviarMensagemWhatsApp(instanceName, targetDestination, msgMenuPlano);
        return NextResponse.json({ status: 'ok', message: 'Menu de planos enviado.' }, { status: 200 });
      }

      // 3. Se solicitou pagamento (!plano pagar ...)
      let diasAdicionar = 30;
      let valorFinal = valorMensalBase;
      let labelPeriodo = '1 Mês';

      if (lowerText.includes('1 ano') || lowerText.includes('12 meses') || lowerText.includes('ano') || lowerText.includes('anual')) {
        diasAdicionar = 365;
        valorFinal = Number((valorMensalBase * 12).toFixed(2));
        labelPeriodo = '1 Ano (+365 dias)';
      } else if (lowerText.includes('6 meses') || lowerText.includes('semestral')) {
        diasAdicionar = 180;
        valorFinal = Number((valorMensalBase * 6).toFixed(2));
        labelPeriodo = '6 Meses (+180 dias)';
      } else if (lowerText.includes('3 meses') || lowerText.includes('trimestral')) {
        diasAdicionar = 90;
        valorFinal = Number((valorMensalBase * 3).toFixed(2));
        labelPeriodo = '3 Meses (+90 dias)';
      } else {
        // 1 Mês (aplica proporcionalidade se estiver ativo com dias restantes < 30)
        if (diasRestantes > 0 && diasRestantes < 30 && (loja.plano_status === 'ativo' || !loja.plano_status)) {
          const diasFaltantes = 30 - diasRestantes;
          valorFinal = Math.max(1.00, Number((diasFaltantes * valorDiaria).toFixed(2)));
          diasAdicionar = diasFaltantes;
          labelPeriodo = `Renovação Proporcional (${diasFaltantes} dias)`;
        } else {
          valorFinal = valorMensalBase;
          diasAdicionar = 30;
          labelPeriodo = '1 Mês (+30 dias)';
        }
      }

      // Buscar Access Token Mercado Pago da plataforma (conta central do dono da plataforma)
      const tokenMercadoPago = process.env.MERCADO_PAGO_ACCESS_TOKEN?.trim();

      if (!tokenMercadoPago) {
        await enviarMensagemWhatsApp(instanceName, targetDestination, '❌ O Mercado Pago ainda não está configurado no sistema. Contate o suporte.');
        return NextResponse.json({ status: 'error', message: 'Token Mercado Pago não configurado' }, { status: 200 });
      }

      // Gerar PIX no Mercado Pago com expiração em 5 minutos
      const payerEmail = (loja.email && loja.email.includes('@')) ? loja.email.trim() : 'financeiro@painelcelular.com.br';
      const payerName = (loja.nome || pushName || 'Cliente').trim().slice(0, 30);
      const expiraEm5Min = new Date(Date.now() + 5 * 60 * 1000).toISOString();

      try {
        const mpResponse = await fetch('https://api.mercadopago.com/v1/payments', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${tokenMercadoPago}`,
            'Content-Type': 'application/json',
            'X-Idempotency-Key': `${loja.id}-${Date.now()}`,
          },
          body: JSON.stringify({
            transaction_amount: Number(valorFinal.toFixed(2)),
            description: `Assinatura ${labelPeriodo} - ${(loja.nome || 'Loja').slice(0, 30)}`,
            payment_method_id: 'pix',
            date_of_expiration: expiraEm5Min,
            payer: {
              email: payerEmail,
              first_name: payerName,
            },
            external_reference: loja.id,
          }),
        });

        const mpData = await mpResponse.json().catch(() => ({}));

        if (!mpResponse.ok || !mpData.point_of_interaction?.transaction_data) {
          const erroMp = mpData.message || mpData.cause?.[0]?.description || 'Erro ao comunicar com Mercado Pago';
          await enviarMensagemWhatsApp(instanceName, targetDestination, `❌ Falha ao gerar PIX no Mercado Pago: ${erroMp}`);
          return NextResponse.json({ status: 'error', message: erroMp }, { status: 200 });
        }

        const txData = mpData.point_of_interaction.transaction_data;
        const paymentId = String(mpData.id);
        const qrCode = txData.qr_code;
        const qrCodeBase64 = txData.qr_code_base64;

        // Registrar no histórico de pagamentos com rastreamento completo
        await supabase.from('historico_pagamentos_planos').insert({
          loja_id: loja.id,
          valor: valorFinal,
          status: 'pendente',
          mp_payment_id: paymentId,
          qr_code: qrCode,
          qr_code_base64: qrCodeBase64,
          observacao: `PIX WhatsApp | Periodo: ${labelPeriodo} | Dias: ${diasAdicionar} | Destino: ${targetDestination} | Instancia: ${instanceName}`,
        });

        // 1. Enviar mensagem de texto com instruções e Copia e Cola
        const msgTextoPix = `💳 *PIX DE ASSINATURA GERADO!* 💳\n\n` +
          `📌 *Plano*: ${labelPeriodo}\n` +
          `💰 *Valor*: R$ ${valorFinal.toFixed(2).replace('.', ',')}\n` +
          `⏳ *Validade*: 5 minutos\n\n` +
          `👇 *PIX Copia e Cola (toque para copiar):*`;

        await enviarMensagemWhatsApp(instanceName, targetDestination, msgTextoPix);
        await enviarMensagemWhatsApp(instanceName, targetDestination, qrCode);

        // 2. Enviar QR Code visual em imagem
        const qrMedia = qrCodeBase64
          ? `data:image/png;base64,${qrCodeBase64}`
          : `https://api.qrserver.com/v1/create-qr-code/?size=500x500&data=${encodeURIComponent(qrCode)}`;

        await enviarImagemWhatsApp(
          instanceName,
          targetDestination,
          qrMedia,
          `📱 *QR Code PIX*\nEscaneie no app do seu banco para pagar R$ ${valorFinal.toFixed(2).replace('.', ',')}.\nValidade: 5 minutos.`
        );

        // 3. Monitoramento em background do ciclo de vida de 5 minutos
        after(async () => {
          await monitorarCicloVidaPix({
            paymentId,
            lojaId: loja.id,
            diasAdicionar,
            valorFinal,
            instanceName,
            targetDestination,
            tokenMercadoPago,
          });
        });

        return NextResponse.json({ status: 'ok', message: 'PIX gerado e enviado com sucesso.' }, { status: 200 });
      } catch (mpErr: any) {
        console.error('Erro na requisição ao Mercado Pago:', mpErr);
        await enviarMensagemWhatsApp(instanceName, targetDestination, `❌ Falha ao conectar ao Mercado Pago: ${mpErr?.message || 'Erro de rede'}`);
        return NextResponse.json({ status: 'error', message: mpErr?.message }, { status: 200 });
      }
    }

    // ── 10. COMANDO: !estoque e !estoque completo ──
    if (lowerText.startsWith('!estoque') || lowerText === 'estoque' || lowerText === 'cardapio' || lowerText === 'tabela') {
      const resolvedLojaId = lojaId || (await resolverLojaId(instanceName));
      if (!resolvedLojaId) {
        await enviarMensagemWhatsApp(instanceName, targetDestination, "❌ Não consegui identificar sua loja para executar este comando, contate o suporte");
        return NextResponse.json({ status: 'error', message: 'Loja não identificada' }, { status: 200 });
      }
      const isCompleto = lowerText.includes('completo') || lowerText.includes('atacado') || lowerText.includes('detalhe');

      const { data: loja } = await supabase
        .from('lojas')
        .select('*')
        .eq('id', resolvedLojaId)
        .maybeSingle();

      const isLucas = await verificarSeLojaLucasImports(resolvedLojaId, instanceName);

      // Em grupos: se NÃO for a Lucas Imports, apenas o próprio cliente/dono da loja pode disparar o comando !estoque
      if (isGroup && !isLucas) {
        const lojaTelefone = (loja?.telefone || '').replace(/\D/g, '');

        const isDono = lojaTelefone && participantPhone && (lojaTelefone.endsWith(participantPhone.slice(-8)) || participantPhone.endsWith(lojaTelefone.slice(-8)));

        if (!isDono && lojaTelefone && lojaTelefone !== 'Não informado') {
          console.log(`[Segurança Multi-Tenant] Comando !estoque em grupo ignorado: ${participantPhone} não é o dono da loja ${loja?.nome}.`);
          return NextResponse.json({ status: 'ok', message: 'Comando em grupo restrito ao dono da loja.' }, { status: 200 });
        }
      }

      // Consulta estritamente os aparelhos DESTA LOJA (zero fallbacks para outras lojas!)
      const { data: aparelhos } = await supabase
        .from('aparelhos')
        .select('id, marca, modelo, capacidade, cor, preco, preco_atacado, precoAtacado, saude_bateria, imei, codigo, status, condicao')
        .eq('loja_id', resolvedLojaId)
        .eq('ativo', true)
        .neq('status', 'vendido')
        .neq('condicao', 'vendido');

      if (!aparelhos || aparelhos.length === 0) {
        const nomeLoja = (loja?.nome || 'PHONE CENTER').trim();
        await enviarMensagemWhatsApp(instanceName, targetDestination, `📋 *ESTOQUE - ${nomeLoja}*\n\nNenhum aparelho disponível em estoque no momento.`);
        return NextResponse.json({ status: 'ok', message: 'Estoque vazio.' }, { status: 200 });
      }

      // Ordena por modelo normalizado
      aparelhos.sort((a, b) => normalizarModelo(a.modelo).localeCompare(normalizarModelo(b.modelo)));

      let ultimoModelo = '';
      const linhasEstoque: string[] = [];

      aparelhos.forEach((a) => {
        const modNorm = normalizarModelo(a.modelo);
        if (ultimoModelo && ultimoModelo !== modNorm) {
          linhasEstoque.push('');
        }
        ultimoModelo = modNorm;

        const { emoji, nomeCor } = formatarCorEEmoji(a.cor);
        const cap = a.capacidade && a.capacidade !== 'N/A' ? `${a.capacidade}` : '';
        const batVal = a.saude_bateria || (a as any).saudeBateria;
        const batNum = batVal ? String(batVal).replace(/\D/g, '') : '';
        const bat = batNum ? `(${batNum}%)` : '';
        const modCap = [modNorm, cap].filter(Boolean).join(' ');
        const extras = [nomeCor, bat].filter(Boolean).join(' ');

        if (isCompleto) {
          const cod = a.codigo || (a.imei ? `...${String(a.imei).slice(-4)}` : `#${String(a.id).slice(0, 4)}`);
          const precoAtacadoVal = a.preco_atacado || (a as any).precoAtacado || a.preco;
          const atacadoFmt = precoAtacadoVal ? `R$ ${Number(precoAtacadoVal).toFixed(2).replace('.', ',')}` : 'Consulte';
          linhasEstoque.push(`${emoji} ${modCap}${extras ? ` - ${extras}` : ''} | Cód: ${cod} | Atacado: ${atacadoFmt}`.replace(/\s+/g, ' ').trim());
        } else {
          linhasEstoque.push(`${emoji} ${modCap}${extras ? ` - ${extras}` : ''}`.replace(/\s+/g, ' ').trim());
        }
      });

      const nomeExibicao = (loja?.nome || 'PHONE CENTER').trim().toUpperCase();
      const cabecalho = isCompleto
        ? `📋 *ESTOQUE COMPLETO (ATACADO) - ${nomeExibicao}*\nTotal: *${aparelhos.length} aparelhos* em estoque\n\n`
        : `📋 *ESTOQUE DISPONÍVEL - ${nomeExibicao}*\nTotal: *${aparelhos.length} aparelhos* em estoque\n\n`;

      const rodape = isCompleto
        ? `\n\n💡 _Para vender um aparelho envie:_ *!vender [CÓDIGO/IMEI] [VALOR]*`
        : `\n\n💡 _Para ver códigos e preços de atacado envie:_ *!estoque completo*`;

      const mensagemEstoque = cabecalho + linhasEstoque.join('\n') + rodape;
      await enviarMensagemWhatsApp(instanceName, targetDestination, mensagemEstoque);
      return NextResponse.json({ status: 'ok', message: `Estoque enviado (${aparelhos.length} itens).` }, { status: 200 });
    }

    // ── 11. COMANDO: !abater [lojista] [valor] (Gestão de Fiado/Atacado) ──
    if (lowerText.startsWith('!abater')) {
      if (!lojaId) {
        await enviarMensagemWhatsApp(instanceName, targetDestination, "❌ Não consegui identificar sua loja para executar este comando, contate o suporte");
        return NextResponse.json({ status: 'error', message: 'Loja não identificada' }, { status: 200 });
      }

      const perm = await verificarPermissaoWhatsApp(lojaId, authorPhone, ['owner', 'staff']);
      if (!perm.autorizado) {
        await enviarMensagemWhatsApp(instanceName, targetDestination, '⚠️ *Acesso Restrito:* Este comando é restrito à equipe autorizada da loja.');
        return NextResponse.json({ status: 'error', message: 'Acesso negado' }, { status: 200 });
      }

      const partes = textContent.trim().split(/\s+/);
      if (partes.length < 3) {
        await enviarMensagemWhatsApp(
          instanceName,
          targetDestination,
          '⚠️ *Formato de abatimento incompleto!*\nUse: *!abater [Nome do Lojista] [Valor]*\nExemplo: *!abater Lucas 1500*'
        );
        return NextResponse.json({ status: 'ok' }, { status: 200 });
      }

      const valorStr = partes[partes.length - 1];
      const valorAbate = parseFloat(valorStr.replace(/[^\d.,]/g, '').replace(',', '.'));

      if (isNaN(valorAbate) || valorAbate <= 0) {
        await enviarMensagemWhatsApp(instanceName, targetDestination, `⚠️ Valor de abatimento inválido: "${valorStr}". Digite um valor numérico válido.`);
        return NextResponse.json({ status: 'ok' }, { status: 200 });
      }

      const nomeLojista = partes.slice(1, -1).join(' ').trim();
      if (!nomeLojista) {
        await enviarMensagemWhatsApp(instanceName, targetDestination, '⚠️ Nome do lojista não informado.');
        return NextResponse.json({ status: 'ok' }, { status: 200 });
      }

      const { data: devedores, error: errDev } = await supabase
        .from('lojistas_devedores')
        .select('*')
        .eq('loja_id', lojaId)
        .eq('ativo', true)
        .ilike('nome', `%${nomeLojista}%`)
        .limit(5);

      if (errDev) {
        console.error('Erro ao buscar lojistas_devedores:', errDev);
      }

      if (!devedores || devedores.length === 0) {
        await enviarMensagemWhatsApp(
          instanceName,
          targetDestination,
          `❌ Nenhum lojista devedor encontrado com o nome "*${nomeLojista}*" nesta loja. Verifique o cadastro no painel!`
        );
        return NextResponse.json({ status: 'ok' }, { status: 200 });
      }

      const devedor = devedores[0];
      const saldoAnterior = Number(devedor.saldo_devedor || 0);
      const novoSaldo = Math.max(0, Number((saldoAnterior - valorAbate).toFixed(2)));

      await supabase
        .from('lojistas_devedores')
        .update({
          saldo_devedor: novoSaldo,
          updated_at: new Date().toISOString(),
        })
        .eq('id', devedor.id);

      try {
        await supabase.from('historico_abatimentos').insert({
          loja_id: lojaId,
          lojista_id: devedor.id,
          valor: valorAbate,
          data: new Date().toISOString(),
          ator_telefone: authorPhone,
          observacao: `Abatimento via WhatsApp por ${pushName}`,
        });
      } catch (histErr) {
        console.warn('Falha ao inserir em historico_abatimentos:', histErr);
      }

      try {
        await supabase.from('logs_sistema').insert({
          loja_id: lojaId,
          tipo_evento: 'financeiro',
          acao: `Abatimento: ${devedor.nome}`,
          detalhes: `Abatimento de R$ ${valorAbate.toFixed(2)} registrado por ${pushName} (${authorPhone}). Saldo anterior: R$ ${saldoAnterior.toFixed(2)}, novo saldo: R$ ${novoSaldo.toFixed(2)}`,
          ator_telefone: authorPhone,
          ator_papel: perm.papel,
          valor_anterior: { saldo_devedor: saldoAnterior },
          valor_novo: { saldo_devedor: novoSaldo },
          created_at: new Date().toISOString(),
        });
      } catch (logErr) {
        console.warn('Falha ao inserir log de auditoria:', logErr);
      }

      const reciboAbate = `✅ *ABATIMENTO REGISTRADO COM SUCESSO!*

👤 *Lojista:* ${devedor.nome}
💵 *Valor Abatido:* R$ ${valorAbate.toFixed(2).replace('.', ',')}
📉 *Saldo Devedor Anterior:* R$ ${saldoAnterior.toFixed(2).replace('.', ',')}
💰 *Saldo Devedor Atual:* R$ ${novoSaldo.toFixed(2).replace('.', ',')}
✨ Registrado e arquivado no financeiro da loja!`;

      await enviarMensagemWhatsApp(instanceName, targetDestination, reciboAbate);
      return NextResponse.json({ status: 'ok', message: 'Abatimento registrado.' }, { status: 200 });
    }

    // ── 12. COMANDO: !saldo ou !devo (Consulta de Débitos do Próprio Lojista/Cliente) ──
    if (lowerText === '!saldo' || lowerText === '!devo' || lowerText.startsWith('!saldo ') || lowerText.startsWith('!devo ')) {
      const cleanPhone = (authorPhone || senderPhone || '').replace(/\D/g, '');
      if (!cleanPhone || cleanPhone.length < 8) {
        await enviarMensagemWhatsApp(instanceName, targetDestination, '⚠️ Não consegui identificar o número de telefone de origem para consultar seus débitos.');
        return NextResponse.json({ status: 'ok' }, { status: 200 });
      }

      const { data: todosDevedores, error: errDevs } = await supabase
        .from('lojistas_devedores')
        .select('id, nome, telefone, saldo_devedor, loja_id, lojas(nome)')
        .eq('ativo', true)
        .gt('saldo_devedor', 0);

      if (errDevs) {
        console.error('Erro ao consultar lojistas_devedores:', errDevs);
      }

      const meusDebitos = (todosDevedores || []).filter((item: any) => {
        const itemPhone = (item.telefone || '').replace(/\D/g, '');
        if (!itemPhone) return false;
        if (itemPhone === cleanPhone) return true;
        if (cleanPhone.endsWith(itemPhone) || itemPhone.endsWith(cleanPhone)) return true;
        if (cleanPhone.length >= 8 && itemPhone.length >= 8) {
          const l8User = cleanPhone.slice(-8);
          const l8Item = itemPhone.slice(-8);
          if (l8User === l8Item) {
            if (cleanPhone.length >= 10 && itemPhone.length >= 10) {
              const dddUser = cleanPhone.length >= 11 ? cleanPhone.slice(-11, -9) : cleanPhone.slice(-10, -8);
              const dddItem = itemPhone.length >= 11 ? itemPhone.slice(-11, -9) : itemPhone.slice(-10, -8);
              return dddUser === dddItem;
            }
            return true;
          }
        }
        return false;
      });

      if (meusDebitos.length === 0) {
        const msgSemDebito = `🎉 *Você não possui nenhum saldo devedor em aberto!*

Tudo em dia por aqui. Obrigado pela parceria e preferência! 🤝`;
        await enviarMensagemWhatsApp(instanceName, targetDestination, msgSemDebito);
        return NextResponse.json({ status: 'ok', message: 'Sem débitos.' }, { status: 200 });
      }

      let totalGeral = 0;
      const linhasDebito: string[] = [];

      for (const deb of meusDebitos) {
        const saldoNum = Number(deb.saldo_devedor || 0);
        totalGeral += saldoNum;
        const nomeLoja = (deb.lojas as any)?.nome || 'Loja Parceira';
        linhasDebito.push(`🏪 *Loja:* ${nomeLoja}\n👤 *Titular:* ${deb.nome}\n💰 *Saldo Devedor:* R$ ${saldoNum.toFixed(2).replace('.', ',')}\n`);
      }

      const msgExtrato = `📋 *EXTRATO DE DÉBITOS EM ABERTO*

${linhasDebito.join('\n')}
────────────────────────
💵 *Total Geral Devido:* R$ ${totalGeral.toFixed(2).replace('.', ',')}

💡 _Para realizar pagamentos ou solicitar abatimentos, envie o comprovante ao responsável da loja._`;

      await enviarMensagemWhatsApp(instanceName, targetDestination, msgExtrato);
      return NextResponse.json({ status: 'ok', message: 'Extrato de débitos enviado.' }, { status: 200 });
    }

    // ── 13. COMANDO: !checarimei [imei] ou !checar [imei] ──
    if (lowerText.startsWith('!checarimei') || lowerText.startsWith('!checar')) {
      if (!lojaId) {
        await enviarMensagemWhatsApp(instanceName, targetDestination, "❌ Não consegui identificar sua loja para executar este comando, contate o suporte");
        return NextResponse.json({ status: 'error', message: 'Loja não identificada' }, { status: 200 });
      }

      const perm = await verificarPermissaoWhatsApp(lojaId, authorPhone, ['owner', 'staff']);
      if (!perm.autorizado) {
        await enviarMensagemWhatsApp(instanceName, targetDestination, '⚠️ *Acesso Restrito:* Este comando é restrito à equipe autorizada da loja.');
        return NextResponse.json({ status: 'error', message: 'Acesso negado' }, { status: 200 });
      }

      const partes = textContent.trim().split(/\s+/);
      const imeiArg = partes[1]?.replace(/\D/g, '') || '';

      if (!imeiArg || imeiArg.length < 14) {
        await enviarMensagemWhatsApp(
          instanceName,
          targetDestination,
          '⚠️ *IMEI incompleto ou inválido!*\nO IMEI deve conter pelo menos 14 a 15 dígitos numéricos.\nExemplo: *!checarimei 356829104829102*'
        );
        return NextResponse.json({ status: 'ok' }, { status: 200 });
      }

      const resultado = await verificarImeiRoubado(lojaId, imeiArg);

      try {
        await supabase.from('logs_sistema').insert({
          loja_id: lojaId,
          tipo_evento: 'seguranca',
          acao: `Checagem IMEI: ${imeiArg}`,
          detalhes: `Consulta de IMEI realizada por ${pushName} (${authorPhone}). Resultado: ${resultado.bloqueado ? 'BLOQUEADO' : 'LIMPO'}`,
          ator_telefone: authorPhone,
          ator_papel: perm.papel,
          valor_novo: { imei: imeiArg, bloqueado: resultado.bloqueado, motivo: resultado.motivo || null },
          created_at: new Date().toISOString(),
        });
      } catch (logErr) {
        console.warn('Falha silenciosa ao registrar log_sistema:', logErr);
      }

      if (resultado.bloqueado) {
        const msgAlerta = `🔴 *ALERTA DE SEGURANÇA - IMEI COM RESTRIÇÃO!*

🔢 *IMEI:* \`${imeiArg}\`
⚠️ *Status:* *IMPEDIMENTO IDENTIFICADO*
🚨 *Motivo:* ${resultado.motivo || 'Consta restrição de furto/roubo ou bloqueio administrativo'}

🛑 *Recomendação:* Não compre nem receba este aparelho para manutenção!`;
        await enviarMensagemWhatsApp(instanceName, targetDestination, msgAlerta);
        return NextResponse.json({ status: 'ok', message: 'IMEI com restrição.' }, { status: 200 });
      }

      const msgLimpo = `🛡️ *CONSULTA DE IMEI - BASE DE SEGURANÇA*

🔢 *IMEI:* \`${imeiArg}\`
🛡️ *Status de Impedimento:* 🟢 *NENHUMA RESTRIÇÃO ENCONTRADA (LIMPO)*
✅ Aparelho verificado e liberado para negociação ou cadastro no estoque!

_Origem da verificação: Base de Segurança Phone Center & Validação GSMA._`;

      await enviarMensagemWhatsApp(instanceName, targetDestination, msgLimpo);
      return NextResponse.json({ status: 'ok', message: 'IMEI limpo.' }, { status: 200 });
    }

    // ── 14. COMANDO: !broadcast [agora|status] ──
    if (lowerText.startsWith('!broadcast')) {
      if (!lojaId) {
        await enviarMensagemWhatsApp(instanceName, targetDestination, "❌ Não consegui identificar sua loja para executar este comando, contate o suporte");
        return NextResponse.json({ status: 'error', message: 'Loja não identificada' }, { status: 200 });
      }

      const perm = await verificarPermissaoWhatsApp(lojaId, authorPhone, ['owner']);
      if (!perm.autorizado) {
        await enviarMensagemWhatsApp(instanceName, targetDestination, '⚠️ *Acesso Restrito:* O comando de broadcast é restrito ao dono (owner) da loja.');
        return NextResponse.json({ status: 'error', message: 'Acesso negado' }, { status: 200 });
      }

      const { data: loja } = await supabase
        .from('lojas')
        .select('*')
        .eq('id', lojaId)
        .maybeSingle();

      const config = (loja?.configuracoes || {}) as any;
      const gruposBroadcast: string[] = Array.isArray(config.broadcast_grupos) ? config.broadcast_grupos : [];
      const ativo = Boolean(config.broadcast_listas_ativo);

      if (lowerText.includes('agora') || lowerText.includes('disparar')) {
        if (gruposBroadcast.length === 0) {
          await enviarMensagemWhatsApp(
            instanceName,
            targetDestination,
            '⚠️ *Nenhum grupo configurado para broadcast!*\nConfigure a lista de grupos nas configurações da sua loja no painel.'
          );
          return NextResponse.json({ status: 'ok' }, { status: 200 });
        }

        const { data: aparelhos } = await supabase
          .from('aparelhos')
          .select('marca, modelo, capacidade, cor, preco_atacado, precoAtacado, preco, saude_bateria')
          .eq('loja_id', lojaId)
          .eq('ativo', true)
          .neq('condicao', 'vendido')
          .neq('status', 'vendido');

        if (!aparelhos || aparelhos.length === 0) {
          await enviarMensagemWhatsApp(instanceName, targetDestination, '⚠️ O estoque da loja está vazio no momento. Nada a transmitir.');
          return NextResponse.json({ status: 'ok' }, { status: 200 });
        }

        aparelhos.sort((a, b) => normalizarModelo(a.modelo).localeCompare(normalizarModelo(b.modelo)));

        let ultimoMod = '';
        const linhasEstoque: string[] = [];
        aparelhos.forEach((a) => {
          const modNorm = normalizarModelo(a.modelo);
          if (ultimoMod && ultimoMod !== modNorm) linhasEstoque.push('');
          ultimoMod = modNorm;
          const { emoji, nomeCor } = formatarCorEEmoji(a.cor);
          const cap = a.capacidade ? `${a.capacidade}` : '';
          const bat = a.saude_bateria ? `(${a.saude_bateria}%)` : '';
          const preco = a.preco_atacado || (a as any).precoAtacado || a.preco;
          const precoFmt = preco ? `- R$ ${Number(preco).toFixed(2).replace('.', ',')}` : '';
          linhasEstoque.push(`${emoji} ${[modNorm, cap].filter(Boolean).join(' ')} ${[nomeCor, bat].filter(Boolean).join(' ')} ${precoFmt}`.replace(/\s+/g, ' ').trim());
        });

        const textoBroadcast = `📢 *TABELA ATUALIZADA - ${loja?.nome || 'PHONE CENTER'}*\n\n${linhasEstoque.join('\n')}\n\n📲 _Peça já o seu diretamente no privado!_`;

        let disparados = 0;
        for (const grupoId of gruposBroadcast) {
          const enviado = await enviarMensagemWhatsApp(instanceName, grupoId, textoBroadcast);
          if (enviado) disparados++;
        }

        await enviarMensagemWhatsApp(
          instanceName,
          targetDestination,
          `✅ *BROADCAST TRANSMITIDO COM SUCESSO!*\n\n📡 Enviado para *${disparados} de ${gruposBroadcast.length} grupo(s)* configurados.`
        );
        return NextResponse.json({ status: 'ok', message: `Broadcast enviado para ${disparados} grupos.` }, { status: 200 });
      }

      const msgStatus = `📡 *CONFIGURAÇÃO DE BROADCAST AUTOMÁTICO*

🏪 *Loja:* ${loja?.nome || 'Phone Center'}
🟢 *Broadcast Automático:* ${ativo ? 'Ativado' : 'Desativado'}
👥 *Grupos Cadastrados:* ${gruposBroadcast.length} grupo(s)
${gruposBroadcast.map((g, idx) => `  ${idx + 1}. \`${g}\``).join('\n') || '  _Nenhum grupo cadastrado_'}

💡 *Para disparar o estoque agora mesmo para os grupos:*
Digite: *!broadcast agora*`;

      await enviarMensagemWhatsApp(instanceName, targetDestination, msgStatus);
      return NextResponse.json({ status: 'ok', message: 'Status do broadcast enviado.' }, { status: 200 });
    }

    // ── 15. COMANDOS BÁSICOS (!ajuda, !menu) ──
    if (lowerText.startsWith('!ajuda') || lowerText.startsWith('!menu')) {
      const menuAjuda = `📱 *PHONE CENTER BOT - INTELIGÊNCIA ARTIFICIAL*

📸 *Reconhecimento Visual de Etiquetas (OCR):*
• Envie uma foto da etiqueta/caixa do aparelho! Eu reconheço modelo, capacidade, IMEI, bateria e verifico o estoque na hora.

💳 *Assinatura do Sistema:*
• *!plano* - Consulta status da assinatura, vencimento e opções de renovação
• *!plano pagar* - Gera o PIX da mensalidade (1 mês proporcional)
• *!plano pagar [3 meses | 6 meses | 1 ano]* - Gera o PIX para períodos estendidos

⚡ *Comandos Operacionais de Estoque:*
• *!estoque* - Consulta todos os aparelhos disponíveis (Modelo, Cor, Bateria)
• *!estoque completo* - Exibe aparelhos com códigos e preços de atacado
• *!vender [IMEI/Cód] [Valor] [Nome]* - Registra venda e baixa do estoque
• *!cadastrar [Modelo] [Capacidade] [IMEI] [Preço]* - Entrada em novo aparelho
• *!preco [IMEI/Cód] [Novo Valor]* - Atualiza preço no sistema

🤝 *Gestão de Atacado & Fiado:*
• *!abater [Lojista] [Valor]* - Registra abatimento no saldo devedor do lojista
• *!saldo* ou *!devo* - Consulta débitos em aberto vinculados ao seu número

🔒 *Segurança & Broadcast:*
• *!checarimei [IMEI]* - Consulta restrições e bloqueios de IMEI
• *!broadcast agora* - Transmissão de estoque para grupos cadastrados
• *!broadcast* - Status dos grupos de broadcast configurados

💬 *Atendimento Inteligente:*
• Pergunte qualquer coisa em grupos ou privado (ex: *"tem 15pm?"*, *"tem iphone 11?"*) e eu respondo na hora!`;

      await enviarMensagemWhatsApp(instanceName, targetDestination, menuAjuda);
      return NextResponse.json({ status: 'ok', message: 'Menu de ajuda enviado.' }, { status: 200 });
    }

    // ── 12. CONSULTA NATURAL DE ESTOQUE (EXCLUSIVO LUCAS IMPORTS) ──
    const respostaNatural = await responderConsultaEstoqueNatural(
      textContent,
      pushName,
      lojaId,
      instanceName,
      isGroup,
      participantPhone || senderPhone,
      remoteJid
    );
    if (respostaNatural) {
      await enviarMensagemWhatsApp(instanceName, targetDestination, respostaNatural);
      return NextResponse.json({ status: 'ok', message: 'Consulta de estoque respondida naturalmente.' }, { status: 200 });
    }

    // ── 13. COMANDOS ESTRUTURADOS GEMINI PLAN (LINGUAGEM NATURAL) ──
    let nomeLojaGemini: string | undefined;
    if (lojaId) {
      const { data: lojaInfo } = await supabase.from('lojas').select('nome').eq('id', lojaId).maybeSingle();
      nomeLojaGemini = lojaInfo?.nome;
    }

    const rawPlan = await gerarPlanoComGemini(textContent, {
      nome: nomeLojaGemini,
      lojaId: lojaId || undefined,
    });
    const geminiPlan = parseGeminiPlan(rawPlan || '');

    if (geminiPlan) {
      // Funil de confiança - Nível Médio: pergunta objetiva de volta
      if (geminiPlan.confianca === 'media' && geminiPlan.perguntaClarificacao) {
        await enviarMensagemWhatsApp(instanceName, targetDestination, `❓ ${geminiPlan.perguntaClarificacao}`);
        return NextResponse.json({ status: 'ok', message: 'Pergunta de clarificação enviada via IA.' }, { status: 200 });
      }

      // Funil de confiança - Nível Alto: executa / confirma
      if (geminiPlan.confianca === 'alta') {
        const acoesDeEscrita = [
          'create_venda',
          'create_aparelho',
          'update_preco',
          'abater_divida',
          'create_os',
          'create_cliente',
        ];

        // Se for ação que escreve dados ou move valores, valida permissão
        if (acoesDeEscrita.includes(geminiPlan.action)) {
          if (lojaId) {
            const perm = await verificarPermissaoWhatsApp(lojaId, authorPhone, ['owner', 'staff']);
            if (!perm.autorizado) {
              await enviarMensagemWhatsApp(
                instanceName,
                targetDestination,
                '⚠️ *Acesso Restrito:* Este comando operacional é restrito à equipe autorizada da loja.'
              );
              return NextResponse.json({ status: 'error', message: 'Acesso negado para comando IA de escrita' }, { status: 200 });
            }
          }
        }

        // Execução real de consulta de estoque pela IA
        if (geminiPlan.action === 'list_estoque') {
          const lojasParaBusca = await obterLojasParaConsulta(lojaId, isGroup);
          const lojaIds = lojasParaBusca.map((l) => l.id);
          const mapLojas = new Map(lojasParaBusca.map((l) => [l.id, l.nome]));
          const modeloBuscado = String(geminiPlan.params.modelo || '').trim();

          const { data: aparelhos } = await supabase
            .from('aparelhos')
            .select('id, loja_id, marca, modelo, capacidade, cor, preco, preco_atacado, precoAtacado, saude_bateria, imei, codigo, status, condicao')
            .in('loja_id', lojaIds)
            .eq('ativo', true)
            .neq('condicao', 'vendido')
            .neq('status', 'vendido');

          let filtrados = aparelhos || [];
          if (modeloBuscado) {
            const modLower = modeloBuscado.toLowerCase();
            filtrados = filtrados.filter((a) => {
              const m = String(a.modelo || '').toLowerCase();
              return m.includes(modLower) || modLower.includes(m);
            });
          }

          if (filtrados.length === 0) {
            const msgSemEstoque = modeloBuscado
              ? `🔍 No momento o *${modeloBuscado}* está esgotado por aqui, mas estamos sempre recebendo novidades! Quer dar uma olhada em outro modelo? 😊`
              : `📋 Não encontramos aparelhos disponíveis em estoque no momento.`;
            await enviarMensagemWhatsApp(instanceName, targetDestination, msgSemEstoque);
            return NextResponse.json({ status: 'ok', message: 'Estoque IA consultado (vazio).' }, { status: 200 });
          }

          if (isGroup) {
            const aparelhosPorLoja = new Map<string, any[]>();
            filtrados.forEach((ap) => {
              const nomeLoja = (mapLojas.get(ap.loja_id) || 'Phone Center').toUpperCase().trim();
              const lista = aparelhosPorLoja.get(nomeLoja) || [];
              lista.push(ap);
              aparelhosPorLoja.set(nomeLoja, lista);
            });

            const blocosLojas: string[] = [];
            aparelhosPorLoja.forEach((itensLoja, nomeLoja) => {
              const linhasLoja: string[] = [];
              linhasLoja.push(`*${nomeLoja}*`);

              itensLoja.slice(0, 6).forEach((a) => {
                const modNorm = normalizarModelo(a.modelo);
                const { emoji, nomeCor } = formatarCorEEmoji(a.cor);
                const cap = a.capacidade && a.capacidade !== 'N/A' ? `${a.capacidade}` : '';
                const batVal = a.saude_bateria || (a as any).saudeBateria;
                const batNum = batVal ? String(batVal).replace(/\D/g, '') : '';
                const bat = batNum ? `(${batNum}%)` : '';
                const modCap = [modNorm, cap].filter(Boolean).join(' ');
                const extras = [nomeCor, bat].filter(Boolean).join(' ');
                const precoValor = a.preco_atacado || (a as any).precoAtacado || a.preco;
                const precoFinal = precoValor ? `- R$ ${Number(precoValor).toFixed(2).replace('.', ',')}` : '';

                linhasLoja.push(`${emoji} ${modCap}${extras ? ` - ${extras}` : ''} ${precoFinal}`.replace(/\s+/g, ' ').trim());
              });

              if (itensLoja.length > 6) {
                linhasLoja.push(`_... e mais ${itensLoja.length - 6} opções_`);
              }

              blocosLojas.push(linhasLoja.join('\n'));
            });

            const msgEstoqueFinal = `📦 *Temos ${filtrados.length} unidade(s) disponível(is)${modeloBuscado ? ` de ${modeloBuscado}` : ''}:*\n\n${blocosLojas.join('\n\n')}`;
            await enviarMensagemWhatsApp(instanceName, targetDestination, msgEstoqueFinal);
            return NextResponse.json({ status: 'ok', message: 'Estoque IA consultado com sucesso.' }, { status: 200 });
          }

          const linhas: string[] = [];
          filtrados.slice(0, 8).forEach((a) => {
            const modNorm = normalizarModelo(a.modelo);
            const { emoji, nomeCor } = formatarCorEEmoji(a.cor);
            const cap = a.capacidade && a.capacidade !== 'N/A' ? `${a.capacidade}` : '';
            const batVal = a.saude_bateria || (a as any).saudeBateria;
            const batNum = batVal ? String(batVal).replace(/\D/g, '') : '';
            const bat = batNum ? `(${batNum}%)` : '';
            const modCap = [modNorm, cap].filter(Boolean).join(' ');
            const extras = [nomeCor, bat].filter(Boolean).join(' ');
            const precoValor = a.preco_atacado || (a as any).precoAtacado || a.preco;
            const precoFinal = precoValor ? `- R$ ${Number(precoValor).toFixed(2).replace('.', ',')}` : '';
            linhas.push(`${emoji} ${modCap}${extras ? ` - ${extras}` : ''} ${precoFinal}`.replace(/\s+/g, ' ').trim());
          });

          const msgEstoqueFinal = `📦 *Temos ${filtrados.length} unidade(s) disponível(is)${modeloBuscado ? ` de ${modeloBuscado}` : ''}:*\n\n${linhas.join('\n')}\n\nQual desses você gostaria de saber mais ou reservar? 😊`;
          await enviarMensagemWhatsApp(instanceName, targetDestination, msgEstoqueFinal);
          return NextResponse.json({ status: 'ok', message: 'Estoque IA consultado com sucesso.' }, { status: 200 });
        }

        // Execução real de venda pela IA
        if (geminiPlan.action === 'create_venda' && lojaId) {
          const valorNum = Number(geminiPlan.params.valor || geminiPlan.params.preco || 0);
          const compradorStr = String(geminiPlan.params.comprador || geminiPlan.params.cliente || 'Consumidor');
          const modeloStr = String(geminiPlan.params.modelo || geminiPlan.params.aparelho || '');
          const imeiStr = geminiPlan.params.imei ? String(geminiPlan.params.imei) : null;
          const formaPag = String(geminiPlan.params.formaPagamento || 'pix');

          let aparelhoId: string | null = null;
          if (imeiStr || modeloStr) {
            let apQuery = supabase.from('aparelhos').select('id, custo, preco').eq('loja_id', lojaId).eq('ativo', true).neq('status', 'vendido');
            if (imeiStr) apQuery = apQuery.eq('imei', imeiStr);
            else apQuery = apQuery.ilike('modelo', `%${modeloStr}%`);
            const { data: apFound } = await apQuery.limit(1).maybeSingle();
            if (apFound) {
              aparelhoId = apFound.id;
              await supabase.from('aparelhos').update({ status: 'vendido', condicao: 'vendido' }).eq('id', apFound.id);
            }
          }

          const { data: novaVenda } = await supabase.from('vendas').insert({
            loja_id: lojaId,
            lojaId: lojaId,
            clienteNome: compradorStr,
            vendedor: `WhatsApp IA (${pushName})`,
            tipoEntrega: 'Varejo',
            valor: valorNum,
            custo: 0,
            lucro: valorNum,
            percentualLucro: 100,
            dataPagamento: new Date().toISOString(),
            status: 'pago',
            metodo: formaPag,
            valorPago: valorNum,
            saldoDevedor: 0,
            descricao: `Venda registrada via WhatsApp IA - ${modeloStr}`,
            garantia: '3 Meses (Garantia Legal)',
            descontoTotal: 0,
            itens: [
              {
                id: Date.now().toString(),
                aparelhoId: aparelhoId,
                descricao: `${modeloStr} - Vendido para ${compradorStr}`,
                quantidade: 1,
                valorInterno: 0,
                valorExibir: valorNum,
                desconto: 0,
              },
            ],
          }).select().single();

          const textResposta = buildWhatsAppText('create_venda', {
            ...geminiPlan.params,
            id: novaVenda?.id || 'Confirmada',
            valor: valorNum,
            modelo: modeloStr,
            comprador: compradorStr,
          }, senderPhone);
          await enviarMensagemWhatsApp(instanceName, targetDestination, textResposta);
          return NextResponse.json({ status: 'ok', message: 'Venda IA registrada no banco.' }, { status: 200 });
        }

        // Execução real de cadastro de aparelho pela IA
        if (geminiPlan.action === 'create_aparelho' && lojaId) {
          const precoNum = Number(geminiPlan.params.preco || 0);
          const modeloStr = String(geminiPlan.params.modelo || 'iPhone');
          const capStr = geminiPlan.params.capacidade ? String(geminiPlan.params.capacidade) : null;
          const corStr = geminiPlan.params.cor ? String(geminiPlan.params.cor) : null;
          const imeiStr = geminiPlan.params.imei ? String(geminiPlan.params.imei) : null;

          const { data: novoAp } = await supabase.from('aparelhos').insert({
            loja_id: lojaId,
            lojaId: lojaId,
            marca: String(geminiPlan.params.marca || 'Apple'),
            modelo: modeloStr,
            capacidade: capStr,
            cor: corStr,
            preco: precoNum,
            imei: imeiStr,
            condicao: String(geminiPlan.params.condicao || 'seminovo'),
            status: 'disponivel',
            ativo: true,
            dataCadastro: new Date().toISOString(),
            observacoes: `Cadastrado via WhatsApp IA (${pushName})`,
          }).select().single();

          const textResposta = buildWhatsAppText('create_aparelho', {
            ...geminiPlan.params,
            id: novoAp?.id || 'Cadastrado',
          }, senderPhone);
          await enviarMensagemWhatsApp(instanceName, targetDestination, textResposta);
          return NextResponse.json({ status: 'ok', message: 'Aparelho IA cadastrado no banco.' }, { status: 200 });
        }

        // Execução real de atualização de preço pela IA
        if (geminiPlan.action === 'update_preco' && lojaId) {
          const novoPrecoNum = Number(geminiPlan.params.novoPreco || geminiPlan.params.preco || 0);
          const aparelhoIdent = String(geminiPlan.params.aparelho || geminiPlan.params.modelo || geminiPlan.params.imei || '');

          if (aparelhoIdent && novoPrecoNum > 0) {
            let upQuery = supabase.from('aparelhos').update({ preco: novoPrecoNum }).eq('loja_id', lojaId);
            if (geminiPlan.params.imei) {
              upQuery = upQuery.eq('imei', String(geminiPlan.params.imei));
            } else {
              upQuery = upQuery.ilike('modelo', `%${aparelhoIdent}%`);
            }
            await upQuery;
          }

          const textResposta = buildWhatsAppText('update_preco', geminiPlan.params, senderPhone);
          await enviarMensagemWhatsApp(instanceName, targetDestination, textResposta);
          return NextResponse.json({ status: 'ok', message: 'Preço IA atualizado.' }, { status: 200 });
        }

        const textResposta = buildWhatsAppText(geminiPlan.action, geminiPlan.params, senderPhone);
        await enviarMensagemWhatsApp(instanceName, targetDestination, textResposta);
        return NextResponse.json({ status: 'ok', message: 'Comando IA executado com alta confiança.' }, { status: 200 });
      }

      // Se confiança for baixa em grupo, ignora silenciosamente para não floodar conversas alheias
      if (isGroup) {
        return NextResponse.json({ status: 'ok', message: 'Mensagem em grupo com baixa relevância ignorada.' }, { status: 200 });
      }
    }

    // ── 14. COPILOTO OPERACIONAL INTELIGENTE DO LOJISTA (PRIVADO) ──
    if (!isGroup) {
      let modelosEstoque: string[] = [];
      let detalhesEstoqueFormatado = '';
      let totalEstoque = 0;
      let totalFiadoEmAberto = 0;
      let totalVendasHoje = 0;

      if (lojaId) {
        // 1. Busca aparelhos detalhados do estoque
        const { data: aps } = await supabase
          .from('aparelhos')
          .select('modelo, capacidade, cor, preco, precoAtacado, saudeBateria, saude_bateria, condicao')
          .eq('loja_id', lojaId)
          .eq('ativo', true)
          .neq('status', 'vendido')
          .limit(30);

        if (aps && aps.length > 0) {
          totalEstoque = aps.length;
          const setModelos = new Set(aps.map((a) => [a.modelo, a.capacidade].filter(Boolean).join(' ')));
          modelosEstoque = Array.from(setModelos);

          detalhesEstoqueFormatado = aps.map((a) => {
            const bat = a.saudeBateria || a.saude_bateria ? ` (Bat: ${a.saudeBateria || a.saude_bateria})` : '';
            const preco = a.preco || a.precoAtacado ? ` - R$ ${(a.preco || a.precoAtacado).toLocaleString('pt-BR')}` : '';
            return `• ${a.modelo} ${a.capacidade || ''} ${a.cor || ''}${bat}${preco}`;
          }).join('\n');
        }

        // 2. Busca total de fiado em aberto
        const { data: devedores } = await supabase
          .from('lojistas_devedores')
          .select('saldo_devedor')
          .eq('loja_id', lojaId)
          .eq('ativo', true);

        if (devedores && devedores.length > 0) {
          totalFiadoEmAberto = devedores.reduce((acc, d) => acc + Number(d.saldo_devedor || 0), 0);
        }

        // 3. Busca faturamento de vendas de hoje
        const hojeInicio = new Date();
        hojeInicio.setHours(0, 0, 0, 0);
        const { data: vendasHoje } = await supabase
          .from('vendas')
          .select('valor')
          .eq('loja_id', lojaId)
          .gte('dataPagamento', hojeInicio.toISOString());

        if (vendasHoje && vendasHoje.length > 0) {
          totalVendasHoje = vendasHoje.reduce((acc, v) => acc + Number(v.valor || 0), 0);
        }
      }

      const respostaConversaIA = await responderConversaNaturalComGemini(textContent, {
        nomeLoja,
        nomeUsuario,
        papelUsuario,
        planoTipo: usuarioResolvido?.planoTipo || 'entrada',
        planoStatus: usuarioResolvido?.planoStatus || 'ativo',
        dataVencimento: usuarioResolvido?.dataVencimento ? formatarDataSegura(usuarioResolvido.dataVencimento) : undefined,
        diasRestantesPlano: usuarioResolvido?.diasRestantes,
        totalEstoque,
        modelosDisponiveis: modelosEstoque,
        detalhesEstoqueFormatado,
        totalFiadoEmAberto,
        totalVendasHoje,
        isGroup: false,
      });

      if (respostaConversaIA) {
        await enviarMensagemWhatsApp(instanceName, targetDestination, respostaConversaIA);
        return NextResponse.json({ status: 'ok', message: 'Resposta do copiloto enviada via IA.' }, { status: 200 });
      }

      // Fallback oficial do Copiloto do Lojista (caso a IA esteja momentaneamente inacessível)
      const fallbackCopiloto = `Olá, *${nomeUsuario}*! Sou o copiloto operacional da *${nomeLoja}* no Phone Center. 📱🤖

Estou à sua disposição para:
📦 *Estoque:* Consultar aparelhos disponíveis, capacidades e valores.
💰 *Vendas:* Registrar vendas e baixas de estoque na hora.
🤝 *Atacado:* Acompanhar fiado, devedores e cobranças.
📋 *Assinatura:* Consultar vencimento e detalhes do seu plano.

Como posso te ajudar agora?`;

      await enviarMensagemWhatsApp(instanceName, targetDestination, fallbackCopiloto);
      return NextResponse.json({ status: 'ok', message: 'Fallback do copiloto enviado.' }, { status: 200 });
    }

    return NextResponse.json({ status: 'ok', message: 'Webhook processado com sucesso.' }, { status: 200 });
  } catch (error: any) {
    console.error('❌ Erro crítico no Webhook Evolution API:', error);
    return NextResponse.json({ error: error?.message || 'Erro interno no servidor.' }, { status: 500 });
  }
}