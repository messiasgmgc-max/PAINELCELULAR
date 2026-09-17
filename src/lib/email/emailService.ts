import { Resend } from 'resend';
import nodemailer from 'nodemailer';

// Remetentes padrão segmentados por finalidade
const SENDER_RECIBOS = process.env.EMAIL_FROM_RECIBOS || 'Phone Center Recibos <recibos@phonecenter.tech>';
const SENDER_NOTIFICACOES = process.env.EMAIL_FROM_NOTIFICACOES || 'Phone Center Notificações <notificacoes@phonecenter.tech>';
const SENDER_SUPORTE = process.env.EMAIL_FROM_SUPORTE || 'Phone Center Suporte <suporte@phonecenter.tech>';
const SENDER_CONTATO = process.env.EMAIL_FROM_CONTATO || 'Phone Center Contato <contato@phonecenter.tech>';
const ADMIN_ALERT_EMAIL = process.env.ADMIN_ALERT_EMAIL || 'guiguigamer125@gmail.com';
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://app.phonecenter.tech';

export type EmailSenderType = 'recibos' | 'notificacoes' | 'suporte' | 'contato';

function getSender(type: EmailSenderType): string {
  switch (type) {
    case 'recibos':
      return SENDER_RECIBOS;
    case 'notificacoes':
      return SENDER_NOTIFICACOES;
    case 'suporte':
      return SENDER_SUPORTE;
    case 'contato':
      return SENDER_CONTATO;
    default:
      return SENDER_NOTIFICACOES;
  }
}

/**
 * Função central de envio de e-mail com Resend (e fallback automático para Nodemailer/SMTP)
 */
export async function sendEmail({
  type = 'notificacoes',
  to,
  subject,
  html,
  attachments = [],
}: {
  type?: EmailSenderType;
  to: string | string[];
  subject: string;
  html: string;
  attachments?: Array<{
    filename: string;
    content?: Buffer | string;
    path?: string;
    contentType?: string;
    cid?: string;
  }>;
}) {
  const from = getSender(type);
  const recipients = Array.isArray(to) ? to : [to];

  if (process.env.RESEND_API_KEY) {
    try {
      const resend = new Resend(process.env.RESEND_API_KEY);
      const resendAttachments = attachments.map((att) => ({
        filename: att.filename,
        content: att.content,
        path: att.path,
      }));

      const { data, error } = await resend.emails.send({
        from,
        to: recipients,
        subject,
        html,
        attachments: resendAttachments.length > 0 ? (resendAttachments as any) : undefined,
      });

      if (error) {
        console.error('❌ [Resend Error]:', error);
        throw new Error(error.message);
      }

      console.log(`✅ [Email Enviado via Resend]: ID ${data?.id} | De: ${from} | Para: ${recipients.join(', ')}`);
      return { success: true, id: data?.id, provider: 'resend' };
    } catch (err: any) {
      console.warn('⚠️ Falha no Resend, tentando fallback via SMTP/Nodemailer:', err.message);
    }
  }

  // Fallback para Nodemailer / SMTP
  if (process.env.EMAIL_HOST && process.env.EMAIL_USER && process.env.EMAIL_PASS) {
    const transporter = nodemailer.createTransport({
      host: process.env.EMAIL_HOST,
      port: Number(process.env.EMAIL_PORT) || 587,
      secure: Number(process.env.EMAIL_PORT) === 465,
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });

    const info = await transporter.sendMail({
      from,
      to: recipients.join(', '),
      subject,
      html,
      attachments,
    });

    console.log(`✅ [Email Enviado via SMTP]: ID ${info.messageId} | De: ${from} | Para: ${recipients.join(', ')}`);
    return { success: true, id: info.messageId, provider: 'nodemailer' };
  }

  console.warn('⚠️ Nenhuma credencial de e-mail configurada (RESEND_API_KEY ou SMTP ausentes).');
  return { success: false, error: 'Nenhum provedor de e-mail configurado.' };
}

// ==========================================
// TEMPLATES VISUAIS MODERNOS (DARK THEME)
// ==========================================

