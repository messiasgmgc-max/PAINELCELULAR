"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { generateReciboA4Html } from "@/lib/reciboA4";
import { ShieldCheck, Printer, Share2, CheckCircle2, Building2, User, FileText, Phone, MapPin, CreditCard, Smartphone } from "lucide-react";

export default function ReciboPublicoPage() {
  const params = useParams();
  const vendaId = params?.id as string;

  const [loading, setLoading] = useState(true);
  const [venda, setVenda] = useState<any>(null);
  const [loja, setLoja] = useState<any>(null);
  const [cliente, setCliente] = useState<any>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (!vendaId) return;

    const carregarRecibo = async () => {
      setLoading(true);
      setErro(null);
      try {
        const response = await fetch(`/api/recibo/${vendaId}`);
        const data = await response.json();

        if (!response.ok || data.error || !data.venda) {
          setErro(data.error || "Recibo não encontrado ou inválido.");
          setLoading(false);
          return;
        }

        setVenda(data.venda);
        if (data.loja) setLoja(data.loja);
        if (data.cliente) setCliente(data.cliente);
      } catch (err: any) {
        console.error("Erro ao carregar recibo público:", err);
        setErro("Não foi possível carregar os detalhes do recibo.");
      } finally {
        setLoading(false);
      }
    };

    carregarRecibo();
  }, [vendaId]);

  const handleCompartilharWhatsApp = () => {
    const text = encodeURIComponent(`Olá! Confira o recibo digital da minha compra #${vendaId.slice(-6).toUpperCase()}: ${window.location.href}`);
    window.open(`https://wa.me/?text=${text}`, "_blank");
  };

  const handleImprimirReciboA4 = () => {
    const htmlA4 = generateReciboA4Html(venda, loja, cliente);
    const printWindow = window.open('', '_blank', 'width=850,height=900');
    if (printWindow) {
      printWindow.document.write(htmlA4);
      printWindow.document.close();
    } else {
      window.print();
    }
  };

  const formatarPagamentos = (vendaData: any) => {
    const metodosLabels: Record<string, string> = {
      pix: 'Pix',
      dinheiro: 'Dinheiro',
      cartao_credito: 'Cartão de Crédito',
      cartao_debito: 'Cartão de Débito',
      parcelado: 'Parcelado / Crediário',
      outros: 'Outros',
    };

    if (vendaData?.pagamentos && Array.isArray(vendaData.pagamentos) && vendaData.pagamentos.length > 0) {
      return vendaData.pagamentos.map((p: any) => {
        const label = metodosLabels[p.metodo] || p.metodo || 'Pagamento';
        const valorStr = p.valor ? ` (R$ ${Number(p.valor).toFixed(2).replace('.', ',')})` : '';
        const parcStr = p.parcelas && p.parcelas > 1 ? ` em ${p.parcelas}x` : '';
        return `${label}${parcStr}${valorStr}`;
      }).join(' + ');
    }

    const m = vendaData?.metodo || vendaData?.formaPagamento || 'pix';
    return metodosLabels[String(m).toLowerCase()] || String(m).toUpperCase();
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex flex-col items-center justify-center p-4">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-emerald-500 mb-4"></div>
        <p className="text-slate-400 text-sm animate-pulse">Carregando recibo digital...</p>
      </div>
    );
  }

  if (erro || !venda) {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex flex-col items-center justify-center p-6 text-center">
        <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center text-red-400 mb-4">
          <FileText className="w-8 h-8" />
        </div>
        <h1 className="text-2xl font-bold text-slate-100 mb-2">Recibo Indisponível</h1>
        <p className="text-slate-400 max-w-md text-sm mb-6">{erro || "Não foi possível encontrar a venda informada."}</p>
      </div>
    );
  }

  const dataFormatada = venda.dataPagamento
    ? new Date(venda.dataPagamento).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })
    : new Date().toLocaleDateString("pt-BR");

  const totalVenda = venda.valorTotal || venda.valor || 0;
  const clienteNome = cliente?.nome || venda.clienteNome || "Cliente";

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans p-4 sm:p-8 flex flex-col items-center justify-center print:bg-white print:text-black print:p-0">
      {/* Container Principal */}
      <div className="w-full max-w-2xl bg-slate-900/90 border border-slate-800 rounded-3xl shadow-2xl overflow-hidden backdrop-blur-xl print:shadow-none print:border-none print:bg-white print:rounded-none print:max-w-none">
        
        {/* Cabeçalho de Autenticidade */}
        <div className="bg-gradient-to-r from-emerald-600 to-teal-600 px-6 py-4 flex items-center justify-between text-white print:hidden">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5" />
            <span className="text-xs font-semibold uppercase tracking-wider">Comprovante Digital Autêntico</span>
          </div>
          <span className="text-xs bg-white/20 px-3 py-1 rounded-full font-mono font-bold">
            #{venda.id.slice(-6).toUpperCase()}
          </span>
        </div>

        <div className="p-6 sm:p-8 space-y-6">
          {/* Dados da Loja */}
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 pb-6 border-b border-slate-800 print:border-slate-300">
            <div className="flex items-center gap-4">
              {loja?.logo_url ? (
                <img src={loja.logo_url} alt={loja.nome} className="h-14 w-auto max-w-[140px] object-contain rounded-xl" />
              ) : (
                <div className="w-12 h-12 bg-emerald-500/10 text-emerald-400 rounded-2xl flex items-center justify-center">
                  <Building2 className="w-6 h-6" />
                </div>
              )}
              <div>
                <h1 className="text-xl font-extrabold text-white print:text-black">{loja?.nome || loja?.nomeLoja || "Phone Center"}</h1>
                {loja?.subtitulo && <p className="text-xs text-slate-400 print:text-slate-600">{loja.subtitulo}</p>}
                <div className="text-[11px] text-slate-400 print:text-slate-700 mt-1 space-y-0.5">
                  {(loja?.cnpj || loja?.cnpjLoja) && <p>CPF/CNPJ: {loja?.cnpj || loja?.cnpjLoja}</p>}
                  {(loja?.endereco || loja?.enderecoLoja) && <p className="flex items-center gap-1"><MapPin className="w-3 h-3 text-emerald-500" /> {loja?.endereco || loja?.enderecoLoja}</p>}
                  {(loja?.telefone || loja?.telefoneLoja) && <p className="flex items-center gap-1"><Phone className="w-3 h-3 text-emerald-500" /> {loja?.telefone || loja?.telefoneLoja}</p>}
                </div>
              </div>
            </div>

            <div className="text-left sm:text-right shrink-0 text-xs text-slate-400 print:text-slate-700 border-t sm:border-t-0 pt-2 sm:pt-0 w-full sm:w-auto">
              <p className="font-semibold text-slate-200 print:text-black">Data da Compra</p>
              <p className="font-mono text-emerald-400 print:text-emerald-700 font-bold">{dataFormatada}</p>
              <p className="mt-2 text-slate-400">Vendedor: <span className="text-slate-200 font-medium">{venda.vendedor || "Atendimento"}</span></p>
            </div>
          </div>

          {/* Dados do Cliente */}
          <div className="bg-slate-950/50 print:bg-slate-50 p-4 rounded-2xl border border-slate-800 print:border-slate-200">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 print:text-slate-700 mb-2 flex items-center gap-1.5">
              <User className="w-4 h-4 text-emerald-500" /> Cliente / Destinatário
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
              <div>
                <p className="text-slate-400">Nome:</p>
                <p className="font-bold text-white print:text-black">{clienteNome}</p>
              </div>
              {cliente?.cpf && (
                <div>
                  <p className="text-slate-400">CPF/CNPJ:</p>
                  <p className="font-mono text-slate-200 print:text-slate-800">{cliente.cpf}</p>
                </div>
              )}
              {cliente?.telefone && (
                <div>
                  <p className="text-slate-400">Telefone:</p>
                  <p className="text-slate-200 print:text-slate-800">{cliente.telefone}</p>
                </div>
              )}
              {cliente?.email && (
                <div>
                  <p className="text-slate-400">E-mail:</p>
                  <p className="text-slate-200 print:text-slate-800">{cliente.email}</p>
                </div>
              )}
            </div>
          </div>

          {/* Lista de Produtos/Serviços e Aparelhos */}
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 print:text-slate-700 mb-3 flex items-center gap-1.5">
              <Smartphone className="w-4 h-4 text-emerald-500" /> Itens do Pedido / Detalhes do Aparelho
            </h3>
            
            <div className="overflow-hidden border border-slate-800 print:border-slate-300 rounded-2xl">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-800/60 print:bg-slate-100 text-slate-300 print:text-black font-semibold border-b border-slate-800 print:border-slate-300">
                    <th className="p-3">Item / Aparelho (Marca, Modelo, Capacidade, Cor, IMEI)</th>
                    <th className="p-3 text-center">Qtd</th>
                    <th className="p-3 text-right">Valor Unit.</th>
                    <th className="p-3 text-right">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800 print:divide-slate-200 text-slate-200 print:text-slate-900">
                  {venda.itens && venda.itens.length > 0 ? (
                    venda.itens.map((item: any, idx: number) => (
                      <tr key={idx} className="hover:bg-slate-800/30 print:hover:bg-transparent">
                        <td className="p-3">
                          <p className="font-bold text-white print:text-black text-sm">{item.descricao}</p>
                          {item.observacao && (
                            <p className="text-xs text-emerald-400 print:text-emerald-800 mt-1 font-mono font-medium bg-emerald-950/40 print:bg-emerald-50 p-1.5 rounded border border-emerald-500/20 inline-block">
                              {item.observacao}
                            </p>
                          )}
                        </td>
                        <td className="p-3 text-center font-bold">{item.quantidade || 1}</td>
                        <td className="p-3 text-right font-mono">R$ {(item.valorExibir || item.valor || 0).toFixed(2).replace(".", ",")}</td>
                        <td className="p-3 text-right font-mono font-bold text-emerald-400 print:text-black">R$ {(item.total || item.valor || 0).toFixed(2).replace(".", ",")}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td className="p-3 font-bold">{venda.descricao || "Venda Geral"}</td>
                      <td className="p-3 text-center">1</td>
                      <td className="p-3 text-right font-mono">R$ {totalVenda.toFixed(2).replace(".", ",")}</td>
                      <td className="p-3 text-right font-mono font-bold">R$ {totalVenda.toFixed(2).replace(".", ",")}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Resumo de Valores e Forma de Pagamento */}
          <div className="bg-emerald-950/20 print:bg-emerald-50/50 p-4 rounded-2xl border border-emerald-500/20 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <p className="text-xs text-slate-400 print:text-slate-700 flex items-center gap-1 font-medium">
                <CreditCard className="w-3.5 h-3.5 text-emerald-400" /> Forma(s) de Pagamento:
              </p>
              <p className="text-sm font-bold text-emerald-400 print:text-emerald-800 uppercase mt-0.5">
                {formatarPagamentos(venda)}
              </p>
            </div>
            <div className="text-left sm:text-right w-full sm:w-auto">
              <p className="text-xs text-slate-400 print:text-slate-700 font-medium">Valor Total Pago</p>
              <p className="text-2xl font-black text-emerald-400 print:text-emerald-700 font-mono">
                R$ {totalVenda.toFixed(2).replace(".", ",")}
              </p>
            </div>
          </div>

          {/* Termo de Garantia */}
          <div className="bg-slate-950/40 print:bg-slate-50 p-4 rounded-2xl border border-slate-800 print:border-slate-200 text-xs space-y-2">
            <h4 className="font-bold text-slate-200 print:text-black flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-emerald-500" /> Termo de Garantia ({venda.garantia || "90 dias"})
            </h4>
            <p className="text-slate-400 print:text-slate-700 leading-relaxed text-[11px]">
              Garantia legal de {venda.garantia || "90 dias"} referente aos serviços ou peças fornecidos. A garantia é anulada em casos de quedas, oxidação por líquidos, mau uso, lacre violado ou manutenção efetuada por terceiros.
            </p>
          </div>

          {/* Assinatura de Validação */}
          <div className="pt-6 border-t border-slate-800 print:border-slate-300 flex flex-col sm:flex-row justify-between items-center gap-6">
            <div className="text-center sm:text-left">
              <div className="flex items-center gap-1.5 text-emerald-400 font-bold text-xs">
                <CheckCircle2 className="w-4 h-4" /> Autenticado por {loja?.nome || "Phone Center"}
              </div>
              <p className="text-[10px] text-slate-500 print:text-slate-600 mt-0.5">Recibo registrado eletronicamente no sistema de gestão.</p>
            </div>

            {loja?.assinatura_url && (
              <div className="text-center">
                <img src={loja.assinatura_url} alt="Assinatura da Loja" className="h-12 w-auto object-contain mx-auto mb-1" />
                <p className="text-[10px] text-slate-400 print:text-slate-700 font-semibold border-t border-slate-700 print:border-slate-300 pt-1">
                  Assinatura Autorizada
                </p>
              </div>
            )}
          </div>

          {/* Ações */}
          <div className="pt-4 flex flex-wrap gap-3 justify-center print:hidden">
            <button
              onClick={handleImprimirReciboA4}
              className="flex items-center gap-2 px-5 py-2.5 bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold rounded-xl transition cursor-pointer"
            >
              <Printer className="w-4 h-4" /> Imprimir / Salvar PDF
            </button>
            <button
              onClick={handleCompartilharWhatsApp}
              className="flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl transition cursor-pointer"
            >
              <Share2 className="w-4 h-4" /> Compartilhar no WhatsApp
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
