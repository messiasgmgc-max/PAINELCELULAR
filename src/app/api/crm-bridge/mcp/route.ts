import { NextRequest } from 'next/server';
import { supabaseAdmin } from '@/integrations/supabase/server';
import {
  autenticarBridgeAvancado,
  crmBridgeJson,
  crmBridgeOptionsResponse,
  resolverLojaAutorizada,
} from '@/lib/crm-bridge/auth';
import { criarPropostaBridge } from '@/lib/crm-bridge/fase5';
import { criarReservaPixBridge } from '@/lib/crm-bridge/fase6';
import {
  buscarEstoqueBridge,
  formatarItemEstoqueWhatsapp,
  lookupClienteBridge,
  obterRankingVendasBridge,
  simularPropostaBridge,
} from '@/lib/crm-bridge/queries';
import {
  RegraRodizio,
  selecionarProximoAgenteRodizio,
} from '@/lib/crm-bridge/rodizio';

export async function OPTIONS(req: NextRequest) {
  return crmBridgeOptionsResponse(req);
}

const MCP_TOOLS = [
  {
    name: 'consultar_estoque',
    description:
      'Consulta aparelhos disponíveis em tempo real no estoque da loja PhoneCenter (aceita atalhos como "15pm", "16 pro", cor, capacidade e preço máximo).',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Modelo, cor ou capacidade buscada (ex: "iPhone 15 Pro Max 256GB natural").',
        },
        condicao: {
          type: 'string',
          enum: ['novo', 'seminovo', 'usado'],
          description: 'Filtra por condição do aparelho.',
        },
        max_preco: {
          type: 'number',
          description: 'Preço máximo à vista em reais (BRL).',
        },
        limit: {
          type: 'number',
          description: 'Quantidade máxima de itens (padrão 10).',
        },
      },
    },
  },
  {
    name: 'simular_troca_e_parcelas',
    description:
      'Avalia um iPhone usado na troca e calcula o saldo restante + parcelamento real com as taxas da maquininha da loja, gerando orçamento pronto para enviar no WhatsApp.',
    inputSchema: {
      type: 'object',
      required: ['valor_aparelho'],
      properties: {
        modelo_novo: { type: 'string', description: 'Nome do aparelho desejado pelo cliente.' },
        valor_aparelho: { type: 'number', description: 'Preço à vista do aparelho desejado (BRL).' },
        entrada_pix: { type: 'number', description: 'Entrada em dinheiro/Pix (opcional).' },
        valor_troca_manual: { type: 'number', description: 'Valor manual de troca se já combinado.' },
        troca_modelo: { type: 'string', description: 'Modelo do iPhone usado na troca (ex: "iPhone 13").' },
        troca_capacidade: { type: 'string', description: 'Capacidade do usado (ex: "128GB").' },
        troca_bateria: { type: 'number', description: 'Saúde da bateria % (ex: 86).' },
        troca_tela: {
          type: 'string',
          enum: ['original_impecavel', 'riscos_leves', 'trocada_compativel', 'trincada_quebrada'],
        },
        troca_carcaca: {
          type: 'string',
          enum: ['impecavel', 'marcas_leves', 'amassados_arranhaos', 'trincada_quebrada'],
        },
        troca_face_id: { type: 'boolean' },
      },
    },
  },
  {
    name: 'consultar_cliente_garantia',
    description:
      'Consulta cadastro do cliente, histórico de compras, garantias ativas e ordens de serviço (OS) no PhoneCenter ERP por telefone, CPF ou nome.',
    inputSchema: {
      type: 'object',
      properties: {
        telefone: { type: 'string', description: 'Telefone/WhatsApp do cliente.' },
        cpf: { type: 'string', description: 'CPF do cliente.' },
        nome: { type: 'string', description: 'Nome do cliente.' },
      },
    },
  },
  {
    name: 'resumo_ranking_vendas',
    description:
      'Retorna resumo de vendas, faturamento, top modelos e ranking por vendedor do PhoneCenter ERP para o período informado.',
    inputSchema: {
      type: 'object',
      properties: {
        dias: { type: 'number', description: 'Período em dias (padrão 30).' },
      },
    },
  },
  {
    name: 'gerar_proposta_oficial',
    description:
      'Gera uma proposta comercial oficial salva no banco com link público para o cliente visualizar parcelas e confirmar o aceite.',
    inputSchema: {
      type: 'object',
      required: ['modelo_novo', 'valor_aparelho'],
      properties: {
        cliente_nome: { type: 'string', description: 'Nome do cliente.' },
        cliente_telefone: { type: 'string', description: 'WhatsApp/telefone do cliente.' },
        modelo_novo: { type: 'string', description: 'Modelo desejado.' },
        valor_aparelho: { type: 'number', description: 'Valor à vista do aparelho (BRL).' },
        entrada_pix: { type: 'number', description: 'Entrada Pix (BRL).' },
        troca_modelo: { type: 'string', description: 'Modelo do iPhone usado na troca.' },
        troca_capacidade: { type: 'string', description: 'Capacidade do usado.' },
      },
    },
  },
  {
    name: 'gerar_pix_reserva',
    description:
      'Gera cobrança de sinal de reserva Pix (Copia e Cola / link Mercado Pago ou Asaas) quando o cliente pedir para segurar ou reservar o aparelho.',
    inputSchema: {
      type: 'object',
      required: ['aparelho_modelo', 'valor_sinal'],
      properties: {
        aparelho_id: { type: 'string', description: 'UUID do aparelho no estoque (se conhecido).' },
        aparelho_modelo: { type: 'string', description: 'Nome/capacidade/cor do aparelho.' },
        valor_sinal: { type: 'number', description: 'Valor do sinal de reserva em BRL (ex: 200).' },
        cliente_nome: { type: 'string', description: 'Nome do cliente.' },
        cliente_telefone: { type: 'string', description: 'Telefone do cliente.' },
      },
    },
  },
  {
    name: 'agendar_visita_loja',
    description:
      'Agenda visita presencial na loja, retirada de aparelho ou avaliação presencial de troca no sistema PhoneCenter ERP.',
    inputSchema: {
      type: 'object',
      required: ['cliente_nome', 'data_hora'],
      properties: {
        cliente_nome: { type: 'string', description: 'Nome do cliente.' },
        telefone: { type: 'string', description: 'WhatsApp do cliente.' },
        data_hora: { type: 'string', description: 'Data e hora ISO ou DD/MM/AAAA HH:MM.' },
        interesse: { type: 'string', description: 'Ex: Retirar iPhone 15 Pro / Avaliar troca.' },
      },
    },
  },
  {
    name: 'transferir_para_vendedor',
    description:
      'Transfere o atendimento para um vendedor humano usando o rodízio do setor e registra o resumo estruturado no chat interno da equipe.',
    inputSchema: {
      type: 'object',
      required: ['resumo_atendimento'],
      properties: {
        setor: {
          type: 'string',
          description: 'Setor destino (Vendas, Troca/Upgrade, Assistência/Garantia, Atacado, Financeiro).',
        },
        cliente_nome: { type: 'string' },
        telefone: { type: 'string' },
        resumo_atendimento: { type: 'string', description: 'Resumo objetivo do que o cliente quer.' },
      },
    },
  },
];

