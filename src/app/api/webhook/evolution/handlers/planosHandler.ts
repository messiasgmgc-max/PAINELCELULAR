import { PLANOS_SISTEMA, type TipoPlano } from '@/lib/planos-config';

export function gerarMensagemTabelaPlanos(params: {
  nomeUsuario: string;
  nomeLoja: string;
  planoTipo?: string;
  planoStatus?: string;
}): string {
  const planoAtualFormatado = (params.planoTipo || 'entrada').toUpperCase();
  const statusFormatado =
    params.planoStatus === 'ativo' ? 'Ativo' : params.planoStatus || 'Ativo';

  const pEntrada = PLANOS_SISTEMA.entrada;
  const pInter = PLANOS_SISTEMA.intermediario;
  const pAvancado = PLANOS_SISTEMA.avancado;

  const vEntradaMensal = pEntrada.precos.mensal.valorMensal.toFixed(2).replace('.', ',');
  const vEntradaAnual = pEntrada.precos.anual.valorMensal.toFixed(2).replace('.', ',');
  const vInterMensal = pInter.precos.mensal.valorMensal.toFixed(2).replace('.', ',');
  const vInterAnual = pInter.precos.anual.valorMensal.toFixed(2).replace('.', ',');
  const vAvancadoMensal = pAvancado.precos.mensal.valorMensal.toFixed(2).replace('.', ',');
  const vAvancadoAnual = pAvancado.precos.anual.valorMensal.toFixed(2).replace('.', ',');

  return `📋 *Planos Phone Center — Gestão Inteligente para Lojistas*

Olá, *${params.nomeUsuario}*! Sua loja (*${params.nomeLoja}*) atualmente está no:
⭐ *Plano ${planoAtualFormatado}* (${statusFormatado})

Conheça os 3 planos disponíveis na nossa plataforma:

1️⃣ *Plano Entrada* — R$ ${vEntradaMensal}/mês (ou R$ ${vEntradaAnual} no anual):
• Painel completo de estoque, vendas e produtos
• Ordens de Serviço (OS) com garantia documentada
• Leitor de código de barras e OCR de etiquetas com IA
• Bot assistente no WhatsApp (!estoque, !vender, !cadastrar, !os)

2️⃣ *Plano Intermediário* — R$ ${vInterMensal}/mês (ou R$ ${vInterAnual} no anual) *(Mais Escolhido)*:
• *Tudo do Entrada* +
• Gestão milimétrica de fiado e devedores (!abater, !saldo)
• Bot de cobrança automática com horários programados
• Checagem de IMEI roubado / bloqueado (!checarimei)
• Transmissão de listas de estoque para grupos (!broadcast)

3️⃣ *Plano Avançado* — R$ ${vAvancadoMensal}/mês (ou R$ ${vAvancadoAnual} no anual) *(Máxima Potência)*:
• *Tudo do Intermediário* +
• Escuta e busca em catálogo unificado multi-loja em grupos
• Trilha de auditoria completa com registro de operadores
• API REST com Token próprio para sistemas e robôs externos

💡 *Deseja testar ou alterar seu plano?*
Você pode solicitar um teste de 3 dias grátis de qualquer plano superior no menu *Meu Plano* do painel web!`;
}

export function gerarMensagemVencimentoPlano(params: {
  nomeUsuario: string;
  nomeLoja: string;
  planoTipo?: TipoPlano | string;
  planoStatus?: string;
  dataVencimentoFormatada?: string;
  diasRestantes?: number;
  papelUsuario?: string;
}): string {
  const isVitalicio = params.planoStatus === 'vitalicio';
  const planoAtualFormatado = (params.planoTipo || 'entrada').toUpperCase();
  const statusFormatado = isVitalicio
    ? 'Ativo (Acesso Vitalício ♾️)'
    : params.planoStatus === 'ativo'
      ? 'Ativo'
      : params.planoStatus || 'Ativo';
  const dataVenc = isVitalicio
    ? 'Permanente (Sem cobrança periódica)'
    : params.dataVencimentoFormatada || 'Não definida';
  const dias = params.diasRestantes !== undefined ? params.diasRestantes : 0;
  const diasTexto = isVitalicio
    ? '♾️ Acesso Vitalício Garantido'
    : dias <= 0
      ? '⚠️ Vencido hoje ou atrasado'
      : `${dias} dia(s) restante(s)`;

  const rodape = isVitalicio
    ? '🎉 Sua loja possui acesso vitalício permanente liberado pelo Super Admin!'
    : params.papelUsuario === 'owner'
      ? '💡 *Para renovar ou pagar via PIX:* envie *!plano pagar* ou acesse o menu *Meu Plano* no site para pagar no Cartão de Crédito em até 12x.'
      : '💡 Entre em contato com o proprietário da sua loja para renovações ou upgrades de plano.';

  return `🗓️ *Status da Assinatura — ${params.nomeLoja}*

Olá, *${params.nomeUsuario}*! Seguem os detalhes da sua assinatura no Phone Center:
• Loja: *${params.nomeLoja}*
• Plano Atual: *Plano ${planoAtualFormatado}*
• Status: *${statusFormatado}*
• Data de Vencimento: *${dataVenc}*
• Prazo: *${diasTexto}*

${rodape}`;
}