function wrapBaseTemplate({
  titulo,
  subtitulo,
  badge,
  badgeColor = '#06b6d4',
  conteudoHtml,
  botaoTexto,
  botaoUrl,
}: {
  titulo: string;
  subtitulo?: string;
  badge?: string;
  badgeColor?: string;
  conteudoHtml: string;
  botaoTexto?: string;
  botaoUrl?: string;
}): string {
  return `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${titulo}</title>
  <style>
    body { margin: 0; padding: 0; background-color: #090d16; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #f1f5f9; }
    .wrapper { width: 100%; max-width: 600px; margin: 0 auto; padding: 24px 16px; box-sizing: border-box; }
    .card { background: linear-gradient(180deg, #0f172a 0%, #090d16 100%); border: 1px solid rgba(255,255,255,0.1); border-radius: 24px; padding: 32px 24px; box-shadow: 0 20px 40px rgba(0,0,0,0.6); }
    .header { text-align: center; padding-bottom: 24px; border-bottom: 1px solid rgba(255,255,255,0.08); }
    .logo { font-size: 22px; font-weight: 800; color: #ffffff; letter-spacing: -0.5px; }
    .logo-badge { color: #38bdf8; }
    .badge { display: inline-block; padding: 4px 12px; border-radius: 9999px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; background: rgba(56, 189, 248, 0.15); color: ${badgeColor}; border: 1px solid ${badgeColor}40; margin-bottom: 12px; }
    .title { font-size: 20px; font-weight: 700; color: #ffffff; margin: 8px 0 4px 0; }
    .subtitle { font-size: 13px; color: #94a3b8; margin: 0; }
    .body-content { padding: 24px 0; font-size: 14px; line-height: 1.6; color: #cbd5e1; }
    .btn-container { text-align: center; margin: 28px 0 16px 0; }
    .btn { display: inline-block; background: linear-gradient(135deg, #2563eb 0%, #0284c7 100%); color: #ffffff !important; text-decoration: none; padding: 14px 32px; border-radius: 12px; font-weight: 700; font-size: 14px; box-shadow: 0 10px 25px rgba(37, 99, 235, 0.4); }
    .info-box { background: rgba(255, 255, 255, 0.03); border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 16px; padding: 16px; margin: 16px 0; }
    .info-row { display: flex; justify-content: space-between; padding: 6px 0; font-size: 13px; border-bottom: 1px dashed rgba(255, 255, 255, 0.06); }
    .info-row:last-child { border-bottom: none; }
    .info-label { color: #64748b; font-weight: 500; }
    .info-value { color: #f8fafc; font-weight: 600; text-align: right; }
    .footer { text-align: center; padding-top: 24px; font-size: 12px; color: #64748b; border-top: 1px solid rgba(255,255,255,0.08); }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="card">
      <div class="header">
        <div class="logo">PHONE<span class="logo-badge">CENTER</span></div>
        <div style="margin-top: 16px;">
          ${badge ? `<div class="badge">${badge}</div>` : ''}
          <h1 class="title">${titulo}</h1>
          ${subtitulo ? `<p class="subtitle">${subtitulo}</p>` : ''}
        </div>
      </div>
      <div class="body-content">
        ${conteudoHtml}
        ${
          botaoTexto && botaoUrl
            ? `
          <div class="btn-container">
            <a href="${botaoUrl}" class="btn" target="_blank">${botaoTexto}</a>
          </div>
        `
            : ''
        }
      </div>
      <div class="footer">
        <p style="margin: 0 0 6px 0;">Este é um e-mail transacional oficial do sistema <strong>Phone Center</strong>.</p>
        <p style="margin: 0;">Para gerenciar sua conta, acesse <a href="${APP_URL}" style="color: #38bdf8; text-decoration: none;">app.phonecenter.tech</a></p>
      </div>
    </div>
  </div>
</body>
</html>
  `.trim();
}

// ==========================================
// FUNÇÕES DE DISPARO ESPECÍFICAS
// ==========================================

/**
 * 1. Disparo de Recibo / Notinha de Venda (recibos@phonecenter.tech)
 */
