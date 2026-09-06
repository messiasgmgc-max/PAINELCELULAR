/**
 * Serviço de Negócio Fiscal para Phone Center (SaaS Multi-tenant)
 * Mapeia vendas para payloads SEFAZ da Focus NFe, executa emissões assíncronas,
 * persiste notas no Supabase e garante resiliência total contra quedas ou falta de configuração.
 */

import { supabaseAdmin } from '@/integrations/supabase/server';
import { FocusNFeClient } from './focusNfeClient';
import { DadosFiscaisLoja, NotaFiscalRecord, RequisicaoEmissao, RespostaEmissao, StatusNotaFiscal, TipoNotaFiscal } from './types';

// Mapeador de formas de pagamento do Phone Center para a tabela da SEFAZ
export function mapearFormaPagamentoSEFAZ(metodoRaw: string = ''): string {
  const m = metodoRaw.toLowerCase().trim();
  if (m.includes('pix')) return '17'; // PIX
  if (m.includes('dinheiro')) return '01'; // Dinheiro
  if (m.includes('debito') || m.includes('débito')) return '04'; // Cartão de Débito
  if (m.includes('credito') || m.includes('crédito') || m.includes('cartao') || m.includes('cartão')) return '03'; // Cartão de Crédito
  if (m.includes('boleto')) return '15'; // Boleto Bancário
  if (m.includes('fiado') || m.includes('crediario')) return '05'; // Crédito Loja
  if (m.includes('trade_in') || m.includes('troca') || m.includes('permuta')) return '99'; // Outros
  return '99'; // Outros
}

// Limpa caracteres não numéricos (CPF, CNPJ, Telefone, CEP)
export function apenasNumeros(str: string = ''): string {
  return str.replace(/\D/g, '');
}

/**
 * Busca as configurações fiscais ativas da loja
 */
export async function obterDadosFiscaisLoja(lojaId: string): Promise<DadosFiscaisLoja | null> {
  try {
    const { data: loja, error } = await supabaseAdmin
      .from('lojas')
      .select('id, nome, cnpj, email, telefone, endereco, dados_fiscais')
      .eq('id', lojaId)
      .maybeSingle();

    if (error || !loja) return null;

    const dados = (loja.dados_fiscais || {}) as Partial<DadosFiscaisLoja>;
    
    // Se não tiver cnpj no dados_fiscais, faz fallback pro cnpj da tabela lojas
    return {
      ativo: dados.ativo ?? false,
      focus_token: dados.focus_token,
      ambiente: dados.ambiente || 'homologacao',
      cnpj: dados.cnpj || loja.cnpj || '',
      inscricao_estadual: dados.inscricao_estadual || '',
      razao_social: dados.razao_social || loja.nome || 'Phone Center',
      nome_fantasia: dados.nome_fantasia || loja.nome || 'Phone Center',
      regime_tributario: dados.regime_tributario || '1',
      id_csc: dados.id_csc || '',
      csc: dados.csc || '',
      serie_nfce: dados.serie_nfce || '1',
      numero_nfce_atual: dados.numero_nfce_atual || 1,
      serie_nfe: dados.serie_nfe || '1',
      numero_nfe_atual: dados.numero_nfe_atual || 1,
      cfop_padrao_nfce: dados.cfop_padrao_nfce || '5102',
      cfop_padrao_nfe: dados.cfop_padrao_nfe || '5102',
      ncm_padrao_smartphones: dados.ncm_padrao_smartphones || '8517.13.00',
      ncm_padrao_acessorios: dados.ncm_padrao_acessorios || '8517.79.00',
      emitir_automatico_pdv: dados.emitir_automatico_pdv ?? false,
      enviar_danfe_email_cliente: dados.enviar_danfe_email_cliente ?? true,
      certificado_nome: dados.certificado_nome,
      certificado_vencimento: dados.certificado_vencimento,
      certificado_enviado: dados.certificado_enviado ?? false
    };
  } catch (err) {
    console.error('Erro ao buscar dados fiscais da loja:', err);
    return null;
  }
}

