import PDFDocument from 'pdfkit';

export interface DadosReciboPdf {
  vendaId: string;
  codigoVenda: string;
  dataEmissao?: string;
  loja: {
    nome: string;
    cnpj?: string | null;
    telefone?: string | null;
    endereco?: string | null;
    cidade?: string | null;
  };
  cliente: {
    nome: string;
    cpf?: string | null;
    telefone?: string | null;
    email?: string | null;
    endereco?: string | null;
  };
  aparelho: {
    modelo: string;
    capacidade?: string | null;
    cor?: string | null;
    imei?: string | null;
    condicao?: string | null;
    valor: number;
  };
  upgrade?: {
    ativo: boolean;
    modelo?: string | null;
    imei?: string | null;
    valor?: number | null;
  } | null;
  pagamento: {
    forma: string;
    valorTotal: number;
    valorEntrada?: number | null;
    valorFinal: number;
  };
  diasGarantia?: number;
  vendedor?: string | null;
  linkRecibo?: string | null;
}

function formatarMoeda(valor: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(
    Number.isFinite(valor) ? valor : 0
  );
}

/**
 * Gera um documento PDF em tamanho A4 para impressão imediata ou envio via WhatsApp.
 */
export async function gerarReciboPdfBuffer(dados: DadosReciboPdf): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'A4',
        margin: 36,
        info: {
          Title: `Recibo #${dados.codigoVenda} - ${dados.loja.nome}`,
          Author: dados.loja.nome,
          Subject: 'Recibo de Compra e Termo de Garantia',
        },
      });

      const buffers: Buffer[] = [];
      doc.on('data', (chunk) => buffers.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(buffers)));
      doc.on('error', (err) => reject(err));

      const azulEscuro = '#0f172a';
      const cinzaTexto = '#334155';
      const cinzaBorda = '#cbd5e1';
      const cinzaFundo = '#f8fafc';
      const verdeDestaque = '#16a34a';

      // ── CABEÇALHO ──
      doc.rect(36, 36, 523, 60).fillAndStroke(cinzaFundo, cinzaBorda);

      doc.fillColor(azulEscuro).fontSize(16).font('Helvetica-Bold');
      doc.text(dados.loja.nome.toUpperCase(), 48, 46, { width: 330 });

      doc.fillColor(cinzaTexto).fontSize(9).font('Helvetica');
      const infoLoja = [
        dados.loja.cnpj ? `CNPJ: ${dados.loja.cnpj}` : null,
        dados.loja.telefone ? `Tel: ${dados.loja.telefone}` : null,
        dados.loja.endereco || dados.loja.cidade || null,
      ]
        .filter(Boolean)
        .join(' | ');

      if (infoLoja) {
        doc.text(infoLoja, 48, 68, { width: 330 });
      }

      // Caixa da Venda / Data à direita
      doc.fillColor(verdeDestaque).fontSize(12).font('Helvetica-Bold');
      doc.text(`VENDA #${dados.codigoVenda}`, 390, 46, { align: 'right', width: 155 });

      const dataFmt = dados.dataEmissao || new Date().toLocaleString('pt-BR');
      doc.fillColor(cinzaTexto).fontSize(8).font('Helvetica');
      doc.text(`Data: ${dataFmt}`, 390, 64, { align: 'right', width: 155 });
      if (dados.vendedor) {
        doc.text(`Atendente: ${dados.vendedor}`, 390, 76, { align: 'right', width: 155 });
      }

      let yPos = 108;

      // ── TÍTULO DO DOCUMENTO ──
      doc.fillColor(azulEscuro).fontSize(12).font('Helvetica-Bold');
      doc.text('RECIBO DE COMPRA & CERTIFICADO DE GARANTIA', 36, yPos, { align: 'center', width: 523 });
      yPos += 22;

      // ── DADOS DO CLIENTE ──
      doc.rect(36, yPos, 523, 62).fillAndStroke(cinzaFundo, cinzaBorda);
      doc.fillColor(azulEscuro).fontSize(9).font('Helvetica-Bold');
      doc.text('DADOS DO CLIENTE', 46, yPos + 8);

      doc.fillColor(cinzaTexto).fontSize(9).font('Helvetica');
      doc.text(`Nome: ${dados.cliente.nome || 'Não informado'}`, 46, yPos + 24);
      doc.text(`CPF: ${dados.cliente.cpf || 'Não informado'}`, 320, yPos + 24);
      doc.text(`Telefone: ${dados.cliente.telefone || 'Não informado'}`, 46, yPos + 40);
      if (dados.cliente.endereco) {
        doc.text(`Endereço: ${dados.cliente.endereco}`, 320, yPos + 40, { width: 220, ellipsis: true });
      }
      yPos += 72;

      // ── DETALHES DO APARELHO VENDIDO ──
      doc.rect(36, yPos, 523, 76).fillAndStroke('#ffffff', cinzaBorda);
      doc.rect(36, yPos, 523, 20).fillAndStroke('#f1f5f9', cinzaBorda);

      doc.fillColor(azulEscuro).fontSize(9).font('Helvetica-Bold');
      doc.text('APARELHO / PRODUTO ADQUIRIDO', 46, yPos + 5);

      const modCompleto = `${dados.aparelho.modelo} ${dados.aparelho.capacidade || ''} ${dados.aparelho.cor ? `(${dados.aparelho.cor})` : ''}`.trim();
      doc.fillColor(azulEscuro).fontSize(11).font('Helvetica-Bold');
      doc.text(modCompleto, 46, yPos + 28);

      doc.fillColor(cinzaTexto).fontSize(9).font('Helvetica');
      doc.text(`Condição: ${dados.aparelho.condicao || 'Seminovo'}`, 46, yPos + 44);
      doc.text(`IMEI / Serial: ${dados.aparelho.imei || 'Não informado'}`, 46, yPos + 58);

      doc.fillColor(verdeDestaque).fontSize(12).font('Helvetica-Bold');
      doc.text(formatarMoeda(dados.aparelho.valor), 380, yPos + 38, { align: 'right', width: 165 });
      yPos += 86;

      // ── APARELHO NA TROCA / UPGRADE (SE HOUVER) ──
      if (dados.upgrade && dados.upgrade.ativo && (dados.upgrade.modelo || dados.upgrade.valor)) {
        doc.rect(36, yPos, 523, 50).fillAndStroke('#fffbeb', '#fde68a');
        doc.fillColor('#b45309').fontSize(9).font('Helvetica-Bold');
        doc.text('🔁 ENTRADA DE APARELHO NA TROCA (UPGRADE / TRADE-IN)', 46, yPos + 6);

        doc.fillColor(cinzaTexto).fontSize(9).font('Helvetica');
        doc.text(`Modelo recebido: ${dados.upgrade.modelo || 'Smartphone de entrada'}`, 46, yPos + 22);
        if (dados.upgrade.imei) {
          doc.text(`IMEI de entrada: ${dados.upgrade.imei}`, 46, yPos + 34);
        }

        const valEntrada = dados.upgrade.valor ? formatarMoeda(dados.upgrade.valor) : 'R$ 0,00';
        doc.fillColor('#b45309').fontSize(11).font('Helvetica-Bold');
        doc.text(`- ${valEntrada}`, 380, yPos + 22, { align: 'right', width: 165 });
        yPos += 58;
      }

      // ── RESUMO FINANCEIRO E PAGAMENTO ──
      doc.rect(36, yPos, 523, 64).fillAndStroke(cinzaFundo, cinzaBorda);
      doc.fillColor(azulEscuro).fontSize(9).font('Helvetica-Bold');
      doc.text('PAGAMENTO & VALORES', 46, yPos + 8);

      doc.fillColor(cinzaTexto).fontSize(9).font('Helvetica');
      doc.text(`Forma de Pagamento: ${dados.pagamento.forma.toUpperCase()}`, 46, yPos + 24);
      doc.text(`Subtotal dos Itens: ${formatarMoeda(dados.pagamento.valorTotal)}`, 46, yPos + 40);

      if (dados.pagamento.valorEntrada && dados.pagamento.valorEntrada > 0) {
        doc.text(`Abatimento Entrada Troca: - ${formatarMoeda(dados.pagamento.valorEntrada)}`, 230, yPos + 40);
      }

      doc.fillColor(verdeDestaque).fontSize(14).font('Helvetica-Bold');
      doc.text(`TOTAL PAGO: ${formatarMoeda(dados.pagamento.valorFinal)}`, 320, yPos + 22, { align: 'right', width: 225 });
      yPos += 74;

      // ── TERMOS DE GARANTIA LEGAL E CONTRATUAL ──
      const diasGar = dados.diasGarantia || 90;
      doc.rect(36, yPos, 523, 110).fillAndStroke('#ffffff', cinzaBorda);
      doc.fillColor(azulEscuro).fontSize(8.5).font('Helvetica-Bold');
      doc.text(`TERMO DE GARANTIA (${diasGar} DIAS)`, 46, yPos + 6);

      doc.fillColor(cinzaTexto).fontSize(7.5).font('Helvetica');
      const textoGarantia = `1. O equipamento acima descrito possui garantia de ${diasGar} dias a contar da data de emissão deste recibo, cobrindo exclusivamente defeitos de funcionamento de componentes internos.\n2. A garantia NÃO cobre: tela trincada ou quebrada, danos causados por quedas ou impactos, contato com água, umidade ou qualquer tipo de líquido, sobretensão elétrica por carregadores não homologados, ou intervenção técnica por terceiros não autorizados.\n3. A perda dos lacres de segurança ou remoção do selo interno invalida imediatamente a garantia.\n4. Para solicitar atendimento ou acionar o suporte, apresente este documento físico ou o Recibo Digital.`;
      doc.text(textoGarantia, 46, yPos + 20, { width: 503, lineGap: 2 });
      yPos += 120;

      // ── CAMPO DE ASSINATURAS ──
      const yAssinatura = Math.min(yPos + 20, 740);

      doc.strokeColor(cinzaBorda).lineWidth(1);
      doc.moveTo(56, yAssinatura).lineTo(230, yAssinatura).stroke();
      doc.moveTo(330, yAssinatura).lineTo(504, yAssinatura).stroke();

      doc.fillColor(cinzaTexto).fontSize(8).font('Helvetica');
      doc.text(dados.loja.nome, 56, yAssinatura + 6, { width: 174, align: 'center' });
      doc.text(dados.cliente.nome || 'Assinatura do Cliente', 330, yAssinatura + 6, { width: 174, align: 'center' });

      // Link do recibo digital no rodapé
      if (dados.linkRecibo) {
        doc.fillColor('#64748b').fontSize(7).font('Helvetica');
        doc.text(`Recibo Digital e Autenticidade: ${dados.linkRecibo}`, 36, 785, { align: 'center', width: 523 });
      }

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}
