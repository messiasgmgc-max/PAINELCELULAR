import { supabaseAdmin } from '@/integrations/supabase/server';
import {
  calcularAvaliacaoUpgrade,
  MODELOS_UPGRADE_DISPONIVEIS,
} from '@/lib/upgradeEngine';
import { vendaConta } from '@/lib/vendas/situacao';
import { enviarTextoWhatsApp } from '@/lib/whatsappService';
import { obterConfigCrmLoja } from './lojaConfig';
import { formatarBRL } from './queries';

export type TipoRegraPosVenda =
  | 'pos_venda_d0'
  | 'satisfacao_d7'
  | 'upgrade_d90'
  | 'upgrade_d180'
  | 'upgrade_d300'
  | 'garantia_d15'
  | 'aniversario'
  | 'proposta_24h'
  | 'os_status';

export interface RegraPosVenda {
  tipo: TipoRegraPosVenda;
  titulo: string;
  descricao: string;
  ativo: boolean;
  dias_apos: number;
  template_mensagem: string;
  incluir_avaliacao_upgrade: boolean;
}

export interface ElegivelPosVenda {
  regraTipo: TipoRegraPosVenda;
  referenciaId: string;
  clienteNome: string;
  clienteTelefone: string;
  aparelho: string;
  valorAvaliacaoUpgrade?: number;
  mensagem: string;
}

export const REGRAS_POS_VENDA_PADRAO: RegraPosVenda[] = [
  {
    tipo: 'pos_venda_d0',
    titulo: 'Boas-vindas Pós-Compra (Dia 0)',
    descricao: 'Agradecimento + instrução de garantia e acesso rápido ao suporte.',
    ativo: true,
    dias_apos: 0,
    template_mensagem:
      'Olá {{cliente}}! Obrigado por escolher a {{loja}}. Seu {{aparelho}} já está com garantia ativa! Se precisar de película, capinha ou ajuda na transferência de dados, me chama aqui.',
    incluir_avaliacao_upgrade: false,
  },
  {
    tipo: 'satisfacao_d7',
    titulo: 'Check-in + Google Meu Negócio (D+7)',
    descricao: 'Pergunta se está tudo 100% e convida para deixar avaliação 5 estrelas.',
    ativo: true,
    dias_apos: 7,
    template_mensagem:
      'E aí {{cliente}}, tudo certo com seu {{aparelho}} após esses primeiros dias? Se estiver curtindo o atendimento da {{loja}}, sua avaliação ajuda demais: {{link_google}}',
    incluir_avaliacao_upgrade: false,
  },
  {
    tipo: 'upgrade_d90',
    titulo: 'Oferta de Upgrade (90 dias)',
    descricao: 'Mostra quanto o aparelho atual vale hoje na troca por um modelo superior.',
    ativo: false,
    dias_apos: 90,
    template_mensagem:
      'Oi {{cliente}}! Aqui é da {{loja}}. Seu {{aparelho}} está super valorizado hoje (avaliação estimada em {{valor_avaliacao}} na troca!). Quer simular a diferença para um modelo mais novo em até 18x?',
    incluir_avaliacao_upgrade: true,
  },
  {
    tipo: 'upgrade_d180',
    titulo: 'Máquina de Recompra / Upgrade (180 dias)',
    descricao: 'Estimula troca após 6 meses com pré-avaliação automática do iPhone comprado.',
    ativo: true,
    dias_apos: 180,
    template_mensagem:
      'Fala {{cliente}}! Já faz 6 meses que você garantiu seu {{aparelho}} com a gente na {{loja}}. Hoje conseguimos avaliar ele por volta de {{valor_avaliacao}} para você fazer upgrade com parcela leve. Bora simular?',
    incluir_avaliacao_upgrade: true,
  },
  {
    tipo: 'upgrade_d300',
    titulo: 'Renovação Anual VIP (300 dias)',
    descricao: 'Convite VIP pré-vencimento de 1 ano para não perder valor de revenda.',
    ativo: true,
    dias_apos: 300,
    template_mensagem:
      '{{cliente}}, passa rápido né? Seu {{aparelho}} ainda está na janela de ouro de valorização ({{valor_avaliacao}} estimados na troca na {{loja}}). Quer ver o que temos pronto para você dar esse upgrade?',
    incluir_avaliacao_upgrade: true,
  },
  {
    tipo: 'garantia_d15',
    titulo: 'Check-up Pré-Fim da Garantia (15d antes)',
    descricao: 'Avisa antes da garantia expirar e oferece revisão/acessório.',
    ativo: true,
    dias_apos: 15,
    template_mensagem:
      'Oi {{cliente}}! Passando para avisar que a garantia do seu {{aparelho}} na {{loja}} vai até {{data_fim_garantia}}. Se quiser passar para uma revisão preventiva gratuita ou trocar película/bateria, só responder!',
    incluir_avaliacao_upgrade: false,
  },
  {
    tipo: 'aniversario',
    titulo: 'Aniversário do Cliente',
    descricao: 'Mensagem automática no dia do aniversário com condição especial.',
    ativo: true,
    dias_apos: 0,
    template_mensagem:
      'Parabéns {{cliente}}! 🎉 A equipe da {{loja}} deseja um feliz aniversário! Hoje você tem condição VIP em acessórios e bônus especial na troca do seu iPhone.',
    incluir_avaliacao_upgrade: false,
  },
  {
    tipo: 'proposta_24h',
    titulo: 'Follow-up de Proposta Aberta (24h)',
    descricao: 'Retoma clientes que visualizaram a proposta mas ainda não fecharam.',
    ativo: true,
    dias_apos: 1,
    template_mensagem:
      'Oi {{cliente}}, vi que você deu uma olhada na sua proposta da {{loja}} para o {{aparelho}}! Ficou alguma dúvida sobre a troca ou as parcelas? Segue o link caso precise: {{link_proposta}}',
    incluir_avaliacao_upgrade: false,
  },
  {
    tipo: 'os_status',
    titulo: 'Notificação Automática de OS',
    descricao: 'Template padrão usado quando o técnico atualiza o status da Ordem de Serviço.',
    ativo: true,
    dias_apos: 0,
    template_mensagem:
      'Olá {{cliente}}! Atualização da sua OS #{{os_numero}} ({{aparelho}}) na {{loja}}: status alterado para *{{os_status}}*. Qualquer dúvida respondemos por aqui!',
    incluir_avaliacao_upgrade: false,
  },
];