/**
 * Salva ou atualiza uma nota fiscal na tabela notas_fiscais
 */
export async function salvarRegistroNotaFiscal(nota: Partial<NotaFiscalRecord>): Promise<NotaFiscalRecord | null> {
  try {
    // Tenta atualizar se já existir por venda_id e tipo
    if (nota.venda_id && nota.tipo) {
      const { data: existente } = await supabaseAdmin
        .from('notas_fiscais')
        .select('id, tentativas')
        .eq('venda_id', String(nota.venda_id))
        .eq('tipo', nota.tipo)
        .maybeSingle();

      if (existente?.id) {
        const { data: atualizada, error } = await supabaseAdmin
          .from('notas_fiscais')
          .update({
            ...nota,
            tentativas: (existente.tentativas || 0) + 1,
            updated_at: new Date().toISOString()
          })
          .eq('id', existente.id)
          .select()
          .single();

        if (!error && atualizada) return atualizada as NotaFiscalRecord;
      }
    }

    // Se não existia, insere novo registro
    const { data: inserida, error: errInsert } = await supabaseAdmin
      .from('notas_fiscais')
      .insert([{
        ...nota,
        tentativas: 1,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }])
      .select()
      .single();

    if (errInsert) {
      console.warn('Aviso: Tabela notas_fiscais ainda não criada ou erro de inserção:', errInsert.message);
      return null;
    }

    return inserida as NotaFiscalRecord;
  } catch (e: any) {
    console.warn('Erro ao salvar registro de nota fiscal:', e?.message || e);
    return null;
  }
}

/**
 * Monta o payload no formato Focus NFe v2 para NFC-e (modelo 65)
 */
export function montarPayloadNFCe(
  venda: any,
  cliente: any,
  dadosFiscais: DadosFiscaisLoja
): any {
  const agoraIso = new Date().toISOString();
  const itensVenda = Array.isArray(venda.itens) ? venda.itens : [];

  const itensFormatados = itensVenda.map((item: any, index: number) => {
    const qtd = Number(item.quantidade) || 1;
    const valorUnitario = Number(item.valorExibir || item.valor || item.preco || 0);
    const descontoItem = Number(item.desconto || 0);
    const valorTotalItem = Math.max(0, (valorUnitario * qtd) - descontoItem);

    const descLower = String(item.descricao || item.modelo || '').toLowerCase();
    const isAcessorio = descLower.includes('capa') || descLower.includes('pelicula') || descLower.includes('película') || descLower.includes('fone') || descLower.includes('cabo') || descLower.includes('fonte') || descLower.includes('carregador');

    const codigoNcm = apenasNumeros(isAcessorio ? dadosFiscais.ncm_padrao_acessorios : dadosFiscais.ncm_padrao_smartphones) || '85171300';
    const cfop = apenasNumeros(dadosFiscais.cfop_padrao_nfce) || '5102';

    return {
      numero_item: index + 1,
      codigo_produto: String(item.aparelhoId || item.id || `PROD-${index + 1}`),
      descricao: String(item.descricao || item.modelo || 'Produto de Informática/Eletrônico').slice(0, 120),
      codigo_ncm: codigoNcm,
      quantidade_comercial: qtd,
      quantidade_tributavel: qtd,
      valor_unitario_comercial: valorUnitario.toFixed(2),
      valor_unitario_tributavel: valorUnitario.toFixed(2),
      valor_bruto: (valorUnitario * qtd).toFixed(2),
      valor_desconto: descontoItem > 0 ? descontoItem.toFixed(2) : undefined,
      unidade_comercial: 'UN',
      unidade_tributavel: 'UN',
      cfop: cfop,
      icms_origem: '0', // Nacional
      icms_situacao_tributaria: dadosFiscais.regime_tributario === '1' ? '102' : '00' // Simples Nacional Sem Permissão de Crédito
    };
  });

  // Formas de pagamento
  const pagamentosLista = Array.isArray(venda.pagamentos) && venda.pagamentos.length > 0
    ? venda.pagamentos
    : [{ metodo: venda.metodo || 'dinheiro', valor: Number(venda.valor || 0) }];

  const formasPagamento = pagamentosLista.map((p: any) => ({
    forma_pagamento: mapearFormaPagamentoSEFAZ(p.metodo),
    valor_pagamento: Number(p.valor || 0).toFixed(2)
  }));

  const payload: any = {
    natureza_operacao: 'VENDA AO CONSUMIDOR',
    data_emissao: agoraIso,
    tipo_documento: 1, // Saída
    finalidade_emissao: 1, // Normal
    consumidor_final: 1, // Sim
    presenca_comprador: 1, // Presencial
    cnpj_emitente: apenasNumeros(dadosFiscais.cnpj),
    itens: itensFormatados,
    formas_pagamento: formasPagamento
  };

  // Se o cliente foi informado com CPF ou CNPJ
  const docCliente = apenasNumeros(cliente?.cpf || cliente?.cpfCnpj || cliente?.cnpj || '');
  if (docCliente) {
    if (docCliente.length === 11) {
      payload.cpf_destinatario = docCliente;
    } else if (docCliente.length === 14) {
      payload.cnpj_destinatario = docCliente;
    }
    if (cliente?.nome || cliente?.nomeCompleto) {
      payload.nome_destinatario = String(cliente?.nome || cliente?.nomeCompleto).slice(0, 60);
    }
    if (cliente?.email) {
      payload.email_destinatario = cliente.email;
    }
  }

  return payload;
}