export async function enviarReciboVendaEmail({
  para,
  clienteNome,
  lojaNome,
  modeloAparelho,
  imei,
  valor,
  pdfBufferBase64,
  pdfUrl,
}: {
  para: string;
  clienteNome: string;
  lojaNome: string;
  modeloAparelho?: string;
  imei?: string;
  valor: number;
  pdfBufferBase64?: string;
  pdfUrl?: string;
}) {
  const valorFormatado = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valor);

  const conteudoHtml = `
    <p>Olá, <strong>${clienteNome}</strong>!</p>
    <p>Agradecemos pela preferência! Sua compra na <strong>${lojaNome}</strong> foi concluída com sucesso. O comprovante em PDF segue em anexo a esta mensagem.</p>
    
    <div class="info-box">
      <div class="info-row">
        <span class="info-label">Loja Emitente:</span>
        <span class="info-value">${lojaNome}</span>
      </div>
      ${
        modeloAparelho
          ? `
      <div class="info-row">
        <span class="info-label">Aparelho / Item:</span>
        <span class="info-value">${modeloAparelho}</span>
      </div>
      `
          : ''
      }
      ${
        imei
          ? `
      <div class="info-row">
        <span class="info-label">IMEI / Serial:</span>
        <span class="info-value" style="font-family: monospace; color: #38bdf8;">${imei}</span>
      </div>
      `
          : ''
      }
      <div class="info-row">
        <span class="info-label">Valor Total:</span>
        <span class="info-value" style="color: #10b981; font-size: 15px;">${valorFormatado}</span>
      </div>
      <div class="info-row">
        <span class="info-label">Garantia:</span>
        <span class="info-value">Conforme termo anexo no recibo</span>
      </div>
    </div>
    
    <p style="font-size: 12px; color: #94a3b8;">Guarde este e-mail e o anexo PDF para eventuais consultas de garantia e comprovação de titularidade.</p>
  `;

  const html = wrapBaseTemplate({
    titulo: 'Comprovante & Recibo de Venda',
    subtitulo: `Emitido por ${lojaNome}`,
    badge: 'Compra Concluída',
    badgeColor: '#10b981',
    conteudoHtml,
  });

  const attachments: any[] = [];
  if (pdfBufferBase64) {
    attachments.push({
      filename: `Recibo_${lojaNome.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`,
      content: Buffer.from(pdfBufferBase64, 'base64'),
      contentType: 'application/pdf',
    });
  } else if (pdfUrl) {
    attachments.push({
      filename: `Recibo_${lojaNome.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`,
      path: pdfUrl,
    });
  }

  return sendEmail({
    type: 'recibos',
    to: para,
    subject: `📄 Recibo e Garantia da sua compra - ${lojaNome}`,
    html,
    attachments,
  });
}

/**
 * 2. Boas-vindas / Confirmação de Loja Criada (notificacoes@phonecenter.tech)
 */