export function renderizarTemplatePosVenda(
  template: string,
  vars: {
    cliente?: string;
    loja?: string;
    aparelho?: string;
    valorAvaliacao?: number;
    linkGoogle?: string;
    linkProposta?: string;
    dataFimGarantia?: string;
    osNumero?: string | number;
    osStatus?: string;
  }
): string {
  const primeiroNome = String(vars.cliente || 'Cliente').trim().split(/\s+/)[0] || 'Cliente';
  const mapa: Record<string, string> = {
    '{{cliente}}': primeiroNome,
    '{{loja}}': String(vars.loja || 'PhoneCenter').trim(),
    '{{aparelho}}': String(vars.aparelho || 'seu aparelho').trim(),
    '{{valor_avaliacao}}': vars.valorAvaliacao ? formatarBRL(vars.valorAvaliacao) : 'ótimo valor',
    '{{link_google}}': String(vars.linkGoogle || '').trim() || '(peça nosso link aqui)',
    '{{link_proposta}}': String(vars.linkProposta || '').trim(),
    '{{data_fim_garantia}}': String(vars.dataFimGarantia || '').trim(),
    '{{os_numero}}': String(vars.osNumero ?? '').trim(),
    '{{os_status}}': String(vars.osStatus || '').trim(),
  };

  let saida = String(template || '');
  for (const [k, v] of Object.entries(mapa)) {
    saida = saida.split(k).join(v);
  }
  return saida.trim();
}

export function estimarAvaliacaoAparelhoTexto(aparelhoDescricao: string): number | undefined {
  const desc = String(aparelhoDescricao || '').trim();
  if (!desc) return undefined;

  // Ordena do nome mais específico para o mais curto para casar "iPhone 15 Pro Max" antes de "iPhone 15"
  const modelosOrdenados = [...MODELOS_UPGRADE_DISPONIVEIS].sort((a, b) => b.length - a.length);
  const descLower = desc.toLowerCase();
  const modeloEncontrado = modelosOrdenados.find((m) => descLower.includes(m.toLowerCase()));
  if (!modeloEncontrado) return undefined;

  const capMatch = desc.match(/\b(64GB|128GB|256GB|512GB|1TB|2TB)\b/i);
  const capacidade = capMatch ? capMatch[1].toUpperCase() : '128GB';

  const aval = calcularAvaliacaoUpgrade(modeloEncontrado, capacidade, {
    bateriaPercentual: 85,
    estadoTela: 'original_impecavel',
    estadoCarcaca: 'impecavel',
    faceIdFunciona: true,
    camerasFuncionam: true,
    temCaixaAcessorios: false,
    conectorCarregadorOk: true,
  });

  return aval.valorFinal > 0 ? aval.valorFinal : undefined;
}

