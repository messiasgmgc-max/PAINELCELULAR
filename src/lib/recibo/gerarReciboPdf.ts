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
 * Gera o Recibo A4 oficial fiel ao modelo do sistema (src/lib/reciboA4.ts).
 * Contém o Canhoto de recebimento, cabeçalho da loja, dados do cliente,
 * tabela de produtos/aparelhos com IMEI, termo oficial de garantia de 90 dias e assinaturas.
 */
export async function gerarReciboPdfBuffer(dados: DadosReciboPdf): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'A4',
        margin: 30,
        info: {
          Title: `Recibo #${dados.codigoVenda} - ${dados.loja.nome}`,
          Author: dados.loja.nome,
          Subject: 'Recibo de Venda e Termo de Garantia',
        },
      });

      const buffers: Buffer[] = [];
      doc.on('data', (chunk) => buffers.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(buffers)));
      doc.on('error', (err) => reject(err));

      const x = 30;
      const w = 535;
      const nomeLoja = dados.loja.nome || 'Phone Center';
      const codigoVenda = dados.codigoVenda;
      const nomeCliente = dados.cliente.nome || 'Não informado';

      // ─────────────────────────────────────────────────────────────
      // 1. CANHOTO DE RECEBIMENTO (Fiel ao cabeçalho de reciboA4.ts)
      // ─────────────────────────────────────────────────────────────
      doc.rect(x, 25, w, 52).stroke('#000000');
      doc.rect(x, 25, w, 15).fillAndStroke('#f0f0f0', '#000000');

      doc.fillColor('#000000').fontSize(7.5).font('Helvetica-Bold');
      doc.text(`RECIBO DE ${nomeLoja.toUpperCase()} - OS PRODUTOS E/OU SERVIÇOS CONSTANTES NO PEDIDO`, x, 29, {
        align: 'center',
        width: w,
      });

      // Linhas divisórias das 3 colunas do canhoto
      doc.moveTo(x + 160, 40).lineTo(x + 160, 77).stroke('#000000');
      doc.moveTo(x + 395, 40).lineTo(x + 395, 77).stroke('#000000');

      doc.fillColor('#000000').fontSize(7).font('Helvetica');
      doc.text('Data de recebimento\n\n___/___/______', x + 6, 44, { width: 150 });
      doc.text('Identificação e assinatura do recebedor\n\n_________________________________________', x + 166, 44, {
        width: 220,
      });

      doc.fontSize(7.5).font('Helvetica');
      doc.text('Recibo da venda:', x + 400, 46, { width: 130, align: 'center' });
      doc.fontSize(10).font('Helvetica-Bold');
      doc.text(`#${codigoVenda}`, x + 400, 58, { width: 130, align: 'center' });

      // Linha pontilhada separando o canhoto do corpo do recibo
      doc.dash(4, { space: 3 }).moveTo(x, 86).lineTo(x + w, 86).stroke('#000000').undash();

      // ─────────────────────────────────────────────────────────────
      // 2. DADOS DA EMPRESA / CABEÇALHO DO PEDIDO
      // ─────────────────────────────────────────────────────────────
      let y = 96;

      doc.fillColor('#000000').fontSize(14).font('Helvetica-Bold');
      doc.text(nomeLoja, x, y, { width: 330 });

      doc.fontSize(8).font('Helvetica');
      const enderecoLoja = dados.loja.endereco || dados.loja.cidade || 'Endereço da loja';
      doc.text(enderecoLoja, x, y + 17, { width: 330 });

      const infoEmpresa = [
        dados.loja.cnpj ? `CPF/CNPJ: ${dados.loja.cnpj}` : null,
        dados.loja.telefone ? `Tel: ${dados.loja.telefone}` : null,
      ]
        .filter(Boolean)
        .join(' | ') || 'Telefone não informado';
      doc.text(infoEmpresa, x, y + 28, { width: 330 });

      // Lado direito: Data, Vendedor e Código
      const dataHoraFmt = dados.dataEmissao || new Date().toLocaleString('pt-BR');
      doc.fontSize(8).font('Helvetica');
      doc.text(`Data: ${dataHoraFmt}`, x + 330, y + 4, { align: 'right', width: 205 });
      doc.text(`VENDEDOR: ${dados.vendedor || 'Não informado'}`, x + 330, y + 16, { align: 'right', width: 205 });
      doc.fontSize(9).font('Helvetica-Bold');
      doc.text(`RECIBO DA VENDA: #${codigoVenda}`, x + 330, y + 28, { align: 'right', width: 205 });

      y += 48;

      // ─────────────────────────────────────────────────────────────
      // 3. TABELA DESTINATÁRIO / CLIENTE
      // ─────────────────────────────────────────────────────────────
      doc.rect(x, y, w, 14).fillAndStroke('#f0f0f0', '#000000');
      doc.fillColor('#000000').fontSize(8).font('Helvetica-Bold');
      doc.text('DESTINATÁRIO / CLIENTE', x, y + 3, { align: 'center', width: w });
      y += 14;

      doc.rect(x, y, w, 28).stroke('#000000');
      doc.moveTo(x + 220, y).lineTo(x + 220, y + 28).stroke('#000000');
      doc.moveTo(x + 325, y).lineTo(x + 325, y + 28).stroke('#000000');
      doc.moveTo(x + 430, y).lineTo(x + 430, y + 28).stroke('#000000');

      doc.fillColor('#000000').fontSize(7).font('Helvetica');
      doc.text('Nome/Razão social', x + 5, y + 3);
      doc.fontSize(8).font('Helvetica-Bold');
      doc.text(nomeCliente, x + 5, y + 13, { width: 210, ellipsis: true });

      doc.fontSize(7).font('Helvetica');
      doc.text('Telefone', x + 225, y + 3);
      doc.fontSize(8).font('Helvetica-Bold');
      doc.text(dados.cliente.telefone || 'N/A', x + 225, y + 13);

      doc.fontSize(7).font('Helvetica');
      doc.text('CPF/CNPJ', x + 330, y + 3);
      doc.fontSize(8).font('Helvetica-Bold');
      doc.text(dados.cliente.cpf || 'N/A', x + 330, y + 13);

      doc.fontSize(7).font('Helvetica');
      doc.text('E-mail', x + 435, y + 3);
      doc.fontSize(8).font('Helvetica-Bold');
      doc.text(dados.cliente.email || 'N/A', x + 435, y + 13, { width: 95, ellipsis: true });

      y += 34;

      // ─────────────────────────────────────────────────────────────
      // 4. TABELA DADOS DO PRODUTO / APARELHO
      // ─────────────────────────────────────────────────────────────
      doc.rect(x, y, w, 14).fillAndStroke('#f0f0f0', '#000000');
      doc.fillColor('#000000').fontSize(8).font('Helvetica-Bold');
      doc.text('DADOS DO PRODUTO / APARELHO', x, y + 3, { align: 'center', width: w });
      y += 14;

      // Cabeçalho das colunas de produtos
      const colW = { cod: 28, desc: 272, qtd: 30, unit: 65, descVal: 55, tot: 85 };
      doc.rect(x, y, w, 15).fillAndStroke('#fafafa', '#000000');
      doc.fillColor('#000000').fontSize(7.5).font('Helvetica-Bold');

      doc.text('Cód', x, y + 4, { width: colW.cod, align: 'center' });
      doc.text('Descrição do Aparelho (Marca, Modelo, Capacidade, Cor, IMEI)', x + colW.cod + 4, y + 4, {
        width: colW.desc,
      });
      doc.text('Qtd', x + colW.cod + colW.desc, y + 4, { width: colW.qtd, align: 'center' });
      doc.text('Valor Unit.', x + colW.cod + colW.desc + colW.qtd, y + 4, { width: colW.unit, align: 'right' });
      doc.text('Desconto', x + colW.cod + colW.desc + colW.qtd + colW.unit, y + 4, {
        width: colW.descVal,
        align: 'right',
      });
      doc.text('Valor Total', x + colW.cod + colW.desc + colW.qtd + colW.unit + colW.descVal, y + 4, {
        width: colW.tot - 4,
        align: 'right',
      });
      y += 15;

      // Linha do Item Vendido
      const altLinhaItem = 34;
      doc.rect(x, y, w, altLinhaItem).stroke('#000000');

      doc.fillColor('#000000').fontSize(8).font('Helvetica');
      doc.text('1', x, y + 6, { width: colW.cod, align: 'center' });

      const modCompleto = `${dados.aparelho.modelo} ${dados.aparelho.capacidade || ''} ${dados.aparelho.cor || ''}`.trim();
      doc.fontSize(8.5).font('Helvetica-Bold');
      doc.text(modCompleto, x + colW.cod + 4, y + 6, { width: colW.desc - 6 });

      if (dados.aparelho.imei) {
        doc.fontSize(7.5).font('Helvetica-Bold');
        doc.text(`📱 IMEI / Serial: ${dados.aparelho.imei}`, x + colW.cod + 4, y + 19, { width: colW.desc - 6 });
      }

      doc.fontSize(8).font('Helvetica');
      doc.text('1', x + colW.cod + colW.desc, y + 10, { width: colW.qtd, align: 'center' });
      doc.text(formatarMoeda(dados.aparelho.valor), x + colW.cod + colW.desc + colW.qtd, y + 10, {
        width: colW.unit,
        align: 'right',
      });
      doc.text('R$ 0,00', x + colW.cod + colW.desc + colW.qtd + colW.unit, y + 10, {
        width: colW.descVal,
        align: 'right',
      });

      doc.fontSize(8.5).font('Helvetica-Bold');
      doc.text(formatarMoeda(dados.aparelho.valor), x + colW.cod + colW.desc + colW.qtd + colW.unit + colW.descVal, y + 10, {
        width: colW.tot - 4,
        align: 'right',
      });
      y += altLinhaItem;

      // Linha especial de Trade-In (se houver upgrade)
      const temUpgrade = Boolean(
        dados.upgrade && dados.upgrade.ativo && (dados.upgrade.valor || dados.upgrade.modelo)
      );

      if (temUpgrade) {
        const altLinhaTroca = 32;
        doc.rect(x, y, w, altLinhaTroca).fillAndStroke('#f0fdf4', '#000000');

        doc.fillColor('#166534').fontSize(9).font('Helvetica-Bold');
        doc.text('🔁', x, y + 8, { width: colW.cod, align: 'center' });

        doc.fontSize(7.5).font('Helvetica-Bold');
        doc.text('ENTRADA: APARELHO RECEBIDO NA TROCA (UPGRADE)', x + colW.cod + 4, y + 4, { width: colW.desc - 6 });

        const descTroca = `${dados.upgrade?.modelo || 'Aparelho na Troca'}${dados.upgrade?.imei ? ` (IMEI: ${dados.upgrade.imei})` : ''}`;
        doc.fillColor('#000000').fontSize(7.5).font('Helvetica');
        doc.text(descTroca, x + colW.cod + 4, y + 16, { width: colW.desc - 6 });

        doc.text('1', x + colW.cod + colW.desc, y + 10, { width: colW.qtd, align: 'center' });

        const valTrocaFmt = `- ${formatarMoeda(dados.upgrade?.valor || 0)}`;
        doc.fillColor('#166534').fontSize(8).font('Helvetica-Bold');
        doc.text(valTrocaFmt, x + colW.cod + colW.desc + colW.qtd, y + 10, { width: colW.unit, align: 'right' });
        doc.text('-', x + colW.cod + colW.desc + colW.qtd + colW.unit, y + 10, { width: colW.descVal, align: 'center' });
        doc.text(valTrocaFmt, x + colW.cod + colW.desc + colW.qtd + colW.unit + colW.descVal, y + 10, {
          width: colW.tot - 4,
          align: 'right',
        });
        y += altLinhaTroca;

        // Subtotais de Upgrade
        doc.rect(x, y, w, 15).stroke('#000000');
        doc.fillColor('#475569').fontSize(7.5).font('Helvetica-Bold');
        doc.text('SUBTOTAL (APARELHO ADQUIRIDO)', x, y + 4, { width: w - colW.tot - 8, align: 'right' });
        doc.text(formatarMoeda(dados.pagamento.valorTotal), x + w - colW.tot, y + 4, {
          width: colW.tot - 4,
          align: 'right',
        });
        y += 15;

        doc.rect(x, y, w, 15).stroke('#000000');
        doc.fillColor('#166534').fontSize(7.5).font('Helvetica-Bold');
        doc.text('(-) ENTRADA BASE DE TROCA (UPGRADE)', x, y + 4, { width: w - colW.tot - 8, align: 'right' });
        doc.text(`- ${formatarMoeda(dados.upgrade?.valor || 0)}`, x + w - colW.tot, y + 4, {
          width: colW.tot - 4,
          align: 'right',
        });
        y += 15;

        doc.rect(x, y, w, 16).fillAndStroke('#fafafa', '#000000');
        doc.fillColor('#000000').fontSize(8.5).font('Helvetica-Bold');
        doc.text('(=) TOTAL LÍQUIDO PAGO / VOLTA', x, y + 4, { width: w - colW.tot - 8, align: 'right' });
        doc.text(formatarMoeda(dados.pagamento.valorFinal), x + w - colW.tot, y + 4, {
          width: colW.tot - 4,
          align: 'right',
        });
        y += 16;
      } else {
        // Venda sem upgrade - Total Direto
        doc.rect(x, y, w, 16).stroke('#000000');
        doc.fillColor('#000000').fontSize(8.5).font('Helvetica-Bold');
        doc.text('TOTAL DA VENDA', x, y + 4, { width: w - colW.tot - 8, align: 'right' });
        doc.text(formatarMoeda(dados.pagamento.valorTotal), x + w - colW.tot, y + 4, {
          width: colW.tot - 4,
          align: 'right',
        });
        y += 16;
      }

      y += 8;

      // ─────────────────────────────────────────────────────────────
      // 5. FORMA(S) DE PAGAMENTO & STATUS
      // ─────────────────────────────────────────────────────────────
      doc.rect(x, y, w, 14).fillAndStroke('#f0f0f0', '#000000');
      doc.fillColor('#000000').fontSize(8).font('Helvetica-Bold');
      doc.text('FORMA(S) DE PAGAMENTO & STATUS', x, y + 3, { align: 'center', width: w });
      y += 14;

      doc.rect(x, y, w, 22).fillAndStroke('#fafafa', '#000000');
      doc.fillColor('#000000').fontSize(8).font('Helvetica');
      doc.text('Forma(s) de Pagamento: ', x + 10, y + 6, { continued: true });
      doc.font('Helvetica-Bold').text(dados.pagamento.forma.toUpperCase());

      doc.fontSize(8).font('Helvetica-Bold').fillColor('#16a34a');
      doc.text('Status: PAGO / CONCLUÍDO', x + 350, y + 6, { align: 'right', width: 175 });

      y += 28;

      // ─────────────────────────────────────────────────────────────
      // 6. TERMO DE GARANTIA (Texto oficial de reciboA4.ts)
      // ─────────────────────────────────────────────────────────────
      const diasGar = dados.diasGarantia || 90;
      doc.rect(x, y, w, 92).stroke('#000000');

      doc.fillColor('#000000').fontSize(8.5).font('Helvetica-Bold');
      doc.text('TERMO DE GARANTIA', x + 10, y + 8);

      doc.fontSize(7.5).font('Helvetica');
      doc.text(
        `Garantia de ${diasGar} dias a partir da data da compra. Válida somente para serviços e peças fornecidos pela empresa.`,
        x + 10,
        y + 22
      );
      doc.text('Esta garantia não cobre:', x + 10, y + 33);

      doc.text('• Queda, umidade, líquidos ou danos acidentais;', x + 18, y + 43);
      doc.text('• Uso indevido, instalação incorreta ou violação do produto;', x + 18, y + 53);
      doc.text('• Abertura ou tentativa de conserto por terceiros não autorizados;', x + 18, y + 63);
      doc.text('• Não pode molhar e não pode abrir o aparelho.', x + 18, y + 73);

      doc.fontSize(7.5).font('Helvetica-Bold');
      doc.text('Apresente este recibo junto com o equipamento no atendimento.', x + 10, y + 84);

      y += 104;

      // ─────────────────────────────────────────────────────────────
      // 7. ASSINATURAS (CLIENTE E LOJA)
      // ─────────────────────────────────────────────────────────────
      y = Math.min(y + 25, 730);

      doc.strokeColor('#000000').lineWidth(1);
      doc.moveTo(x + 40, y).lineTo(x + 220, y).stroke();
      doc.moveTo(x + 315, y).lineTo(x + 495, y).stroke();

      doc.fillColor('#000000').fontSize(8).font('Helvetica-Bold');
      doc.text('Assinatura do Cliente', x + 40, y + 5, { width: 180, align: 'center' });
      doc.fontSize(7.5).font('Helvetica');
      doc.text(nomeCliente, x + 40, y + 15, { width: 180, align: 'center' });

      doc.fontSize(8).font('Helvetica-Bold');
      doc.text('Assinatura / Carimbo da Loja', x + 315, y + 5, { width: 180, align: 'center' });
      doc.fontSize(7.5).font('Helvetica');
      doc.text(nomeLoja, x + 315, y + 15, { width: 180, align: 'center' });

      // ─────────────────────────────────────────────────────────────
      // 8. RODAPÉ DE AGRADECIMENTO & LINK PÚBLICO
      // ─────────────────────────────────────────────────────────────
      doc.fontSize(9).font('Helvetica-Bold');
      doc.text('OBRIGADO PELA PREFERÊNCIA!', x, y + 35, { align: 'center', width: w });

      if (dados.linkRecibo) {
        doc.fillColor('#64748b').fontSize(7).font('Helvetica');
        doc.text(`Recibo Digital e Validação: ${dados.linkRecibo}`, x, 792, { align: 'center', width: w });
      }

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}