export async function enviarBoasVindasLojaEmail({
  para,
  nomeLoja,
  plano = 'Pro',
  loginEmail,
}: {
  para: string;
  nomeLoja: string;
  plano?: string;
  loginEmail?: string;
}) {
  const conteudoHtml = `
    <p>Olá, equipe <strong>${nomeLoja}</strong>!</p>
    <p>Seja muito bem-vindo ao <strong>Phone Center</strong>. Sua nova loja foi criada e configurada com sucesso na nossa plataforma de gestão.</p>
    
    <div class="info-box">
      <div class="info-row">
        <span class="info-label">Nome da Loja:</span>
        <span class="info-value">${nomeLoja}</span>
      </div>
      <div class="info-row">
        <span class="info-label">Plano Ativo:</span>
        <span class="info-value" style="color: #38bdf8;">Plano ${plano}</span>
      </div>
      ${
        loginEmail
          ? `
      <div class="info-row">
        <span class="info-label">E-mail de Acesso:</span>
        <span class="info-value">${loginEmail}</span>
      </div>
      `
          : ''
      }
      <div class="info-row">
        <span class="info-label">Status da Plataforma:</span>
        <span class="info-value" style="color: #10b981;">Online & Pronta para Uso</span>
      </div>
    </div>
    
    <p>No seu painel você tem controle total de <strong>Estoque com IMEI</strong>, <strong>Ordens de Serviço</strong>, <strong>PDV com notinha térmica</strong>, <strong>Fiados com cobrança automática no WhatsApp</strong> e <strong>IA integrada</strong>.</p>
  `;

  const html = wrapBaseTemplate({
    titulo: `Sua loja está pronta no Phone Center!`,
    subtitulo: 'Tudo pronto para começar a vender e gerenciar',
    badge: 'Nova Loja Ativada',
    badgeColor: '#38bdf8',
    conteudoHtml,
    botaoTexto: 'Acessar Painel da Loja',
    botaoUrl: `${APP_URL}/login`,
  });

  const resLojista = await sendEmail({
    type: 'notificacoes',
    to: para,
    subject: `🚀 Bem-vindo ao Phone Center! Sua loja ${nomeLoja} está pronta`,
    html,
  });

  if (ADMIN_ALERT_EMAIL && ADMIN_ALERT_EMAIL !== para) {
    const adminHtml = wrapBaseTemplate({
      titulo: `Nova Loja Criada: ${nomeLoja}`,
      subtitulo: `Plano: ${plano}`,
      badge: 'Alerta Administrativo',
      badgeColor: '#a855f7',
      conteudoHtml: `
        <p>Uma nova loja acabou de ser cadastrada no sistema:</p>
        <div class="info-box">
          <div class="info-row"><span class="info-label">Loja:</span><span class="info-value">${nomeLoja}</span></div>
          <div class="info-row"><span class="info-label">E-mail:</span><span class="info-value">${para}</span></div>
          <div class="info-row"><span class="info-label">Plano:</span><span class="info-value">${plano}</span></div>
          <div class="info-row"><span class="info-label">Data:</span><span class="info-value">${new Date().toLocaleString('pt-BR')}</span></div>
        </div>
      `,
      botaoTexto: 'Ver no Painel Admin',
      botaoUrl: `${APP_URL}/login`,
    });

    sendEmail({
      type: 'notificacoes',
      to: ADMIN_ALERT_EMAIL,
      subject: `[Admin Alert] Nova loja criada: ${nomeLoja}`,
      html: adminHtml,
    }).catch((e) => console.warn('Erro alerta admin nova loja:', e));
  }

  return resLojista;
}

/**
 * 3. Aviso de Vencimento de Plano / Assinatura (notificacoes@phonecenter.tech)
 */
export async function enviarAvisoVencimentoPlanoEmail({
  para,
  nomeLoja,
  diasRestantes,
  dataVencimento,
  valorRenovacao,
}: {
  para: string;
  nomeLoja: string;
  diasRestantes: number;
  dataVencimento: string;
  valorRenovacao?: number;
}) {
  const isVencido = diasRestantes <= 0;
  const badge = isVencido ? 'Plano Vencido' : diasRestantes === 1 ? 'Vence Amanhã' : `Vence em ${diasRestantes} dias`;
  const badgeColor = isVencido ? '#ef4444' : diasRestantes <= 3 ? '#f59e0b' : '#38bdf8';

  const conteudoHtml = `
    <p>Olá, equipe <strong>${nomeLoja}</strong>!</p>
    <p>${
      isVencido
        ? 'Identificamos que a assinatura do seu plano no <strong>Phone Center</strong> expirou. Para não interromper o acesso aos recursos da sua loja, renove agora mesmo.'
        : `Lembramos que a assinatura do seu plano no <strong>Phone Center</strong> vencerá em <strong>${diasRestantes} dia(s)</strong> (${dataVencimento}).`
    }</p>
    
    <div class="info-box">
      <div class="info-row">
        <span class="info-label">Loja:</span>
        <span class="info-value">${nomeLoja}</span>
      </div>
      <div class="info-row">
        <span class="info-label">Vencimento:</span>
        <span class="info-value" style="color: ${badgeColor}; font-weight: 700;">${dataVencimento}</span>
      </div>
      ${
        valorRenovacao
          ? `
      <div class="info-row">
        <span class="info-label">Valor:</span>
        <span class="info-value" style="color: #10b981;">${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valorRenovacao)}</span>
      </div>
      `
          : ''
      }
    </div>
    
    <p>A renovação pode ser feita instantaneamente via <strong>PIX</strong> ou <strong>Cartão de Crédito</strong> no painel.</p>
  `;

  const html = wrapBaseTemplate({
    titulo: isVencido ? 'Renovação Pendente do seu Plano' : `Lembrete de Vencimento do Plano (${badge})`,
    subtitulo: `Loja ${nomeLoja}`,
    badge,
    badgeColor,
    conteudoHtml,
    botaoTexto: 'Renovar Assinatura Agora',
    botaoUrl: `${APP_URL}/assinar`,
  });

  return sendEmail({
    type: 'notificacoes',
    to: para,
    subject: isVencido
      ? `⚠️ [Aviso Urgente] O plano da sua loja ${nomeLoja} venceu`
      : `🔔 [Lembrete] O plano da sua loja ${nomeLoja} vence em ${diasRestantes} dia(s)`,
    html,
  });
}

