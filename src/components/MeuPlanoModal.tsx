'use client';

import { useState, useEffect, useRef } from 'react';
import { 
  CreditCard, 
  CheckCircle2, 
  AlertTriangle, 
  XCircle, 
  Copy, 
  Check, 
  Upload, 
  Send, 
  Clock, 
  ShieldCheck, 
  X,
  Building2,
  Calendar,
  DollarSign,
  QrCode,
  Zap,
  Loader2,
  Sparkles
} from 'lucide-react';
import { useStorePlan } from '@/hooks/useStorePlan';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';

interface MeuPlanoModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function MeuPlanoModal({ isOpen, onClose }: MeuPlanoModalProps) {
  const { 
    planData, 
    loading, 
    enviarSolicitacaoLiberacao, 
    refetchPlan,
    historicoPagamentos,
    loadingHistorico,
    refetchHistorico
  } = useStorePlan();
  const [copied, setCopied] = useState(false);
  const [comprovante, setComprovante] = useState<string | null>(null);
  const [observacao, setObservacao] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [activeModalTab, setActiveModalTab] = useState<'pagamento' | 'historico'>('pagamento');
  const [comprovanteModalUrl, setComprovanteModalUrl] = useState<string | null>(null);

  // Estados para o PIX Automático Dinâmico
  const [gerandoPix, setGerandoPix] = useState(false);
  const [pixDinamico, setPixDinamico] = useState<{
    paymentId: string;
    qrCode?: string;
    qrCodeBase64?: string;
    chavePix?: string;
    modo: 'mercadopago' | 'chave_pix';
    ticketUrl?: string;
  } | null>(null);
  const [pixCopiado, setPixCopiado] = useState(false);
  const [pagamentoAprovadoAuto, setPagamentoAprovadoAuto] = useState(false);
  const pollingRef = useRef<NodeJS.Timeout | null>(null);

