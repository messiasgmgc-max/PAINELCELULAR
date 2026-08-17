export function generateReciboA4Html(venda: any, loja: any, cliente: any, isForEmail: boolean = false) {
  const safeDataPagamento = (() => {
    if (!venda?.dataPagamento) return new Date();
    try {
      const d = new Date(venda.dataPagamento);
      return isNaN(d.getTime()) ? new Date() : d;
    } catch {
      return new Date();
    }
  })();

  const dataAtual = safeDataPagamento.toLocaleDateString('pt-BR');
  const horaAtual = safeDataPagamento.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

  const assinaturaEmpresaUrl = loja?.assinatura_url || loja?.assinaturaLoja;
  const logoUrl = loja?.logo_url || loja?.logoLoja;
  const logoHtml = logoUrl ? `<img src="${logoUrl}" style="max-height: 80px; max-width: 140px; display: block;" />` : '';

  const formatarMetodoLabel = (m: string) => {
    const map: Record<string, string> = {
      pix: 'PIX',
      dinheiro: 'DINHEIRO',
      cartao_credito: 'CARTÃO DE CRÉDITO',
      cartao_debito: 'CARTÃO DE DÉBITO',
      parcelado: 'PARCELADO / CREDIÁRIO',
      outros: 'OUTROS',
    };
    return map[String(m || '').toLowerCase()] || String(m || 'PIX').toUpperCase();
  };

  const pagamentosTexto = venda.pagamentos && Array.isArray(venda.pagamentos) && venda.pagamentos.length > 0
    ? venda.pagamentos.map((p: any) => {
        const label = formatarMetodoLabel(p.metodo);
        const valorStr = p.valor ? ` - R$ ${Number(p.valor).toFixed(2).replace('.', ',')}` : '';
        const parcStr = p.parcelas && p.parcelas > 1 ? ` (${p.parcelas}x)` : '';
        return `${label}${parcStr}${valorStr}`;
      }).join(' | ')
    : formatarMetodoLabel(venda.metodo || venda.formaPagamento || 'PIX');

  const itensHtmlA4 = venda.itens && venda.itens.length > 0
    ? venda.itens.map((item: any, index: number) => `
        <tr>
          <td style="text-align: center; border: 1px solid #000; padding: 6px;">${item.codigo || index + 1}</td>
          <td style="border: 1px solid #000; padding: 6px;">
            <b style="font-size: 12px; color: #000;">${item.descricao}</b>
            ${item.observacao ? `<br><span style="color: #333; font-[500]; font-size: 10px;">${item.observacao}</span>` : ''}
          </td>
          <td style="text-align: center; border: 1px solid #000; padding: 6px;">${item.quantidade || 1}</td>
          <td style="text-align: right; border: 1px solid #000; padding: 6px;">R$ ${(item.valorExibir || item.valor || 0).toFixed(2).replace('.', ',')}</td>
          <td style="text-align: right; border: 1px solid #000; padding: 6px;">R$ ${(item.desconto || 0).toFixed(2).replace('.', ',')}</td>
          <td style="text-align: right; font-weight: bold; border: 1px solid #000; padding: 6px;">R$ ${(item.total || item.valor || 0).toFixed(2).replace('.', ',')}</td>
        </tr>
      `).join('')
    : `<tr>
         <td style="text-align: center; border: 1px solid #000; padding: 6px;">1</td>
         <td style="border: 1px solid #000; padding: 6px;"><b style="font-size: 12px;">${venda.descricao || 'Produto Celular / Eletrônico'}</b></td>
         <td style="text-align: center; border: 1px solid #000; padding: 6px;">1</td>
         <td style="text-align: right; border: 1px solid #000; padding: 6px;">R$ ${(venda.valor || 0).toFixed(2).replace('.', ',')}</td>
         <td style="text-align: right; border: 1px solid #000; padding: 6px;">R$ 0,00</td>
         <td style="text-align: right; font-weight: bold; border: 1px solid #000; padding: 6px;">R$ ${(venda.valor || 0).toFixed(2).replace('.', ',')}</td>
       </tr>`;

  const valorTotalVenda = (venda.valorTotal || venda.valor || 0);
  const nomeClienteFinal = cliente?.nome || venda.clienteNome || 'Não informado';
  const nomeLoja = loja?.nome || loja?.nomeLoja || 'Phone Center';
  const enderecoLoja = loja?.endereco || loja?.enderecoLoja || 'Endereço não configurado';
  const cnpjLoja = loja?.cnpj || loja?.cnpjLoja || 'Não informado';
  const telefoneLoja = loja?.telefone || loja?.telefoneLoja || 'Não informado';

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <title>Recibo de Venda #${(venda.id || '').slice(-6).toUpperCase()}</title>
      <style>
        body { font-family: Arial, sans-serif; font-size: 11px; color: #000; margin: 0; padding: 0; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 10px; }
        th, td { border: 1px solid #000; padding: 5px; text-align: left; }
        .no-border, .no-border td { border: none; padding: 2px; }
        .section-title { background-color: #f0f0f0; font-weight: bold; text-align: center; padding: 6px 4px; font-size: 11px; text-transform: uppercase; }
        .small-text { font-size: 10px; line-height: 1.3; }
        .signature-row { display: flex; gap: 24px; justify-content: space-between; align-items: flex-end; margin-top: 20px; }
        .signature-col { width: 48%; text-align: center; }
        .signature-holder { height: 44px; display: flex; align-items: flex-end; justify-content: center; margin-bottom: -4px; }
        .signature-image { max-width: 180px; max-height: 64px; object-fit: contain; display: block; }
        .signature-line { border-top: 1px solid #000; padding-top: 6px; font-weight: 700; }
        .signature-subtitle { display: block; margin-top: 2px; font-size: 10px; font-weight: 400; }
      </style>
    </head>
    <body>
      <div style="max-width: 800px; margin: 0 auto; background-color: #ffffff; border: 1px solid #ccc; padding: 30px; border-radius: 4px;">
        <!-- Canhoto de Recebimento -->
        <table>
          <tr>
            <td colspan="3" class="section-title">RECIBO DE ${nomeLoja.toUpperCase()} - OS PRODUTOS E/OU SERVIÇOS CONSTANTES NO PEDIDO</td>
          </tr>
          <tr>
            <td style="width: 30%;">Data de recebimento<br><br>___/___/______</td>
            <td style="width: 40%;">Identificação e assinatura do recebedor<br><br>_________________________________________</td>
            <td style="width: 30%; text-align: center;">Recibo da venda:<br><b>#${(venda.id || '').slice(-6).toUpperCase()}</b></td>
          </tr>
        </table>

        <hr style="border-top: 1px dashed #000; margin: 15px 0;">

        <!-- Dados da Empresa -->
        <table class="no-border" style="margin-bottom: 18px;">
          <tr>
            <td style="width: 150px; vertical-align: top;">${logoHtml}</td>
            <td style="vertical-align: top; padding-left: 8px;">
              <h2 style="margin: 0 0 5px 0; font-size: 16px;">${nomeLoja}</h2>
              <div class="small-text">${enderecoLoja}</div>
              <div class="small-text">CPF/CNPJ: ${cnpjLoja} | Tel: ${telefoneLoja}</div>
            </td>
            <td style="text-align: right; vertical-align: top; font-size: 11px;">
              Data: ${dataAtual} às ${horaAtual}<br>
              VENDEDOR: ${venda.vendedor || 'Não informado'}<br>
              <b>RECIBO DA VENDA: #${(venda.id || '').slice(-6).toUpperCase()}</b>
            </td>
          </tr>
        </table>

        <!-- Dados do Cliente -->
        <table>
          <tr><td colspan="4" class="section-title">DESTINATÁRIO / CLIENTE</td></tr>
          <tr>
            <td style="width: 40%;">Nome/Razão social<br><b>${nomeClienteFinal}</b></td>
            <td style="width: 20%;">Telefone<br>${cliente?.telefone || 'N/A'}</td>
            <td style="width: 20%;">CPF/CNPJ<br>${cliente?.cpf || 'N/A'}</td>
            <td style="width: 20%;">E-mail<br>${cliente?.email || 'N/A'}</td>
          </tr>
        </table>

        <!-- Produtos e Detalhes do Aparelho -->
        <table>
          <tr><td colspan="6" class="section-title">DADOS DO PRODUTO / APARELHO</td></tr>
          <tr style="font-weight: bold; text-align: center; background-color: #fafafa;">
            <td style="width: 8%;">Cód</td>
            <td style="width: 47%; text-align: left;">Descrição do Aparelho (Marca, Modelo, Capacidade, Cor, IMEI)</td>
            <td style="width: 5%;">Qtd</td>
            <td style="width: 13%;">Valor Unit.</td>
            <td style="width: 12%;">Desconto</td>
            <td style="width: 15%;">Valor Total</td>
          </tr>
          ${itensHtmlA4}
          <tr>
            <td colspan="5" style="text-align: right; font-weight: bold; font-size: 12px;">TOTAL DA VENDA</td>
            <td style="text-align: right; font-weight: bold; font-size: 12px;">R$ ${valorTotalVenda.toFixed(2).replace('.', ',')}</td>
          </tr>
        </table>

        <!-- Formas de Pagamento -->
        <table>
          <tr><td class="section-title">FORMA(S) DE PAGAMENTO & STATUS</td></tr>
          <tr>
            <td style="font-size: 11px; padding: 8px; background-color: #fafafa;">
              <div style="display: flex; justify-content: space-between; align-items: center;">
                <div>
                  <b>Forma(s) de Pagamento:</b> <span style="color: #000; font-weight: bold;">${pagamentosTexto}</span>
                </div>
                <div>
                  <b>Status:</b> <span style="color: green; font-weight: bold;">${venda.status === 'pago' ? 'PAGO / CONCLUÍDO' : 'PENDENTE'}</span>
                </div>
              </div>
            </td>
          </tr>
        </table>

        <!-- Termos de Garantia -->
        <div style="margin-top: 10px; margin-bottom: 8px; padding: 10px; border: 1px solid #000;">
          <div style="font-weight: bold; margin-bottom: 6px;">TERMO DE GARANTIA</div>
          <div class="small-text">Garantia de <b>${venda.garantia || '90 dias'}</b> a partir da data da compra. Válida somente para serviços e peças fornecidos pela empresa.</div>
          <div class="small-text" style="margin-top: 6px;">Esta garantia não cobre:</div>
          <ul class="small-text" style="margin: 4px 0 0 16px; padding: 0; list-style: disc inside;">
            <li>Queda, umidade, líquidos ou danos acidentais;</li>
            <li>Uso indevido, instalação incorreta ou violação do produto;</li>
            <li>Abertura ou tentativa de conserto por terceiros não autorizados;</li>
            <li>Não pode molhar e não pode abrir o aparelho.</li>
          </ul>
          <div class="small-text" style="margin-top: 6px;"><b>Apresente este recibo junto com o equipamento no atendimento.</b></div>
        </div>

        <!-- Assinaturas -->
        <div class="signature-row">
          <div class="signature-col">
            <div class="signature-holder"></div>
            <div class="signature-line">
              Assinatura do Cliente
              <span class="signature-subtitle">${nomeClienteFinal}</span>
            </div>
          </div>
          <div class="signature-col">
            <div class="signature-holder">
              ${assinaturaEmpresaUrl ? `<img src="${assinaturaEmpresaUrl}" alt="Assinatura da loja" class="signature-image" onerror="this.style.display='none'" />` : ''}
            </div>
            <div class="signature-line">
              Assinatura / Carimbo da Loja
              <span class="signature-subtitle">${nomeLoja}</span>
            </div>
          </div>
        </div>
        <div style="text-align: center; margin-top: 16px; font-weight: bold;">
          OBRIGADO PELA PREFERÊNCIA!
        </div>
      </div>
      ${isForEmail ? '' : '<script>window.onload = function() { window.print(); window.onafterprint = function(){ window.close(); } };</script>'}
    </body>
    </html>
  `;
}