/**
 * 4. Confirmação de Exclusão de Loja (notificacoes@phonecenter.tech)
 */
export async function enviarConfirmacaoExclusaoLojaEmail({
  para,
  nomeLoja,
}: {
  para: string;
  nomeLoja: string;
}) {
  const conteudoHtml = `
    <p>Olá, equipe <strong>${nomeLoja}</strong>,</p>
    <p>Confirmamos que a exclusão e encerramento da loja <strong>${nomeLoja}</strong> foram processados no sistema <strong>Phone Center</strong> em <strong>${new Date().toLocaleDateString('pt-BR')}</strong>.</p>
    
    <div class="info-box">
      <div class="info-row">
        <span class="info-label">Loja Encerrada:</span>
        <span class="info-value">${nomeLoja}</span>
      </div>
      <div class="info-row">
        <span class="info-label">Status:</span>
        <span class="info-value" style="color: #ef4444;">Desativada</span>
      </div>
      <div class="info-row">
        <span class="info-label">Data:</span>
        <span class="info-value">${new Date().toLocaleString('pt-BR')}</span>
      </div>
    </div>
    
    <p>Caso tenha sido um engano ou precise recuperar dados históricos, entre em contato imediatamente com o suporte através de <a href="mailto:suporte@phonecenter.tech" style="color: #38bdf8;">suporte@phonecenter.tech</a>.</p>
  `;

  const html = wrapBaseTemplate({
    titulo: 'Encerramento de Loja Concluído',
    subtitulo: nomeLoja,
    badge: 'Loja Encerrada',
    badgeColor: '#ef4444',
    conteudoHtml,
  });

  return sendEmail({
    type: 'notificacoes',
    to: [para, ADMIN_ALERT_EMAIL].filter(Boolean),
    subject: `Confirmado: Encerramento da loja ${nomeLoja} no Phone Center`,
    html,
  });
}

/**
 * 5. Notificação de Simulação / Lead de Cliente na Vitrine (notificacoes@phonecenter.tech)
 */
export async function enviarNotificacaoSimulacaoClienteEmail({
  para,
  nomeLoja,
  clienteNome,
  clienteTelefone,
  modeloAparelho,
  valorEstimado,
  detalhes,
}: {
  para: string;
  nomeLoja: string;
  clienteNome: string;
  clienteTelefone?: string;
  modeloAparelho: string;
  valorEstimado?: number;
  detalhes?: string;
}) {
  const valorFormatado = valorEstimado
    ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valorEstimado)
    : 'A combinar';

  const conteudoHtml = `
    <p>Boas notícias! Um cliente acabou de realizar uma <strong>simulação / cotação</strong> na vitrine da sua loja <strong>${nomeLoja}</strong>:</p>
    
    <div class="info-box">
      <div class="info-row">
        <span class="info-label">Cliente:</span>
        <span class="info-value">${clienteNome}</span>
      </div>
      ${
        clienteTelefone
          ? `
      <div class="info-row">
        <span class="info-label">WhatsApp / Tel:</span>
        <span class="info-value" style="color: #10b981; font-weight: 700;">${clienteTelefone}</span>
      </div>
      `
          : ''
      }
      <div class="info-row">
        <span class="info-label">Aparelho Cotado:</span>
        <span class="info-value" style="color: #38bdf8;">${modeloAparelho}</span>
      </div>
      <div class="info-row">
        <span class="info-label">Valor Estimado:</span>
        <span class="info-value" style="color: #10b981; font-weight: 700;">${valorFormatado}</span>
      </div>
      ${
        detalhes
          ? `
      <div class="info-row">
        <span class="info-label">Observações:</span>
        <span class="info-value">${detalhes}</span>
      </div>
      `
          : ''
      }
    </div>
    
    <p>Acesse o painel para entrar em contato com o cliente e fechar o negócio!</p>
  `;

  const html = wrapBaseTemplate({
    titulo: 'Novo Lead: Simulação de Cliente',
    subtitulo: `Vitrine ${nomeLoja}`,
    badge: 'Oportunidade de Venda',
    badgeColor: '#10b981',
    conteudoHtml,
    botaoTexto: 'Ver no Painel',
    botaoUrl: `${APP_URL}/login`,
  });

  return sendEmail({
    type: 'notificacoes',
    to: para,
    subject: `🔥 [Novo Lead] Simulação de ${modeloAparelho} por ${clienteNome}`,
    html,
  });
}