  // Limpa intervalo ao fechar ou desmontar
  useEffect(() => {
    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
      }
    };
  }, []);

  if (!isOpen) return null;

  const formatarData = (dateStr?: string | null) => {
    if (!dateStr) return 'Não definido';
    const parts = String(dateStr).split('T')[0].split('-');
    if (parts.length === 3) {
      return `${parts[2]}/${parts[1]}/${parts[0]}`;
    }
    return dateStr;
  };

  const formatarDataHora = (dateStr?: string | null) => {
    if (!dateStr) return '-';
    try {
      const d = new Date(dateStr);
      return d.toLocaleString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return dateStr;
    }
  };

  const handleCopyPix = () => {
    navigator.clipboard.writeText(planData.chavePixCobranca);
    setCopied(true);
    toast.success('Chave Pix copiada com sucesso!');
    setTimeout(() => setCopied(false), 2500);
  };

  const handleCopyPixDinamico = () => {
    const textoParaCopiar = pixDinamico?.qrCode || pixDinamico?.chavePix || planData.chavePixCobranca;
    navigator.clipboard.writeText(textoParaCopiar);
    setPixCopiado(true);
    toast.success('Código Pix Copia e Cola copiado com sucesso!');
    setTimeout(() => setPixCopiado(false), 2500);
  };

  // Gerar PIX Dinâmico com QR Code e Cobrança Automática
  const handleGerarPixDinamico = async () => {
    if (!planData.lojaId) {
      toast.error('Loja não identificada');
      return;
    }

    try {
      setGerandoPix(true);
      setPagamentoAprovadoAuto(false);

      const res = await fetch('/api/planos/gerar-pix', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lojaId: planData.lojaId,
          valor: planData.valorMensalidade,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Falha ao gerar PIX');

      setPixDinamico(data);
      if (data.modo === 'mercadopago') {
        toast.success('QR Code Pix gerado via Mercado Pago! Pague pelo seu app bancário.');
      } else {
        toast.success(data.mensagem || 'Chave PIX gerada com sucesso! Anexe o comprovante após o pagamento.');
      }
      refetchHistorico();

      // Inicia polling automático a cada 4 segundos APENAS se for Mercado Pago dinâmico real
      if (pollingRef.current) clearInterval(pollingRef.current);

      if (data.modo === 'mercadopago' && data.paymentId && /^\d+$/.test(String(data.paymentId))) {
        pollingRef.current = setInterval(async () => {
          try {
            const checkRes = await fetch(`/api/planos/verificar-pix?paymentId=${data.paymentId}&lojaId=${planData.lojaId}`);
            if (checkRes.ok) {
              const checkData = await checkRes.json();
              if (checkData.approved) {
                if (pollingRef.current) clearInterval(pollingRef.current);
                setPagamentoAprovadoAuto(true);
                toast.success('🎉 Pagamento confirmado com sucesso! Sua loja já está liberada!', {
                  duration: 6000,
                });
                await refetchPlan();
                await refetchHistorico();
              }
            }
          } catch (pollErr) {
            console.error('Erro na checagem do PIX:', pollErr);
          }
        }, 4000);
      }

    } catch (err: any) {
      console.error('Erro ao gerar PIX dinâmico:', err);
      toast.error(err.message || 'Erro ao gerar cobrança PIX');
    } finally {
      setGerandoPix(false);
    }
  };

  const handleUploadComprovante = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 15000000) {
        toast.error('Arquivo muito grande. Envie uma imagem de até 15MB.');
        return;
      }
      const reader = new FileReader();
      reader.onload = (event) => {
        setComprovante(event.target?.result as string);
        toast.success('Comprovante anexado!');
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setEnviando(true);
      await enviarSolicitacaoLiberacao(comprovante || undefined, observacao || undefined);
      toast.success('Solicitação de liberação enviada com sucesso ao Super Admin!');
      setComprovante(null);
      setObservacao('');
      refetchPlan();
      refetchHistorico();
    } catch (err: any) {
      toast.error(err?.message || 'Erro ao enviar comprovante.');
    } finally {
      setEnviando(false);
    }
  };

  const getStatusBadge = () => {
    switch (planData.planoStatus) {
      case 'ativo':
        return (
          <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 text-xs px-3 py-1 flex items-center gap-1.5 font-bold">
            <CheckCircle2 className="w-4 h-4" /> Plano Ativo
          </Badge>
        );
      case 'pendente':
        return (
          <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30 text-xs px-3 py-1 flex items-center gap-1.5 font-bold">
            <Clock className="w-4 h-4" /> Pagamento Pendente
          </Badge>
        );
      case 'vencido':
        return (
          <Badge className="bg-orange-500/20 text-orange-400 border-orange-500/30 text-xs px-3 py-1 flex items-center gap-1.5 font-bold">
            <AlertTriangle className="w-4 h-4" /> Assinatura Vencida
          </Badge>
        );
      case 'bloqueado':
        return (
          <Badge className="bg-red-500/20 text-red-400 border-red-500/30 text-xs px-3 py-1 flex items-center gap-1.5 font-bold">
            <XCircle className="w-4 h-4" /> Assinatura Bloqueada
          </Badge>
        );
      default:
        return null;
    }
  };

  return (
    <div className="fixed inset-0 z-[999] flex items-center justify-center p-4 sm:p-6">
      {/* Overlay com Blur */}
      <div 
        className="fixed inset-0 bg-black/70 backdrop-blur-md transition-opacity" 
        onClick={onClose}
      />

      {/* Card do Modal */}
      <div className="relative w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl overflow-hidden text-slate-100 z-10 flex flex-col max-h-[90vh]">
        
        {/* Cabeçalho */}
        <div className="bg-gradient-to-r from-blue-600/30 via-indigo-600/30 to-purple-600/30 border-b border-slate-800 p-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-blue-500/20 text-blue-400 flex items-center justify-center border border-blue-500/30">
              <CreditCard className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white flex items-center gap-2">
                Meu Plano & Mensalidade
              </h2>
              <p className="text-xs text-slate-400">Informações da assinatura da loja e liberação de acesso</p>
            </div>
          </div>
          <button 
            onClick={onClose} 
            className="p-2 hover:bg-slate-800 text-slate-400 hover:text-white rounded-full transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Conteúdo */}
        <div className="p-6 overflow-y-auto space-y-5 scrollbar-soft">
          
          {/* Card Status da Loja */}
          <div className="bg-slate-950/60 rounded-2xl border border-slate-800 p-5 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Building2 className="w-4 h-4 text-blue-400" />
                <span className="text-sm font-bold text-white">{planData.nomeLoja}</span>
              </div>
              <p className="text-xs text-slate-400 flex items-center gap-1.5">
                <DollarSign className="w-3.5 h-3.5 text-emerald-400" /> Mensalidade: <span className="font-bold text-emerald-400">R$ {planData.valorMensalidade.toFixed(2).replace('.', ',')} / mês</span>
              </p>
              {planData.dataVencimento && (
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-xs text-slate-400 flex items-center gap-1.5">
                    <Calendar className={`w-3.5 h-3.5 ${planData.planoStatus === 'vencido' ? 'text-red-400' : 'text-amber-400'}`} /> 
                    Vencimento: <span className={`font-bold ${planData.planoStatus === 'vencido' ? 'text-red-400' : 'text-slate-200'}`}>
                      {formatarData(planData.dataVencimento)}
                    </span>
                  </p>
                  {planData.planoStatus === 'vencido' && (
                    <span className="text-[10px] bg-red-500/20 text-red-400 font-bold px-2 py-0.5 rounded-full border border-red-500/30">
                      Vencido ({planData.diasParaVencer <= 0 ? `há ${Math.abs(planData.diasParaVencer)} dia(s)` : 'Hoje'})
                    </span>
                  )}
                  {planData.planoStatus === 'ativo' && planData.diasParaVencer >= 0 && (
                    <span className="text-[10px] bg-emerald-500/10 text-emerald-400 font-semibold px-2 py-0.5 rounded-full border border-emerald-500/20">
                      {planData.diasParaVencer} dias restantes
                    </span>
                  )}
                </div>
              )}
            </div>
            <div className="flex flex-col items-start sm:items-end gap-2">
              {getStatusBadge()}
              {pagamentoAprovadoAuto ? (
                <span className="text-[11px] text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-full border border-emerald-500/30 font-bold flex items-center gap-1">
                  <Sparkles className="w-3.5 h-3.5" /> Liberado Automaticamente via PIX!
                </span>
              ) : planData.solicitacaoStatus === 'pendente_aprovacao' ? (
                <span className="text-[11px] text-amber-400 bg-amber-500/10 px-2.5 py-1 rounded-full border border-amber-500/20 font-medium">
                  ⏳ Solicitação em análise pelo Super Admin
                </span>
              ) : null}
            </div>
          </div>

          {/* Abas Internas: Renovação PIX / Histórico */}
          <div className="flex items-center gap-2 border-b border-slate-800 pb-2">
            <button
              type="button"
              onClick={() => setActiveModalTab('pagamento')}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition cursor-pointer ${
                activeModalTab === 'pagamento'
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20'
                  : 'bg-slate-800/60 text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <Zap className="w-3.5 h-3.5 text-emerald-400" />
              Pagar / Renovar Assinatura
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveModalTab('historico');
                refetchHistorico();
              }}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition cursor-pointer ${
                activeModalTab === 'historico'
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20'
                  : 'bg-slate-800/60 text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <Clock className="w-3.5 h-3.5 text-purple-400" />
              Histórico de Pagamentos ({historicoPagamentos.length})
            </button>
          </div>

          {activeModalTab === 'pagamento' ? (
            <>
              {/* SEÇÃO: PAGAMENTO AUTOMÁTICO VIA PIX */}
          <div className="bg-gradient-to-br from-emerald-950/40 to-slate-950/60 rounded-2xl border border-emerald-500/30 p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm font-bold text-emerald-300">
                <Zap className="w-4 h-4 text-emerald-400" /> Pagamento PIX Instantâneo com Liberação Automática
              </div>
              <Badge className="bg-emerald-500/20 text-emerald-300 border-emerald-500/40 text-[10px]">
                Aprovação 24/7 em segundos
              </Badge>
            </div>

            <p className="text-xs text-slate-300">
              Pague via QR Code ou Copia e Cola. O sistema reconhece o pagamento na hora e renova sua assinatura automaticamente, sem precisar aguardar aprovação manual!
            </p>

            {!pixDinamico ? (
              <Button
                type="button"
                onClick={handleGerarPixDinamico}
                disabled={gerandoPix}
                className="w-full h-11 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs sm:text-sm rounded-xl shadow-lg shadow-emerald-600/20 gap-2 cursor-pointer"
              >
                {gerandoPix ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" /> Gerando QR Code PIX...
                  </>
                ) : (
                  <>
                    <QrCode className="w-4 h-4" /> Gerar QR Code PIX para Pagamento
                  </>
                )}
              </Button>
            ) : (
              <div className="space-y-4 bg-slate-900/90 border border-slate-800 p-4 rounded-xl">
                {pagamentoAprovadoAuto ? (
                  <div className="p-4 bg-emerald-500/20 border border-emerald-500/40 rounded-xl text-center space-y-2">
                    <CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto" />
                    <h3 className="font-bold text-white text-base">Pagamento Confirmado!</h3>
                    <p className="text-xs text-emerald-300">Sua loja já está ativa e seu acesso foi prorrogado por mais 30 dias.</p>
                  </div>
                ) : (
                  <>
                    <div className="flex flex-col sm:flex-row items-center justify-center gap-5">
                      {/* QR Code */}
                      {pixDinamico.qrCodeBase64 ? (
                        <div className="bg-white p-2.5 rounded-xl shrink-0 shadow-lg">
                          <img 
                            src={`data:image/png;base64,${pixDinamico.qrCodeBase64}`} 
                            alt="QR Code Pix" 
                            className="w-40 h-40 object-contain"
                          />
                        </div>
                      ) : (pixDinamico.qrCode || pixDinamico.chavePix || planData.chavePixCobranca) ? (
                        <div className="bg-white p-2.5 rounded-xl shrink-0 shadow-lg">
                          <img 
                            src={`https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(pixDinamico.qrCode || pixDinamico.chavePix || planData.chavePixCobranca)}`} 
                            alt="QR Code Pix" 
                            className="w-40 h-40 object-contain"
                          />
                        </div>
                      ) : (
                        <div className="w-40 h-40 bg-slate-950 border border-slate-800 rounded-xl flex items-center justify-center text-center p-3 text-xs text-slate-400">
                          <QrCode className="w-10 h-10 text-emerald-400 mb-1 opacity-70" />
                        </div>
                      )}

                      {/* Dados Copia e Cola */}
                      <div className="space-y-2 flex-1 w-full">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-slate-400 font-semibold">Valor da Mensalidade:</span>
                          <span className="text-emerald-400 font-bold font-mono text-sm">
                            R$ {planData.valorMensalidade.toFixed(2).replace('.', ',')}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-400">
                          Abra o app do seu banco, escolha <b>Pix Copia e Cola</b> ou aponte a câmera para o QR Code ao lado.
                        </p>
                        
                        <Button
                          type="button"
                          onClick={handleCopyPixDinamico}
                          className="w-full gap-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs"
                        >
                          {pixCopiado ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                          {pixCopiado ? 'Código Pix Copiado!' : 'Copiar Código Pix (Copia e Cola)'}
                        </Button>

                        {pixDinamico.modo === 'mercadopago' ? (
                          <div className="flex items-center justify-center gap-2 pt-2 text-[11px] text-amber-400">
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            <span>Aguardando confirmação bancária em tempo real...</span>
                          </div>
                        ) : (
                          <div className="flex items-center justify-center gap-2 pt-2 text-[11px] text-blue-300 bg-blue-500/10 py-1.5 px-2 rounded-lg border border-blue-500/20">
                            <span>Pagamento manual: após pagar, anexe o comprovante abaixo.</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>

          {/* Dados Pix Estático (Fallback) */}
          <div className="bg-slate-950/40 rounded-2xl border border-slate-800 p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm font-bold text-slate-200">
                <ShieldCheck className="w-4 h-4 text-slate-400" /> Ou Pague Diretamente na Chave Oficial
              </div>
            </div>
            
            <div className="bg-slate-900 p-4 rounded-xl border border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3">
              <div className="w-full sm:w-auto truncate">
                <p className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">Chave Pix Cadastrada</p>
                <p className="text-sm font-mono font-bold text-emerald-400 truncate">{planData.chavePixCobranca}</p>
              </div>
              <Button
                type="button"
                onClick={handleCopyPix}
                variant="outline"
                size="sm"
                className="w-full sm:w-auto gap-2 bg-emerald-600/10 border-emerald-500/30 text-emerald-400 hover:bg-emerald-600/20"
              >
                {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                {copied ? 'Copiado!' : 'Copiar Chave Pix'}
              </Button>
            </div>
          </div>

          {/* Formulário de Envio de Comprovante Manual (opcional) */}
          <form onSubmit={handleSubmit} className="space-y-4 pt-2">
            <div className="space-y-1">
              <h4 className="text-sm font-bold text-white flex items-center gap-2">
                <Upload className="w-4 h-4 text-blue-400" /> Enviar Comprovante para Conferência Manual (Opcional)
              </h4>
              <p className="text-xs text-slate-400">
                Caso tenha feito transferência manual por outra chave, anexe o comprovante para análise do Super Admin.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Botão Upload */}
              <div className="flex flex-col gap-2">
                <label className="text-xs text-slate-300 font-medium">Comprovante de Pagamento (Imagem / Print)</label>
                <label className="flex flex-col items-center justify-center h-28 border-2 border-dashed border-slate-700 hover:border-blue-500 rounded-xl cursor-pointer bg-slate-950/40 hover:bg-blue-500/5 transition">
                  {comprovante ? (
                    <div className="flex flex-col items-center p-2 text-center">
                      <img src={comprovante} alt="Preview" className="h-14 w-auto object-contain rounded mb-1" />
                      <span className="text-[11px] text-emerald-400 font-semibold">Comprovante Anexado ✓</span>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center text-center p-2">
                      <Upload className="w-6 h-6 text-slate-400 mb-1" />
                      <span className="text-xs text-slate-300 font-medium">Clique para selecionar imagem</span>
                      <span className="text-[10px] text-slate-500">PNG, JPG ou PDF</span>
                    </div>
                  )}
                  <input type="file" accept="image/*" onChange={handleUploadComprovante} className="hidden" />
                </label>
              </div>

              {/* Observações */}
              <div className="flex flex-col gap-2">
                <label className="text-xs text-slate-300 font-medium">Observações / Identificação</label>
                <textarea
                  value={observacao}
                  onChange={(e) => setObservacao(e.target.value)}
                  placeholder="Ex: Pagamento referente ao mês feito via conta titular João..."
                  className="w-full h-28 bg-slate-950/60 border border-slate-800 rounded-xl p-3 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-blue-500 resize-none"
                />
              </div>
            </div>

              <Button
                type="submit"
                disabled={enviando}
                className="w-full h-11 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold text-xs sm:text-sm rounded-xl shadow-lg shadow-blue-500/20 gap-2 cursor-pointer"
              >
                {enviando ? (
                  <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
                Enviar Comprovante para Aprovação Manual
              </Button>
            </form>
          </>
        ) : (
          /* ABA: HISTÓRICO DE PAGAMENTOS */
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-sm font-bold text-white flex items-center gap-2">
                  <Clock className="w-4 h-4 text-purple-400" /> Histórico de Mensalidades & Transações
                </h4>
                <p className="text-xs text-slate-400">
                  Acompanhe todos os pagamentos realizados, cobranças em aberto e confirmações de renovação.
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={refetchHistorico}
                disabled={loadingHistorico}
                className="gap-1.5 text-xs border-slate-700 bg-slate-800/60 hover:bg-slate-800 cursor-pointer"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loadingHistorico ? 'animate-spin' : ''}`} />
                Atualizar
              </Button>
            </div>

            {loadingHistorico ? (
              <div className="py-12 flex flex-col items-center justify-center text-slate-400 gap-2">
                <Loader2 className="w-6 h-6 animate-spin text-blue-400" />
                <span className="text-xs">Carregando histórico financeiro...</span>
              </div>
            ) : historicoPagamentos.length === 0 ? (
              <div className="py-12 text-center bg-slate-950/40 rounded-2xl border border-slate-800 p-6 space-y-2">
                <CreditCard className="w-8 h-8 text-slate-500 mx-auto" />
                <p className="text-sm font-semibold text-slate-300">Nenhum pagamento registrado ainda</p>
                <p className="text-xs text-slate-500 max-w-sm mx-auto">
                  Assim que gerar cobranças PIX ou enviar comprovantes, eles ficarão listados aqui com status e data.
                </p>
              </div>
            ) : (
              <div className="space-y-2.5 max-h-[450px] overflow-y-auto pr-1 scrollbar-soft">
                {historicoPagamentos.map((pag) => {
                  const status = pag.status || 'pendente';
                  const isMercadoPago = !!pag.mp_payment_id;
                  const temComprovante = !!pag.comprovante_url;

                  return (
                    <div
                      key={pag.id}
                      className="bg-slate-950/60 border border-slate-800 hover:border-slate-700/80 rounded-2xl p-4 transition space-y-2.5"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-base font-bold text-white font-mono">
                              R$ {Number(pag.valor || planData.valorMensalidade).toFixed(2).replace('.', ',')}
                            </span>
                            {status === 'aprovado' && (
                              <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 text-[10px] font-bold">
                                ✓ Confirmado / Ativo
                              </Badge>
                            )}
                            {status === 'pendente' && (
                              <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30 text-[10px] font-bold">
                                ⏳ Aguardando Pagamento
                              </Badge>
                            )}
                            {status === 'pendente_aprovacao' && (
                              <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30 text-[10px] font-bold">
                                📩 Comprovante em Análise
                              </Badge>
                            )}
                            {status === 'rejeitado' && (
                              <Badge className="bg-red-500/20 text-red-400 border-red-500/30 text-[10px] font-bold">
                                ✕ Rejeitado
                              </Badge>
                            )}
                          </div>

                          <p className="text-xs text-slate-400 flex items-center gap-1">
                            <Calendar className="w-3 h-3 text-slate-500" />
                            {formatarDataHora(pag.data_pagamento || pag.created_at)}
                          </p>
                        </div>

                        {/* Origem / Método */}
                        <div className="text-right shrink-0">
                          {isMercadoPago ? (
                            <span className="text-[10px] font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20 block">
                              PIX Mercado Pago #{pag.mp_payment_id}
                            </span>
                          ) : temComprovante ? (
                            <span className="text-[10px] font-mono text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded border border-blue-500/20 block">
                              Comprovante Manual
                            </span>
                          ) : (
                            <span className="text-[10px] font-mono text-slate-400 bg-slate-800 px-2 py-0.5 rounded block">
                              PIX Chave Direta
                            </span>
                          )}
                        </div>
                      </div>

                      {pag.observacao && (
                        <p className="text-xs text-slate-400 bg-slate-900/90 rounded-lg p-2 border border-slate-800/80">
                          {pag.observacao}
                        </p>
                      )}

                      <div className="flex items-center justify-between pt-1 border-t border-slate-900 text-xs">
                        {temComprovante ? (
                          <button
                            type="button"
                            onClick={() => setComprovanteModalUrl(pag.comprovante_url)}
                            className="text-xs text-blue-400 hover:text-blue-300 font-semibold underline flex items-center gap-1 cursor-pointer"
                          >
                            📎 Ver Comprovante Anexado
                          </button>
                        ) : (
                          <div />
                        )}

                        {status === 'pendente' && pag.qr_code && (
                          <button
                            type="button"
                            onClick={() => {
                              navigator.clipboard.writeText(pag.qr_code);
                              toast.success('Código PIX Copiado!');
                            }}
                            className="text-xs text-emerald-400 hover:text-emerald-300 font-semibold flex items-center gap-1 cursor-pointer"
                          >
                            <Copy className="w-3 h-3" /> Copiar Código PIX
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>

    {/* Modal de Visualização de Comprovante */}
    {comprovanteModalUrl && (
      <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
        <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-bold text-white">Comprovante de Pagamento</h4>
            <button
              onClick={() => setComprovanteModalUrl(null)}
              className="p-1 text-slate-400 hover:text-white rounded cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="max-h-[70vh] overflow-auto rounded-xl border border-slate-800 bg-black/40 p-2 flex items-center justify-center">
            <img src={comprovanteModalUrl} alt="Comprovante" className="max-w-full h-auto object-contain rounded" />
          </div>
          <Button
            onClick={() => setComprovanteModalUrl(null)}
            className="w-full bg-slate-800 hover:bg-slate-700 text-white text-xs cursor-pointer"
          >
            Fechar Visualização
          </Button>
        </div>
      </div>
    )}
  </div>
);
}