export async function listarRegrasPosVendaLoja(lojaId: string): Promise<{
  regras: RegraPosVenda[];
  migrationPendente: boolean;
}> {
  const { data, error } = await supabaseAdmin
    .from('crm_pos_venda_regras')
    .select('*')
    .eq('loja_id', lojaId);

  if (error) {
    return {
      regras: REGRAS_POS_VENDA_PADRAO,
      migrationPendente: error.message.includes('does not exist'),
    };
  }

  const porTipo = new Map<string, Record<string, unknown>>();
  for (const row of (data || []) as Array<Record<string, unknown>>) {
    porTipo.set(String(row.tipo), row);
  }

  const regras = REGRAS_POS_VENDA_PADRAO.map((padrao) => {
    const salvo = porTipo.get(padrao.tipo);
    if (!salvo) return padrao;
    return {
      ...padrao,
      ativo: Boolean(salvo.ativo),
      dias_apos: salvo.dias_apos != null ? Number(salvo.dias_apos) : padrao.dias_apos,
      template_mensagem: String(salvo.template_mensagem || padrao.template_mensagem),
      incluir_avaliacao_upgrade:
        salvo.incluir_avaliacao_upgrade != null
          ? Boolean(salvo.incluir_avaliacao_upgrade)
          : padrao.incluir_avaliacao_upgrade,
    };
  });

  return { regras, migrationPendente: false };
}

function chaveDisparo(regraTipo: string, refId: string): string {
  return `${regraTipo}::${refId}`;
}

function matchDiasJanela(dataIso: string, diasAlvo: number, toleranciaDias = 3): boolean {
  const ts = Date.parse(dataIso);
  if (!Number.isFinite(ts)) return false;
  const diffDias = (Date.now() - ts) / (86400 * 1000);
  if (diasAlvo === 0) return diffDias >= 0 && diffDias <= 1.5;
  return diffDias >= diasAlvo && diffDias <= diasAlvo + toleranciaDias;
}