/**
 * Monta o payload no formato Focus NFe v2 para NF-e (modelo 55 - Atacado / PJ)
 */
export function montarPayloadNFe(
  venda: any,
  cliente: any,
  dadosFiscais: DadosFiscaisLoja
): any {
  const agoraIso = new Date().toISOString();
  const itensVenda = Array.isArray(venda.itens) ? venda.itens : [];

  const itensFormatados = itensVenda.map((item: any, index: number) => {
    const qtd = Number(item.quantidade) || 1;
    const valorUnitario = Number(item.valorExibir || item.valor || item.preco || 0);
    const descontoItem = Number(item.desconto || 0);

    const descLower = String(item.descricao || item.modelo || '').toLowerCase();
    const isAcessorio = descLower.includes('capa') || descLower.includes('pelicula') || descLower.includes('película') || descLower.includes('fone') || descLower.includes('cabo') || descLower.includes('fonte') || descLower.includes('carregador');

    const codigoNcm = apenasNumeros(isAcessorio ? dadosFiscais.ncm_padrao_acessorios : dadosFiscais.ncm_padrao_smartphones) || '85171300';
    const cfop = apenasNumeros(dadosFiscais.cfop_padrao_nfe) || '5102';

    return {
      numero_item: index + 1,
      codigo_produto: String(item.aparelhoId || item.id || `PROD-${index + 1}`),
      descricao: String(item.descricao || item.modelo || 'Produto de Informática/Eletrônico').slice(0, 120),
      codigo_ncm: codigoNcm,
      quantidade_comercial: qtd,
      quantidade_tributavel: qtd,
      valor_unitario_comercial: valorUnitario.toFixed(2),
      valor_unitario_tributavel: valorUnitario.toFixed(2),
      valor_bruto: (valorUnitario * qtd).toFixed(2),
      valor_desconto: descontoItem > 0 ? descontoItem.toFixed(2) : undefined,
      unidade_comercial: 'UN',
      unidade_tributavel: 'UN',
      cfop: cfop,
      icms_origem: '0',
      icms_situacao_tributaria: dadosFiscais.regime_tributario === '1' ? '102' : '00'
    };
  });

  const pagamentosLista = Array.isArray(venda.pagamentos) && venda.pagamentos.length > 0
    ? venda.pagamentos
    : [{ metodo: venda.metodo || 'dinheiro', valor: Number(venda.valor || 0) }];

  const formasPagamento = pagamentosLista.map((p: any) => ({
    forma_pagamento: mapearFormaPagamentoSEFAZ(p.metodo),
    valor_pagamento: Number(p.valor || 0).toFixed(2)
  }));

  const docCliente = apenasNumeros(cliente?.cpf || cliente?.cpfCnpj || cliente?.cnpj || '');

  const payload: any = {
    natureza_operacao: 'VENDA DE MERCADORIAS',
    data_emissao: agoraIso,
    tipo_documento: 1, // Saída
    finalidade_emissao: 1, // Normal
    consumidor_final: docCliente.length === 14 ? 0 : 1, // 0 se PJ, 1 se PF
    presenca_comprador: 1,
    cnpj_emitente: apenasNumeros(dadosFiscais.cnpj),
    itens: itensFormatados,
    formas_pagamento: formasPagamento
  };

  if (docCliente) {
    if (docCliente.length === 11) {
      payload.cpf_destinatario = docCliente;
    } else {
      payload.cnpj_destinatario = docCliente;
    }
  }
  if (cliente?.nome || cliente?.nomeCompleto) {
    payload.nome_destinatario = String(cliente?.nome || cliente?.nomeCompleto).slice(0, 60);
  }
  if (cliente?.inscricao_estadual) {
    payload.inscricao_estadual_destinatario = apenasNumeros(cliente.inscricao_estadual);
  }
  if (cliente?.email) {
    payload.email_destinatario = cliente.email;
  }
  if (cliente?.endereco) {
    payload.logradouro_destinatario = cliente.endereco.logradouro || '';
    payload.numero_destinatario = cliente.endereco.numero || 'S/N';
    payload.bairro_destinatario = cliente.endereco.bairro || '';
    payload.municipio_destinatario = cliente.endereco.municipio || cliente.cidade || '';
    payload.uf_destinatario = (cliente.endereco.uf || cliente.estado || '').toUpperCase();
    payload.cep_destinatario = apenasNumeros(cliente.endereco.cep || '');
  }

  return payload;
}

