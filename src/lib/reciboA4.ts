export function generateReciboA4Html(venda: any, loja: any, cliente: any, isForEmail: boolean = false) {
  const dataAtual = venda.dataPagamento
    ? new Date(venda.dataPagamento).toLocaleDateString('pt-BR')
    : new Date().toLocaleDateString('pt-BR');

  const assinaturaEmpresaUrl = loja?.assinatura_url || loja?.assinaturaLoja;
  const logoUrl = loja?.logo_url || loja?.logoLoja;
  const logoHtml = logoUrl ? `<img src="${logoUrl}" style="max-height: 80px; max-width: 140px; display: block;" />` : '';

  const itensHtmlA4 = venda.itens && venda.itens.length > 0
    ? venda.itens.map((item: any) => `
        <tr>
          <td style="text-align: center; border: 1px solid #000; padding: 5px;">${item.codigo || ''}</td>
          <td style="border: 1px solid #000; padding: 5px;">${item.descricao} <br><small style="color: #666;">${item.observacao || ''}</small></td>
          <td style="text-align: center; border: 1px solid #000; padding: 5px;">${item.quantidade || 1}</td>
          <td style="text-align: right; border: 1px solid #000; padding: 5px;">R$ ${(item.valorExibir || item.valor || 0).toFixed(2).replace('.', ',')}</td>
          <td style="text-align: right; border: 1px solid #000; padding: 5px;">R$ ${(item.desconto || 0).toFixed(2).replace('.', ',')}</td>
          <td style="text-align: right; font-weight: bold; border: 1px solid #000; padding: 5px;">R$ ${(item.total || item.valor || 0).toFixed(2).replace('.', ',')}</td>
        </tr>
      `).join('')
    : `<tr>
         <td style="text-align: center; border: 1px solid #000; padding: 5px;">-</td>
         <td style="border: 1px solid #000; padding: 5px;">${venda.descricao || 'Produto Genérico'}</td>
         <td style="text-align: center; border: 1px solid #000; padding: 5px;">1</td>
         <td style="text-align: right; border: 1px solid #000; padding: 5px;">R$ ${(venda.valor || 0).toFixed(2).replace('.', ',')}</td>
         <td style="text-align: right; border: 1px solid #000; padding: 5px;">R$ 0,00</td>
         <td style="text-align: right; font-weight: bold; border: 1px solid #000; padding: 5px;">R$ ${(venda.valor || 0).toFixed(2).replace('.', ',')}</td>
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
        .section-title { background-color: #f0f0f0; font-weight: bold; text-align: center; padding: 6px 4px; }
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
            <td style="width: 30%; text-align: center;">Recibo da venda:<br><b>${venda.id || ''}</b></td>
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
              Data: ${dataAtual}<br>
              VENDEDOR: ${venda.vendedor || 'Não informado'}<br>
              <b>RECIBO DA VENDA: ${venda.id || ''}</b>
            </td>
          </tr>
        </table>

        <!-- Dados do Cliente -->
        <table>
          <tr><td colspan="4" class="section-title">DESTINATÁRIO/REMETENTE</td></tr>
          <tr>
            <td style="width: 40%;">Nome/Razão social<br><b>${nomeClienteFinal}</b></td>
            <td style="width: 20%;">Telefone<br>${cliente?.telefone || 'N/A'}</td>
            <td style="width: 20%;">CPF/CNPJ<br>${cliente?.cpf || 'N/A'}</td>
            <td style="width: 20%;">E-mail<br>${cliente?.email || 'N/A'}</td>
          </tr>
        </table>

        <!-- Produtos -->
        <table>
          <tr><td colspan="6" class="section-title">DADOS DO PRODUTO</td></tr>
          <tr style="font-weight: bold; text-align: center;">
            <td style="width: 10%;">Cód</td>
            <td style="width: 45%; text-align: left;">Produto</td>
            <td style="width: 5%;">Qtd</td>
            <td style="width: 15%;">Valor Unitário</td>
            <td style="width: 10%;">Desconto</td>
            <td style="width: 15%;">Valor Total</td>
          </tr>
          ${itensHtmlA4}
          <tr>
            <td colspan="5" style="text-align: right; font-weight: bold;">Total</td>
            <td style="text-align: right; font-weight: bold;">R$ ${valorTotalVenda.toFixed(2).replace('.', ',')}</td>
          </tr>
        </table>

        <!-- Termos de Garantia -->
        <div style="margin-top: 10px; margin-bottom: 8px; padding: 10px; border: 1px solid #000;">
          <div style="font-weight: bold; margin-bottom: 6px;">TERMO DE GARANTIA</div>
          <div class="small-text">Garantia de ${venda.garantia || '90 dias'} a partir da data da compra. Válida somente para serviços e peças fornecidos pela empresa.</div>
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
          OBRIGADO PELA PREFERÊNCIA.
        </div>
      </div>
      ${isForEmail ? '' : '<script>window.onload = function() { window.print(); window.onafterprint = function(){ window.close(); } };</script>'}
    </body>
    </html>
  `;
}