export async function identificarElegiveisPosVenda(
  lojaId: string,
  nomeLoja: string,
  opts: { regraTipo?: string } = {}
): Promise<ElegivelPosVenda[]> {
  const [{ config }, { regras }, vendasRes, clientesRes, garantiasRes, propostasRes, disparosRes] =
    await Promise.all([
      obterConfigCrmLoja(lojaId),
      listarRegrasPosVendaLoja(lojaId),
      supabaseAdmin
        .from('vendas')
        .select('id, "clienteId", "clienteNome", "aparelhoDescricao", "dataPagamento", status, ativo')
        .eq('loja_id', lojaId)
        .eq('ativo', true)
        .order('dataPagamento', { ascending: false })
        .limit(500),
      supabaseAdmin
        .from('clientes')
        .select('id, nome, telefone, data_nascimento')
        .eq('loja_id', lojaId)
        .eq('ativo', true)
        .limit(1000),
      supabaseAdmin
        .from('garantias')
        .select('id, "clienteNome", "aparelhoModelo", "dataFim", status, ativo')
        .eq('loja_id', lojaId)
        .eq('ativo', true)
        .limit(300),
      supabaseAdmin
        .from('crm_propostas')
        .select('id, protocolo, token_publico, cliente_nome, cliente_telefone, modelo_novo, status, created_at')
        .eq('loja_id', lojaId)
        .in('status', ['enviada', 'visualizada'])
        .order('created_at', { ascending: false })
        .limit(100),
      supabaseAdmin
        .from('crm_pos_venda_disparos')
        .select('regra_tipo, referencia_id')
        .eq('loja_id', lojaId)
        .limit(2000),
    ]);

  const jaDisparados = new Set<string>();
  for (const d of (disparosRes.data || []) as Array<Record<string, unknown>>) {
    jaDisparados.add(chaveDisparo(String(d.regra_tipo), String(d.referencia_id)));
  }

  const telPorClienteId = new Map<string, string>();
  const telPorNome = new Map<string, string>();
  const clientesLista = (clientesRes.data || []) as Array<Record<string, unknown>>;
  for (const c of clientesLista) {
    const tel = String(c.telefone || '').trim();
    if (tel.replace(/\D/g, '').length >= 10) {
      telPorClienteId.set(String(c.id), tel);
      telPorNome.set(String(c.nome || '').trim().toLowerCase(), tel);
    }
  }

  const ativas = regras.filter(
    (r) => r.ativo && (!opts.regraTipo || r.tipo === opts.regraTipo) && r.tipo !== 'os_status'
  );
  const elegiveis: ElegivelPosVenda[] = [];
  const vendas = ((vendasRes.data || []) as Array<Record<string, unknown>>).filter((v) =>
    vendaConta({ status: v.status })
  );

  // 1. Réguas baseadas em vendas (D0, D7, Upgrade D90/180/300)
  for (const regra of ativas) {
    if (
      ['pos_venda_d0', 'satisfacao_d7', 'upgrade_d90', 'upgrade_d180', 'upgrade_d300'].includes(
        regra.tipo
      )
    ) {
      for (const v of vendas) {
        const refId = String(v.id);
        if (jaDisparados.has(chaveDisparo(regra.tipo, refId))) continue;
        if (!matchDiasJanela(String(v.dataPagamento || ''), regra.dias_apos)) continue;

        const nome = String(v.clienteNome || '').trim();
        const tel =
          telPorClienteId.get(String(v.clienteId || '')) ||
          telPorNome.get(nome.toLowerCase()) ||
          '';
        if (tel.replace(/\D/g, '').length < 10) continue;

        const aparelho = String(v.aparelhoDescricao || 'seu aparelho');
        const valUpgrade = regra.incluir_avaliacao_upgrade
          ? estimarAvaliacaoAparelhoTexto(aparelho)
          : undefined;

        elegiveis.push({
          regraTipo: regra.tipo,
          referenciaId: refId,
          clienteNome: nome || 'Cliente',
          clienteTelefone: tel,
          aparelho,
          valorAvaliacaoUpgrade: valUpgrade,
          mensagem: renderizarTemplatePosVenda(regra.template_mensagem, {
            cliente: nome,
            loja: nomeLoja,
            aparelho,
            valorAvaliacao: valUpgrade,
            linkGoogle: config.google_review_url,
          }),
        });
      }
    }

    // 2. Garantia vencendo nos próximos X dias
    if (regra.tipo === 'garantia_d15') {
      const agora = Date.now();
      const limiteMs = agora + Math.max(1, regra.dias_apos) * 86400 * 1000;
      for (const g of (garantiasRes.data || []) as Array<Record<string, unknown>>) {
        const refId = String(g.id);
        if (jaDisparados.has(chaveDisparo(regra.tipo, refId))) continue;
        const fimTs = Date.parse(String(g.dataFim || ''));
        if (!Number.isFinite(fimTs) || fimTs < agora || fimTs > limiteMs) continue;
        const nome = String(g.clienteNome || '').trim();
        const tel = telPorNome.get(nome.toLowerCase()) || '';
        if (tel.replace(/\D/g, '').length < 10) continue;

        elegiveis.push({
          regraTipo: regra.tipo,
          referenciaId: refId,
          clienteNome: nome || 'Cliente',
          clienteTelefone: tel,
          aparelho: String(g.aparelhoModelo || 'Aparelho'),
          mensagem: renderizarTemplatePosVenda(regra.template_mensagem, {
            cliente: nome,
            loja: nomeLoja,
            aparelho: String(g.aparelhoModelo || 'Aparelho'),
            dataFimGarantia: new Date(fimTs).toLocaleDateString('pt-BR'),
          }),
        });
      }
    }

    // 3. Aniversário do cliente (hoje)
    if (regra.tipo === 'aniversario') {
      const hoje = new Date();
      const mesHoje = hoje.getMonth() + 1;
      const diaHoje = hoje.getDate();
      const anoHoje = hoje.getFullYear();
      for (const c of clientesLista) {
        const nasc = String(c.data_nascimento || '').trim();
        const tel = String(c.telefone || '').trim();
        if (!nasc || tel.replace(/\D/g, '').length < 10) continue;
        const m = nasc.match(/(\d{4})-(\d{2})-(\d{2})/);
        if (!m) continue;
        if (Number(m[2]) !== mesHoje || Number(m[3]) !== diaHoje) continue;

        const refId = `${c.id}_${anoHoje}`;
        if (jaDisparados.has(chaveDisparo(regra.tipo, refId))) continue;

        elegiveis.push({
          regraTipo: regra.tipo,
          referenciaId: refId,
          clienteNome: String(c.nome || 'Cliente'),
          clienteTelefone: tel,
          aparelho: 'seu aparelho',
          mensagem: renderizarTemplatePosVenda(regra.template_mensagem, {
            cliente: String(c.nome || 'Cliente'),
            loja: nomeLoja,
          }),
        });
      }
    }

    // 4. Follow-up de proposta aberta (24h+)
    if (regra.tipo === 'proposta_24h') {
      const limiteHoras = Math.max(1, regra.dias_apos) * 24;
      for (const p of (propostasRes.data || []) as Array<Record<string, unknown>>) {
        const refId = String(p.id);
        if (jaDisparados.has(chaveDisparo(regra.tipo, refId))) continue;
        const tel = String(p.cliente_telefone || '').trim();
        if (tel.replace(/\D/g, '').length < 10) continue;
        const idadeHoras = (Date.now() - Date.parse(String(p.created_at || ''))) / 3600_000;
        if (!Number.isFinite(idadeHoras) || idadeHoras < limiteHoras || idadeHoras > 168) continue;

        const appUrl = (process.env.NEXT_PUBLIC_APP_URL || 'https://app.phonecenter.tech').replace(
          /\/+$/,
          ''
        );
        elegiveis.push({
          regraTipo: regra.tipo,
          referenciaId: refId,
          clienteNome: String(p.cliente_nome || 'Cliente'),
          clienteTelefone: tel,
          aparelho: String(p.modelo_novo || 'Aparelho'),
          mensagem: renderizarTemplatePosVenda(regra.template_mensagem, {
            cliente: String(p.cliente_nome || 'Cliente'),
            loja: nomeLoja,
            aparelho: String(p.modelo_novo || 'Aparelho'),
            linkProposta: `${appUrl}/proposta/${encodeURIComponent(String(p.token_publico || ''))}`,
          }),
        });
      }
    }
  }

  return elegiveis;
}

