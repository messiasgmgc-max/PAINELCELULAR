import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/integrations/supabase/server';
import { FocusNFeClient } from '@/lib/fiscal/focusNfeClient';
import { obterDadosFiscaisLoja, salvarRegistroNotaFiscal } from '@/lib/fiscal/fiscalService';

export async function GET(req: NextRequest, { params }: { params: { id: string } | Promise<{ id: string }> }) {
  try {
    const resolvedParams = await Promise.resolve(params);
    const vendaId = resolvedParams?.id;
    if (!vendaId) {
      return NextResponse.json({ sucesso: false, mensagem: 'ID não fornecido' }, { status: 400 });
    }

    // Busca o registro atual no banco
    const { data: nota, error } = await supabaseAdmin
      .from('notas_fiscais')
      .select('*')
      .eq('venda_id', vendaId)
      .order('created_at', { ascending: false })
      .maybeSingle();

    if (!nota) {
      return NextResponse.json({
        sucesso: false,
        status: 'pendente',
        mensagem: 'Nenhuma nota fiscal encontrada para esta venda.'
      }, { status: 404 });
    }

    // Se a nota ainda está como "processando", consulta na Focus NFe para atualizar o status
    if (nota.status === 'processando' && nota.loja_id) {
      const dadosFiscais = await obterDadosFiscaisLoja(nota.loja_id);
      if (dadosFiscais && dadosFiscais.ativo) {
        const client = new FocusNFeClient(dadosFiscais.focus_token, dadosFiscais.ambiente);
        const referenciaUnica = `PC-${(nota.tipo || 'nfce').toUpperCase()}-${vendaId}`;
        const consulta = await client.consultarNota(nota.tipo || 'nfce', referenciaUnica);

        if (consulta.status === 'autorizado') {
          const danfeUrl = client.getDanfeUrl(consulta.caminho_danfe);
          const xmlUrl = client.getXmlUrl(consulta.caminho_xml_nota);

          await salvarRegistroNotaFiscal({
            loja_id: nota.loja_id,
            venda_id: vendaId,
            tipo: nota.tipo,
            status: 'autorizada',
            numero: consulta.numero,
            serie: consulta.serie,
            chave_acesso: consulta.chave_nfe || consulta.chave,
            protocolo: consulta.protocolo,
            mensagem_sefaz: consulta.mensagem_sefaz,
            url_danfe: danfeUrl,
            url_xml: xmlUrl,
            caminho_danfe: consulta.caminho_danfe,
            caminho_xml_nota: consulta.caminho_xml_nota,
            retorno_sefaz: consulta
          });

          return NextResponse.json({
            sucesso: true,
            status: 'autorizada',
            chaveAcesso: consulta.chave_nfe || consulta.chave,
            numero: consulta.numero,
            serie: consulta.serie,
            urlDanfe: danfeUrl,
            urlXml: xmlUrl,
            mensagem: 'Nota autorizada pela SEFAZ.'
          });
        }
      }
    }

    return NextResponse.json({
      sucesso: nota.status === 'autorizada',
      status: nota.status,
      chaveAcesso: nota.chave_acesso,
      numero: nota.numero,
      serie: nota.serie,
      urlDanfe: nota.url_danfe,
      urlXml: nota.url_xml,
      caminhoDanfe: nota.caminho_danfe,
      caminhoXml: nota.caminho_xml_nota,
      mensagem: nota.mensagem_sefaz || `Nota com status: ${nota.status}`
    });
  } catch (error: any) {
    console.error('Erro na rota /api/fiscal/status/[id]:', error);
    return NextResponse.json({
      sucesso: false,
      mensagem: error?.message || 'Erro ao consultar status fiscal'
    }, { status: 500 });
  }
}