/**
 * 6. Notificação de Pedido de Coleta / Entrega Motoboy (notificacoes@phonecenter.tech)
 */
export async function enviarNotificacaoColetaEmail({
  para,
  nomeLoja,
  clienteNome,
  clienteEndereco,
  clienteTelefone,
  descricaoServico,
}: {
  para: string;
  nomeLoja: string;
  clienteNome: string;
  clienteEndereco: string;
  clienteTelefone?: string;
  descricaoServico?: string;
}) {
  const conteudoHtml = `
    <p>Uma nova solicitação de <strong>coleta / entrega</strong> foi registrada para a loja <strong>${nomeLoja}</strong>:</p>
    
    <div class="info-box">
      <div class="info-row">
        <span class="info-label">Cliente:</span>
        <span class="info-value">${clienteNome}</span>
      </div>
      <div class="info-row">
        <span class="info-label">Endereço:</span>
        <span class="info-value">${clienteEndereco}</span>
      </div>
      ${
        clienteTelefone
          ? `
      <div class="info-row">
        <span class="info-label">Telefone:</span>
        <span class="info-value">${clienteTelefone}</span>
      </div>
      `
          : ''
      }
      ${
        descricaoServico
          ? `
      <div class="info-row">
        <span class="info-label">Item / Serviço:</span>
        <span class="info-value">${descricaoServico}</span>
      </div>
      `
          : ''
      }
    </div>
  `;

  const html = wrapBaseTemplate({
    titulo: 'Nova Solicitação de Coleta',
    subtitulo: nomeLoja,
    badge: 'Coleta Agendada',
    badgeColor: '#38bdf8',
    conteudoHtml,
    botaoTexto: 'Acessar Central de Entregas',
    botaoUrl: `${APP_URL}/login`,
  });

  return sendEmail({
    type: 'notificacoes',
    to: para,
    subject: `🛵 [Nova Coleta] Pedido de coleta para ${clienteNome} - ${nomeLoja}`,
    html,
  });
}

/**
 * 7. Notificação de Abertura de Ticket de Suporte (suporte@phonecenter.tech)
 */