function jsonRpcOk(id: unknown, result: unknown, req: NextRequest) {
  return crmBridgeJson({ jsonrpc: '2.0', id: id ?? null, result }, 200, req);
}

function jsonRpcError(
  id: unknown,
  code: number,
  message: string,
  req: NextRequest,
  status = 200
) {
  return crmBridgeJson({ jsonrpc: '2.0', id: id ?? null, error: { code, message } }, status, req);
}

function parseDataAgendamento(raw: string): string {
  const s = String(raw || '').trim();
  const iso = new Date(s);
  if (!Number.isNaN(iso.getTime())) return iso.toISOString();
  const m = s.match(/^(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?(?:\s+(\d{1,2}):(\d{2}))?/);
  if (m) {
    const ano = m[3]
      ? Number(m[3].length === 2 ? `20${m[3]}` : m[3])
      : new Date().getFullYear();
    const d = new Date(ano, Number(m[2]) - 1, Number(m[1]), Number(m[4] || 14), Number(m[5] || 0));
    if (!Number.isNaN(d.getTime())) return d.toISOString();
  }
  return new Date(Date.now() + 24 * 3600 * 1000).toISOString();
}

/**
 * MCP Server (JSON-RPC 2.0 sobre HTTP) para conectar Agentes de IA do EvoCRM
 * diretamente ao PhoneCenter ERP (8 tools: consulta + ação real de vendas).
 */
export async function POST(req: NextRequest) {
  const auth = await autenticarBridgeAvancado(req);
  if (!auth.ok) {
    return jsonRpcError(null, -32001, auth.error || 'Unauthorized', req, auth.status || 401);
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return jsonRpcError(null, -32700, 'Parse error', req, 400);
  }

  const id = body.id;
  const method = String(body.method || '');
  const params = (body.params || {}) as Record<string, unknown>;

  if (method === 'initialize') {
    return jsonRpcOk(
      id,
      {
        protocolVersion: '2024-11-05',
        capabilities: { tools: {} },
        serverInfo: { name: 'phonecenter-erp-mcp', version: '2.0.0' },
      },
      req
    );
  }

  if (method === 'notifications/initialized' || method === 'ping') {
    return jsonRpcOk(id, {}, req);
  }

  if (method === 'tools/list') {
    return jsonRpcOk(id, { tools: MCP_TOOLS }, req);
  }

  if (method === 'tools/call') {
    const loja = await resolverLojaAutorizada(req, auth);
    if (!loja) {
      return jsonRpcError(id, -32002, 'Nenhuma loja ativa encontrada no PhoneCenter.', req);
    }

    const toolName = String(params.name || '');
    const args = (params.arguments || {}) as Record<string, unknown>;

    try {
      let payload: unknown;

      if (toolName === 'consultar_estoque') {
        const itens = await buscarEstoqueBridge(loja.id, {
          q: args.query ? String(args.query) : '',
          condicao: args.condicao ? String(args.condicao) : undefined,
          maxPreco: args.max_preco != null ? Number(args.max_preco) : undefined,
          limit: args.limit != null ? Number(args.limit) : 10,
        });
        const disponiveis = itens.filter((it) => !it.reservado);
        payload = {
          loja: loja.nome,
          total: disponiveis.length,
          itens: disponiveis.map((it) => ({
            ...it,
            textoWhatsapp: formatarItemEstoqueWhatsapp(it, loja.nome),
          })),
        };
      } else if (toolName === 'simular_troca_e_parcelas') {
        payload = await simularPropostaBridge(loja.id, {
          nomeLoja: loja.nome,
          modeloNovo: args.modelo_novo ? String(args.modelo_novo) : undefined,
          valorAparelho: Number(args.valor_aparelho || 0),
          entradaPix: args.entrada_pix != null ? Number(args.entrada_pix) : 0,
          valorTrocaManual:
            args.valor_troca_manual != null ? Number(args.valor_troca_manual) : undefined,
          troca: args.troca_modelo
            ? {
                modelo: String(args.troca_modelo),
                capacidade: String(args.troca_capacidade || '128GB'),
                condicoes: {
                  bateriaPercentual:
                    args.troca_bateria != null ? Number(args.troca_bateria) : 86,
                  estadoTela: (args.troca_tela as 'original_impecavel') || 'original_impecavel',
                  estadoCarcaca: (args.troca_carcaca as 'impecavel') || 'impecavel',
                  faceIdFunciona: args.troca_face_id !== false,
                },
              }
            : undefined,
        });
      } else if (toolName === 'consultar_cliente_garantia') {
        payload = await lookupClienteBridge(loja.id, {
          telefone: args.telefone ? String(args.telefone) : undefined,
          cpf: args.cpf ? String(args.cpf) : undefined,
          nome: args.nome ? String(args.nome) : undefined,
        });
      } else if (toolName === 'resumo_ranking_vendas') {
        payload = await obterRankingVendasBridge(
          loja.id,
          args.dias != null ? Number(args.dias) : 30
        );
      } else if (toolName === 'gerar_proposta_oficial') {
        const resProp = await criarPropostaBridge(loja.id, loja.nome, {
          clienteNome: args.cliente_nome ? String(args.cliente_nome) : 'Cliente',
          clienteTelefone: args.cliente_telefone ? String(args.cliente_telefone) : '',
          vendedorNome: 'Assistente IA',
          modeloNovo: String(args.modelo_novo || 'iPhone'),
          valorAparelho: Number(args.valor_aparelho || 0),
          entradaPix: args.entrada_pix != null ? Number(args.entrada_pix) : 0,
          origin: req.nextUrl.origin,
          troca: args.troca_modelo
            ? {
                modelo: String(args.troca_modelo),
                capacidade: String(args.troca_capacidade || '128GB'),
              }
            : undefined,
        });
        payload = {
          protocolo: resProp.proposta.protocolo,
          urlPublica: resProp.urlPublica,
          textoWhatsapp: resProp.proposta.texto_whatsapp,
        };
      } else if (toolName === 'gerar_pix_reserva') {
        payload = await criarReservaPixBridge(loja.id, loja.nome, {
          aparelhoId: args.aparelho_id ? String(args.aparelho_id) : undefined,
          aparelhoModelo: String(args.aparelho_modelo || 'Aparelho'),
          valorSinal: Number(args.valor_sinal || 200),
          clienteNome: args.cliente_nome ? String(args.cliente_nome) : 'Cliente',
          clienteTelefone: args.cliente_telefone ? String(args.cliente_telefone) : '',
        });
      } else if (toolName === 'agendar_visita_loja') {
        const dataIso = parseDataAgendamento(String(args.data_hora || ''));
        const { data: ag, error: agErr } = await supabaseAdmin
          .from('agendamentos')
          .insert({
            loja_id: loja.id,
            clienteNome: String(args.cliente_nome || 'Cliente'),
            telefone: String(args.telefone || ''),
            data: dataIso,
            descricao: String(args.interesse || 'Visita / Avaliação na Loja'),
            status: 'agendado',
            observacoes: 'Agendado automaticamente pela IA PhoneCenterCRM (MCP)',
            dataCadastro: new Date().toISOString(),
            ativo: true,
          })
          .select('id, "clienteNome", data, descricao, status')
          .single();
        if (agErr) throw new Error(agErr.message);
        payload = { agendado: true, agendamento: ag };
      } else if (toolName === 'transferir_para_vendedor') {
        const setor = String(args.setor || 'Vendas').trim();
        const resumo = String(args.resumo_atendimento || '').trim();
        const clienteNome = String(args.cliente_nome || 'Cliente').trim();
        const telefone = String(args.telefone || '').trim();

        let vendedorEscalado: string | null = null;
        try {
          const { data: regraDb } = await supabaseAdmin
            .from('crm_rodizio_regras')
            .select('*')
            .eq('loja_id', loja.id)
            .ilike('setor', setor)
            .maybeSingle();

          if (regraDb) {
            const sel = selecionarProximoAgenteRodizio(regraDb as unknown as RegraRodizio);
            if (sel.agenteSelecionado) {
              vendedorEscalado = sel.agenteSelecionado;
              await supabaseAdmin
                .from('crm_rodizio_regras')
                .update({ ultimo_indice: sel.proximoIndice, updated_at: new Date().toISOString() })
                .eq('id', regraDb.id);
            }
          }
        } catch {
          // Segue sem rodízio caso migration pendente
        }

        try {
          await supabaseAdmin.from('crm_chat_interno').insert({
            loja_id: loja.id,
            canal: 'vendas',
            autor_nome: 'IA Handover',
            autor_cargo: 'bot',
            mensagem: `🤝 Transferência (${setor})${vendedorEscalado ? ` → @${vendedorEscalado}` : ''}\n👤 ${clienteNome}${telefone ? ` (${telefone})` : ''}\n📋 ${resumo}`,
          });
        } catch {
          // não bloqueia
        }

        payload = {
          transferido: true,
          setor,
          vendedorEscalado,
          mensagemConfirmacao: vendedorEscalado
            ? `Atendimento direcionado para ${vendedorEscalado} (${setor}).`
            : `Atendimento registrado para a equipe de ${setor}.`,
        };
      } else {
        return jsonRpcError(id, -32601, `Tool desconhecida: ${toolName}`, req);
      }

      return jsonRpcOk(
        id,
        {
          content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }],
        },
        req
      );
    } catch (err) {
      return jsonRpcError(
        id,
        -32000,
        err instanceof Error ? err.message : 'Erro interno ao executar tool MCP.',
        req
      );
    }
  }

  return jsonRpcError(id, -32601, `Método MCP não suportado: ${method}`, req);
}