/**
 * Ponto de entrada para emissão fiscal
 * NUNCA lança exceções não tratadas que interfiram no fluxo do PDV.
 */
export async function processarEmissaoFiscal(req: RequisicaoEmissao): Promise<RespostaEmissao> {
  const { vendaId, tipo = 'nfce' } = req;

  try {
    // 1. Busca a venda no Supabase
    const { data: venda, error: errVenda } = await supabaseAdmin
      .from('vendas')
      .select('*')
      .eq('id', vendaId)
      .maybeSingle();

    if (errVenda || !venda) {
      return {
        sucesso: false,
        status: 'erro_autorizacao',
        mensagem: `Venda ${vendaId} não encontrada para emissão fiscal.`,
        vendaId,
        tipo
      };
    }

    const lojaId = req.lojaId || venda.loja_id;
    if (!lojaId) {
      return {
        sucesso: false,
        status: 'erro_autorizacao',
        mensagem: 'Venda sem loja associada (loja_id nulo).',
        vendaId,
        tipo
      };
    }

    // 2. Busca os dados fiscais da loja
    const dadosFiscais = await obterDadosFiscaisLoja(lojaId);
    if (!dadosFiscais || !dadosFiscais.ativo || !dadosFiscais.cnpj) {
      return {
        sucesso: false,
        status: 'pendente',
        mensagem: 'Módulo fiscal não configurado ou inativo para esta loja. Venda processada normalmente.',
        vendaId,
        tipo,
        configurado: false
      };
    }

    // 3. Busca os dados do cliente
    let cliente: any = req.destinatario || null;
    if (!cliente && venda.clienteId) {
      const { data: cliData } = await supabaseAdmin
        .from('clientes')
        .select('*')
        .eq('id', venda.clienteId)
        .maybeSingle();
      cliente = cliData;
    }

    // 4. Monta o payload
    const payload = tipo === 'nfe'
      ? montarPayloadNFe(venda, cliente, dadosFiscais)
      : montarPayloadNFCe(venda, cliente, dadosFiscais);

    const client = new FocusNFeClient(dadosFiscais.focus_token, dadosFiscais.ambiente);

    // Salva registro inicial como processando
    await salvarRegistroNotaFiscal({
      loja_id: lojaId,
      venda_id: String(vendaId),
      tipo,
      status: 'processando',
      valor_total: Number(venda.valor || 0),
      destinatario_nome: cliente?.nome || venda.clienteNome,
      destinatario_documento: cliente?.cpf || cliente?.cnpj || cliente?.cpfCnpj,
      dados_emissao: payload
    });

    // 5. Envia para Focus NFe
    const referenciaUnica = `PC-${tipo.toUpperCase()}-${vendaId}`;
    const resultadoEnvio = tipo === 'nfe'
      ? await client.emitirNFe(referenciaUnica, payload)
      : await client.emitirNFCe(referenciaUnica, payload);

    // Mapeamento de status de retorno da Focus NFe
    // 'autorizado' | 'processando_autorizacao' | 'erro_autorizacao' | 'cancelado'
    let statusNota: StatusNotaFiscal = 'processando';
    let sucesso = false;

    if (resultadoEnvio.status === 'autorizado') {
      statusNota = 'autorizada';
      sucesso = true;
    } else if (resultadoEnvio.status === 'processando_autorizacao') {
      statusNota = 'processando';
      sucesso = true;
    } else if (resultadoEnvio.status === 'erro_autorizacao' || resultadoEnvio.httpStatus >= 400) {
      statusNota = 'erro_autorizacao';
      sucesso = false;
    }

    const danfeUrl = client.getDanfeUrl(resultadoEnvio.caminho_danfe);
    const xmlUrl = client.getXmlUrl(resultadoEnvio.caminho_xml_nota);

    // Salva status final
    const notaSalva = await salvarRegistroNotaFiscal({
      loja_id: lojaId,
      venda_id: String(vendaId),
      tipo,
      status: statusNota,
      numero: resultadoEnvio.numero ? Number(resultadoEnvio.numero) : undefined,
      serie: resultadoEnvio.serie ? String(resultadoEnvio.serie) : undefined,
      chave_acesso: resultadoEnvio.chave_nfe || resultadoEnvio.chave,
      protocolo: resultadoEnvio.protocolo,
      mensagem_sefaz: resultadoEnvio.mensagem_sefaz || resultadoEnvio.mensagem,
      url_danfe: danfeUrl,
      url_xml: xmlUrl,
      caminho_danfe: resultadoEnvio.caminho_danfe,
      caminho_xml_nota: resultadoEnvio.caminho_xml_nota,
      retorno_sefaz: resultadoEnvio
    });

    return {
      sucesso,
      status: statusNota,
      mensagem: resultadoEnvio.mensagem_sefaz || (sucesso ? 'Nota fiscal enviada com sucesso para a SEFAZ.' : 'Falha na autorização da SEFAZ.'),
      notaId: notaSalva?.id,
      vendaId: String(vendaId),
      tipo,
      chaveAcesso: resultadoEnvio.chave_nfe || resultadoEnvio.chave,
      numero: resultadoEnvio.numero,
      serie: resultadoEnvio.serie,
      urlDanfe: danfeUrl,
      urlXml: xmlUrl,
      caminhoDanfe: resultadoEnvio.caminho_danfe,
      caminhoXml: resultadoEnvio.caminho_xml_nota,
      protocolo: resultadoEnvio.protocolo,
      configurado: true
    };
  } catch (error: any) {
    console.error('Exceção ao processar emissão fiscal:', error);
    return {
      sucesso: false,
      status: 'erro_autorizacao',
      mensagem: error?.message || 'Erro inesperado ao processar emissão fiscal.',
      vendaId: String(vendaId),
      tipo,
      configurado: true
    };
  }
}