export async function enviarNovoTicketSuporteEmail({
  ticketId,
  nomeLoja,
  lojistaEmail,
  assunto,
  prioridade = 'Normal',
  mensagem,
}: {
  ticketId: string;
  nomeLoja: string;
  lojistaEmail: string;
  assunto: string;
  prioridade?: string;
  mensagem: string;
}) {
  const prioridadeColor = prioridade.toLowerCase() === 'alta' || prioridade.toLowerCase() === 'urgente' ? '#ef4444' : '#38bdf8';

  const conteudoHtml = `
    <p>Um novo chamado de suporte foi aberto pelo lojista:</p>
    
    <div class="info-box">
      <div class="info-row">
        <span class="info-label">Protocolo:</span>
        <span class="info-value" style="font-family: monospace; color: #38bdf8;">#${ticketId.slice(0, 8).toUpperCase()}</span>
      </div>
      <div class="info-row">
        <span class="info-label">Loja:</span>
        <span class="info-value">${nomeLoja}</span>
      </div>
      <div class="info-row">
        <span class="info-label">E-mail:</span>
        <span class="info-value">${lojistaEmail}</span>
      </div>
      <div class="info-row">
        <span class="info-label">Prioridade:</span>
        <span class="info-value" style="color: ${prioridadeColor}; font-weight: 700;">${prioridade}</span>
      </div>
      <div class="info-row">
        <span class="info-label">Assunto:</span>
        <span class="info-value">${assunto}</span>
      </div>
    </div>
    
    <div style="background: rgba(255,255,255,0.02); border-left: 3px solid #38bdf8; padding: 12px; margin: 16px 0; border-radius: 4px;">
      <p style="margin: 0; font-size: 13px; color: #e2e8f0; white-space: pre-wrap;">${mensagem}</p>
    </div>
  `;

  const html = wrapBaseTemplate({
    titulo: `Novo Ticket: ${assunto}`,
    subtitulo: `Aberto por ${nomeLoja} (#${ticketId.slice(0, 8).toUpperCase()})`,
    badge: 'Suporte Técnico',
    badgeColor: prioridadeColor,
    conteudoHtml,
    botaoTexto: 'Responder no Painel',
    botaoUrl: `${APP_URL}/login`,
  });

  const resAdmin = await sendEmail({
    type: 'suporte',
    to: ADMIN_ALERT_EMAIL,
    subject: `🎫 [Suporte] Novo Ticket #${ticketId.slice(0, 8).toUpperCase()}: ${assunto} (${nomeLoja})`,
    html,
  });

  const confirmacaoHtml = wrapBaseTemplate({
    titulo: 'Recebemos o seu chamado de suporte!',
    subtitulo: `Protocolo #${ticketId.slice(0, 8).toUpperCase()}`,
    badge: 'Chamado Aberto',
    badgeColor: '#10b981',
    conteudoHtml: `
      <p>Olá, equipe <strong>${nomeLoja}</strong>!</p>
      <p>Seu chamado foi registrado com sucesso na nossa central de suporte. Nossa equipe técnica analisará sua solicitação o mais rápido possível.</p>
      <div class="info-box">
        <div class="info-row"><span class="info-label">Protocolo:</span><span class="info-value" style="font-family: monospace;">#${ticketId.slice(0, 8).toUpperCase()}</span></div>
        <div class="info-row"><span class="info-label">Assunto:</span><span class="info-value">${assunto}</span></div>
        <div class="info-row"><span class="info-label">Prioridade:</span><span class="info-value">${prioridade}</span></div>
      </div>
    `,
    botaoTexto: 'Acompanhar Chamado',
    botaoUrl: `${APP_URL}/login`,
  });

  sendEmail({
    type: 'suporte',
    to: lojistaEmail,
    subject: `Confirmação de Chamado de Suporte #${ticketId.slice(0, 8).toUpperCase()} - Phone Center`,
    html: confirmacaoHtml,
  }).catch((e) => console.warn('Erro envio confirmacao ticket lojista:', e));

  return resAdmin;
}

/**
 * 8. Notificação de Resposta ao Ticket de Suporte (suporte@phonecenter.tech)
 */
export async function enviarRespostaTicketSuporteEmail({
  para,
  ticketId,
  nomeLoja,
  assunto,
  resposta,
}: {
  para: string;
  ticketId: string;
  nomeLoja: string;
  assunto: string;
  resposta: string;
}) {
  const conteudoHtml = `
    <p>Olá, equipe <strong>${nomeLoja}</strong>!</p>
    <p>A equipe de suporte do <strong>Phone Center</strong> respondeu ao seu chamado <strong>#${ticketId.slice(0, 8).toUpperCase()}</strong>:</p>
    
    <div style="background: rgba(37, 99, 235, 0.08); border-left: 3px solid #38bdf8; padding: 16px; margin: 16px 0; border-radius: 8px;">
      <p style="margin: 0; font-size: 13.5px; color: #f8fafc; white-space: pre-wrap;">${resposta}</p>
    </div>
    
    <p>Para interagir ou fechar o chamado, clique no botão abaixo para acessar o painel.</p>
  `;

  const html = wrapBaseTemplate({
    titulo: 'Resposta ao seu Chamado de Suporte',
    subtitulo: `Protocolo #${ticketId.slice(0, 8).toUpperCase()} - ${assunto}`,
    badge: 'Atualização de Suporte',
    badgeColor: '#38bdf8',
    conteudoHtml,
    botaoTexto: 'Acessar Chamado no Painel',
    botaoUrl: `${APP_URL}/login`,
  });

  return sendEmail({
    type: 'suporte',
    to: para,
    subject: `💬 [Suporte Phone Center] Resposta ao Chamado #${ticketId.slice(0, 8).toUpperCase()}`,
    html,
  });
}

/**
 * 9. Notificação de Nova Mensagem no Chat de Suporte ao Vivo (Para Admin / Equipe de Atendimento)
 */