export async function executarPosVendaLoja(
  lojaId: string,
  nomeLoja: string,
  opts: { dryRun?: boolean; limit?: number; regraTipo?: string } = {}
) {
  const limit = Math.min(Math.max(Number(opts.limit) || 20, 1), 100);
  const elegiveis = await identificarElegiveisPosVenda(lojaId, nomeLoja, {
    regraTipo: opts.regraTipo,
  });

  if (opts.dryRun) {
    return {
      totalElegiveis: elegiveis.length,
      enviados: 0,
      erros: 0,
      detalhes: elegiveis.slice(0, limit),
    };
  }

  let enviados = 0;
  let erros = 0;
  const detalhes: Array<Record<string, unknown>> = [];

  for (const item of elegiveis.slice(0, limit)) {
    const resWa = await enviarTextoWhatsApp({
      lojaId,
      telefone: item.clienteTelefone,
      texto: item.mensagem,
    });

    const status = resWa.success ? 'enviado' : 'erro';
    if (resWa.success) enviados += 1;
    else erros += 1;

    await supabaseAdmin
      .from('crm_pos_venda_disparos')
      .upsert(
        {
          loja_id: lojaId,
          regra_tipo: item.regraTipo,
          referencia_id: item.referenciaId,
          cliente_nome: item.clienteNome,
          cliente_telefone: item.clienteTelefone,
          mensagem: item.mensagem,
          status,
          erro: resWa.error || '',
          enviado_em: new Date().toISOString(),
        },
        { onConflict: 'loja_id,regra_tipo,referencia_id' }
      );

    detalhes.push({ ...item, status, erro: resWa.error || null });
  }

  return {
    totalElegiveis: elegiveis.length,
    enviados,
    erros,
    detalhes,
  };
}
