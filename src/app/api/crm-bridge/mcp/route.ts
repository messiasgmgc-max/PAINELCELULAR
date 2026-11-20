import { NextRequest } from 'next/server';
import {
  autenticarBridge,
  crmBridgeJson,
  crmBridgeOptionsResponse,
  resolverLojaBridge,
} from '@/lib/crm-bridge/auth';
import {
  buscarEstoqueBridge,
  formatarItemEstoqueWhatsapp,
  lookupClienteBridge,
  obterRankingVendasBridge,
  simularPropostaBridge,
} from '@/lib/crm-bridge/queries';

export async function OPTIONS() {
  return crmBridgeOptionsResponse();
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
];

function jsonRpcOk(id: unknown, result: unknown) {
  return crmBridgeJson({ jsonrpc: '2.0', id: id ?? null, result });
}

function jsonRpcError(id: unknown, code: number, message: string, status = 200) {
  return crmBridgeJson({ jsonrpc: '2.0', id: id ?? null, error: { code, message } }, status);
}

/**
 * MCP Server (JSON-RPC 2.0 sobre HTTP) para conectar Agentes de IA do EvoCRM
 * diretamente ao PhoneCenter ERP (estoque vivo, troca, parcelas e garantias).
 */
export async function POST(req: NextRequest) {
  const auth = autenticarBridge(req);
  if (!auth.ok) {
    return jsonRpcError(null, -32001, auth.error || 'Unauthorized', auth.status || 401);
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return jsonRpcError(null, -32700, 'Parse error', 400);
  }

  const id = body.id;
  const method = String(body.method || '');
  const params = (body.params || {}) as Record<string, unknown>;

  if (method === 'initialize') {
    return jsonRpcOk(id, {
      protocolVersion: '2024-11-05',
      capabilities: { tools: {} },
      serverInfo: { name: 'phonecenter-erp-mcp', version: '1.0.0' },
    });
  }

  if (method === 'notifications/initialized' || method === 'ping') {
    return jsonRpcOk(id, {});
  }

  if (method === 'tools/list') {
    return jsonRpcOk(id, { tools: MCP_TOOLS });
  }

  if (method === 'tools/call') {
    const loja = await resolverLojaBridge(req);
    if (!loja) {
      return jsonRpcError(id, -32002, 'Nenhuma loja ativa encontrada no PhoneCenter.');
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
        payload = {
          loja: loja.nome,
          total: itens.length,
          itens: itens.map((it) => ({
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
      } else {
        return jsonRpcError(id, -32601, `Tool desconhecida: ${toolName}`);
      }

      return jsonRpcOk(id, {
        content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }],
      });
    } catch (err) {
      return jsonRpcError(
        id,
        -32000,
        err instanceof Error ? err.message : 'Erro interno ao executar tool MCP.'
      );
    }
  }

  return jsonRpcError(id, -32601, `Método MCP não suportado: ${method}`);
}