export async function enviarMensagemChatSuporteParaAdminEmail({
  lojaId,
  nomeLoja,
  lojistaEmail,
  lojistaNome,
  mensagem,
}: {
  lojaId?: string;
  nomeLoja: string;
  lojistaEmail: string;
  lojistaNome?: string;
  mensagem: string;
}) {
  const conteudoHtml = `
    <p>Uma nova mensagem foi enviada no <strong>Chat de Suporte ao Vivo</strong> por um lojista:</p>
    
    <div class="info-box">
      <div class="info-row">
        <span class="info-label">Loja / Cliente:</span>
        <span class="info-value" style="font-weight: 700; color: #38bdf8;">${nomeLoja}</span>
      </div>
      <div class="info-row">
        <span class="info-label">Usuário:</span>
        <span class="info-value">${lojistaNome || 'Lojista'} (${lojistaEmail})</span>
      </div>
      <div class="info-row">
        <span class="info-label">Horário:</span>
        <span class="info-value">${new Date().toLocaleString('pt-BR')}</span>
      </div>
    </div>
    
    <div style="background: rgba(30, 41, 59, 0.7); border-left: 3px solid #38bdf8; padding: 14px; margin: 16px 0; border-radius: 8px;">
      <p style="margin: 0; font-size: 13.5px; color: #f1f5f9; white-space: pre-wrap; line-height: 1.6;">${mensagem}</p>
    </div>
    
    <p style="font-size: 12px; color: #94a3b8;">
      💡 Acesse o painel administrativo para responder em tempo real através do chat de atendimento.
    </p>
  `;

  const html = wrapBaseTemplate({
    titulo: 'Nova Mensagem no Chat de Suporte',
    subtitulo: `${nomeLoja} está aguardando atendimento`,
    badge: '💬 Chat Suporte',
    badgeColor: '#0ea5e9',
    conteudoHtml,
    botaoTexto: 'Abrir Chat e Responder',
    botaoUrl: `${APP_URL}/superadmin`,
  });

  return sendEmail({
    type: 'suporte',
    to: ADMIN_ALERT_EMAIL,
    subject: `💬 [Chat Suporte] Nova mensagem de ${nomeLoja} (${lojistaNome || lojistaEmail})`,
    html,
  });
}

/**
 * 10. Notificação de Resposta no Chat de Suporte (Para o Lojista)
 */
export async function enviarRespostaChatSuporteParaLojistaEmail({
  para,
  nomeLoja,
  atendenteNome = 'Equipe Phone Center',
  mensagem,
}: {
  para: string;
  nomeLoja: string;
  atendenteNome?: string;
  mensagem: string;
}) {
  const conteudoHtml = `
    <p>Olá, equipe <strong>${nomeLoja}</strong>!</p>
    <p>Você recebeu uma nova mensagem da equipe de suporte do <strong>Phone Center</strong> no seu chat de atendimento:</p>
    
    <div style="background: rgba(14, 165, 233, 0.08); border-left: 3px solid #0ea5e9; padding: 16px; margin: 16px 0; border-radius: 8px;">
      <p style="margin: 0 0 6px 0; font-size: 11px; font-weight: 700; color: #38bdf8; text-transform: uppercase;">
        🛡️ ${atendenteNome} respondeu:
      </p>
      <p style="margin: 0; font-size: 13.5px; color: #f8fafc; white-space: pre-wrap; line-height: 1.6;">${mensagem}</p>
    </div>
    
    <p style="font-size: 12px; color: #94a3b8;">
      Para continuar a conversa ou tirar mais dúvidas, basta abrir o chat de suporte no seu painel.
    </p>
  `;

  const html = wrapBaseTemplate({
    titulo: 'Nova Resposta do Suporte Phone Center',
    subtitulo: 'Nossa equipe acabou de responder no chat',
    badge: '💬 Suporte Online',
    badgeColor: '#10b981',
    conteudoHtml,
    botaoTexto: 'Acessar Chat no Sistema',
    botaoUrl: `${APP_URL}/`,
  });

  return sendEmail({
    type: 'suporte',
    to: para,
    subject: `💬 [Suporte Phone Center] Nova mensagem no chat da sua loja`,
    html,
  });
}

