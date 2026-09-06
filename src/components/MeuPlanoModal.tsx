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
  Sparkles,
  RefreshCw,
  Gift,
  ExternalLink,
  MessageCircle,
  ChevronRight,
  HelpCircle,
  Layers,
  Crown
} from 'lucide-react';
import { useStorePlan } from '@/hooks/useStorePlan';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { 
  PLANOS_SISTEMA, 
  TipoPlano, 
  PeriodoFaturamento, 
  calcularValoresPlano, 
  obterPlanoPorTipo,
  WHATSAPP_SUPORTE_URL 
} from '@/lib/planos-config';

interface MeuPlanoModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function MeuPlanoModal({ isOpen, onClose }: MeuPlanoModalProps) {
  const { 
    planData, 
    loading, 
    enviarSolicitacaoLiberacao, 
    solicitarTrial,
    iniciarCheckoutCartao,
    refetchPlan,
    historicoPagamentos,
    loadingHistorico,
    refetchHistorico
  } = useStorePlan();

  // Estados de navegação interna
  const [activeModalTab, setActiveModalTab] = useState<'planos' | 'pagamento' | 'historico'>('planos');
  
  // Ciclo de cobrança selecionado
  const [periodoSelecionado, setPeriodoSelecionado] = useState<PeriodoFaturamento>('mensal');
  const [planoSelecionado, setPlanoSelecionado] = useState<TipoPlano>(planData.planoTipo || 'entrada');

  // Cálculo de valor proporcional caso queira pagar antes do vencimento
  const diasRestantes = planData.diasParaVencer || 0;
  const isRenovacaoAntecipada = diasRestantes > 0 && diasRestantes < 30 && planData.planoStatus === 'ativo' && periodoSelecionado === 'mensal' && planoSelecionado === planData.planoTipo;
  const diasParaCompletar = isRenovacaoAntecipada ? (30 - diasRestantes) : 30;
  
  const infoCalculo = calcularValoresPlano(planoSelecionado, periodoSelecionado);
  const valorDiaria = infoCalculo.valorMensal / 30;
  const valorCobrancaFinal = isRenovacaoAntecipada 
    ? Math.max(1.00, Number((diasParaCompletar * valorDiaria).toFixed(2)))
    : infoCalculo.valorTotal;

  // Estados PIX
  const [copied, setCopied] = useState(false);
  const [comprovante, setComprovante] = useState<string | null>(null);
  const [observacao, setObservacao] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [comprovanteModalUrl, setComprovanteModalUrl] = useState<string | null>(null);

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

  // Estados Cartão
  const [gerandoCartao, setGerandoCartao] = useState(false);
  const [ativandoTrial, setAtivandoTrial] = useState(false);

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
      if (isNaN(d.getTime())) return String(dateStr);
      const dia = String(d.getDate()).padStart(2, '0');
      const mes = String(d.getMonth() + 1).padStart(2, '0');
      const ano = d.getFullYear();
      const hora = String(d.getHours()).padStart(2, '0');
      const min = String(d.getMinutes()).padStart(2, '0');
      return `${dia}/${mes}/${ano} às ${hora}:${min}`;
    } catch {
      return String(dateStr);
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

  // Gerar PIX Dinâmico com QR Code
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
          valor: valorCobrancaFinal,
          email: planData.nomeLoja,
          plano: planoSelecionado,
          periodo: periodoSelecionado
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Falha ao gerar PIX');

      setPixDinamico(data);
      if (data.modo === 'mercadopago') {
        toast.success(`QR Code Pix gerado (R$ ${valorCobrancaFinal.toFixed(2).replace('.', ',')})! Pague pelo seu app bancário.`);
      } else {
        toast.success(data.mensagem || 'Chave PIX gerada com sucesso! Anexe o comprovante após o pagamento.');
      }
      refetchHistorico();

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
                toast.success('🎉 Pagamento confirmado! Atualizando validade do seu plano...', {
                  duration: 4000,
                });
                await refetchPlan();
                await refetchHistorico();
                setTimeout(() => {
                  window.location.reload();
                }, 1800);
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

  // Checkout com Cartão de Crédito
  const handlePagarCartao = async () => {
    try {
      setGerandoCartao(true);
      const res = await iniciarCheckoutCartao(planoSelecionado, periodoSelecionado);
      if (res?.checkoutUrl) {
        toast.success('Redirecionando para o Checkout Seguro do Mercado Pago...');
        window.open(res.checkoutUrl, '_blank');
      } else {
        toast.error('Erro ao iniciar checkout com cartão.');
      }
    } catch (err: any) {
      toast.error(err?.message || 'Erro ao processar checkout com cartão');
    } finally {
      setGerandoCartao(false);
    }
  };

  // Solicitar 3 dias de Teste Gratuito
  const handleSolicitarTrial = async (novoPlano: TipoPlano) => {
    try {
      setAtivandoTrial(true);
      const res = await solicitarTrial(novoPlano);
      toast.success(res.mensagem || 'Teste de 3 dias ativado com sucesso!');
      await refetchPlan();
      await refetchHistorico();
    } catch (err: any) {
      toast.error(err?.message || 'Não foi possível ativar o teste gratuito.');
    } finally {
      setAtivandoTrial(false);
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
    if (planData.isTrialAtivo) {
      return (
        <Badge className="bg-purple-500/20 text-purple-300 border-purple-500/40 text-xs px-3 py-1 flex items-center gap-1.5 font-bold animate-pulse">
          <Gift className="w-4 h-4 text-purple-400" /> Teste de 3 Dias Ativo
        </Badge>
      );
    }

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

  const planoAtualConfig = obterPlanoPorTipo(planData.planoTipo);

  return (
    <div className="fixed inset-0 z-[999] flex items-center justify-center p-3 sm:p-6">
      {/* Overlay com Blur */}
      <div 
        className="fixed inset-0 bg-black/80 backdrop-blur-md transition-opacity" 
        onClick={onClose}
      />

      {/* Card do Modal */}
      <div className="relative w-full max-w-4xl bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl overflow-hidden text-slate-100 z-10 flex flex-col max-h-[92vh]">
        
        {/* Cabeçalho */}
        <div className="bg-gradient-to-r from-blue-600/30 via-indigo-600/30 to-purple-600/30 border-b border-slate-800 p-5 sm:p-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-blue-500/20 text-blue-400 flex items-center justify-center border border-blue-500/30 shadow-inner">
              <Crown className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-bold text-white">
                  Meu Plano & Assinatura
                </h2>
                <Badge className="bg-blue-500/20 text-blue-300 border-blue-500/40 text-[10px] uppercase font-mono">
                  {planoAtualConfig.nome}
                </Badge>
              </div>
              <p className="text-xs text-slate-400">Gerencie sua assinatura, mude de plano ou renove com liberação automática</p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <a
              href={WHATSAPP_SUPORTE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 text-xs font-semibold border border-emerald-500/30 transition cursor-pointer"
            >
              <MessageCircle className="w-3.5 h-3.5" /> Suporte
            </a>
            <button 
              onClick={onClose} 
              className="p-2 hover:bg-slate-800 text-slate-400 hover:text-white rounded-full transition cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Conteúdo com Scroll */}
        <div className="p-5 sm:p-6 overflow-y-auto space-y-6 scrollbar-soft">
          
          {/* Card Resumo Status da Loja */}
          <div className="bg-slate-950/60 rounded-2xl border border-slate-800 p-4 sm:p-5 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <Building2 className="w-4 h-4 text-blue-400" />
                <span className="text-sm font-bold text-white">{planData.nomeLoja}</span>
                <span className="text-xs text-slate-500">•</span>
                <span className="text-xs text-slate-400">Plano Atual: <strong className="text-blue-300">{planoAtualConfig.nome}</strong></span>
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
                  {planData.isTrialAtivo && (
                    <span className="text-[10px] bg-purple-500/20 text-purple-300 font-bold px-2 py-0.5 rounded-full border border-purple-500/30 flex items-center gap-1">
                      <Gift className="w-3 h-3" /> Teste Grátis até {formatarData(planData.planoTrialAte)}
                    </span>
                  )}
                  {planData.planoStatus === 'vencido' && (
                    <span className="text-[10px] bg-red-500/20 text-red-400 font-bold px-2 py-0.5 rounded-full border border-red-500/30">
                      Vencido ({planData.diasParaVencer <= 0 ? `há ${Math.abs(planData.diasParaVencer)} dia(s)` : 'Hoje'})
                    </span>
                  )}
                  {planData.planoStatus === 'ativo' && planData.diasParaVencer >= 0 && !planData.isTrialAtivo && (
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

          {/* Seletor de Abas Principais */}
          <div className="flex items-center gap-2 border-b border-slate-800 pb-2">
            <button
              type="button"
              onClick={() => setActiveModalTab('planos')}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer ${
                activeModalTab === 'planos'
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20'
                  : 'bg-slate-800/60 text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <Layers className="w-3.5 h-3.5 text-blue-400" />
              Comparar Planos & Recursos
            </button>
            <button
              type="button"
              onClick={() => setActiveModalTab('pagamento')}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer ${
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
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer ${
                activeModalTab === 'historico'
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20'
                  : 'bg-slate-800/60 text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <Clock className="w-3.5 h-3.5 text-purple-400" />
              Histórico ({historicoPagamentos.length})
            </button>
          </div>

          {/* ABA 1: COMPARATIVO DE PLANOS */}
          {activeModalTab === 'planos' && (
            <div className="space-y-6">
              
              {/* Seletor de Periodicidade com Desconto */}
              <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-slate-950/40 p-4 rounded-2xl border border-slate-800">
                <div>
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-amber-400" /> Escolha o Ciclo de Faturamento
                  </h3>
                  <p className="text-xs text-slate-400">Economize até 20% optando por faturamento estendido</p>
                </div>

                <div className="flex items-center bg-slate-900 p-1 rounded-xl border border-slate-800 gap-1">
                  <button
                    type="button"
                    onClick={() => setPeriodoSelecionado('mensal')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                      periodoSelecionado === 'mensal'
                        ? 'bg-blue-600 text-white shadow'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Mensal
                  </button>
                  <button
                    type="button"
                    onClick={() => setPeriodoSelecionado('trimestral')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1 cursor-pointer ${
                      periodoSelecionado === 'trimestral'
                        ? 'bg-blue-600 text-white shadow'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Trimestral <span className="text-[10px] bg-emerald-500/20 text-emerald-400 px-1.5 py-0.2 rounded font-mono">-10%</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setPeriodoSelecionado('anual')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1 cursor-pointer ${
                      periodoSelecionado === 'anual'
                        ? 'bg-blue-600 text-white shadow'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Anual <span className="text-[10px] bg-emerald-500/20 text-emerald-400 px-1.5 py-0.2 rounded font-mono">-20%</span>
                  </button>
                </div>
              </div>

              {/* Grid dos 3 Planos */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {(Object.keys(PLANOS_SISTEMA) as TipoPlano[]).map((chave) => {
                  const p = PLANOS_SISTEMA[chave];
                  const precoObj = p.precos[periodoSelecionado];
                  const isPlanoAtual = planData.planoTipo === chave;
                  const jaUsouTrial = planData.trialPlanosUsados.includes(chave);
                  const podeTestar = !isPlanoAtual && !jaUsouTrial;

                  return (
                    <div
                      key={chave}
                      className={`relative rounded-3xl p-5 border flex flex-col justify-between transition-all duration-200 ${
                        p.popular 
                          ? 'bg-gradient-to-b from-blue-950/40 via-slate-900 to-slate-950 border-blue-500/50 shadow-xl shadow-blue-500/10 ring-1 ring-blue-500/30' 
                          : isPlanoAtual
                            ? 'bg-slate-950/80 border-emerald-500/40 ring-1 ring-emerald-500/20'
                            : 'bg-slate-950/50 border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      {/* Badge Topo */}
                      <div className="flex items-center justify-between gap-2 mb-3">
                        <span className="text-base font-black text-white">{p.nome}</span>
                        {p.badge && (
                          <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider ${
                            p.popular ? 'bg-blue-500/20 text-blue-300 border border-blue-500/40' : 'bg-slate-800 text-slate-300'
                          }`}>
                            {p.badge}
                          </span>
                        )}
                        {isPlanoAtual && (
                          <span className="text-[10px] bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded-full font-bold">
                            Seu Plano Atual
                          </span>
                        )}
                      </div>

                      {/* Preço */}
                      <div className="mb-4">
                        <div className="flex items-baseline gap-1">
                          <span className="text-xs text-slate-400 font-semibold">R$</span>
                          <span className="text-3xl font-black text-white font-mono">
                            {precoObj.valorMensal.toFixed(2).replace('.', ',')}
                          </span>
                          <span className="text-xs text-slate-400">/mês</span>
                        </div>
                        {periodoSelecionado !== 'mensal' && (
                          <p className="text-[11px] text-emerald-400 mt-0.5">
                            Cobrado R$ {precoObj.valorTotal.toFixed(2).replace('.', ',')} a cada {precoObj.diasValidade} dias
                          </p>
                        )}
                        <p className="text-xs text-slate-400 mt-2 leading-relaxed min-h-[48px]">
                          {p.descricao}
                        </p>
                      </div>

                      {/* Lista de Benefícios */}
                      <div className="space-y-2.5 py-4 border-t border-slate-800/80 flex-1">
                        <span className="text-[11px] font-bold text-slate-300 uppercase tracking-wider block">Recursos inclusos:</span>
                        {p.beneficios.map((ben, idx) => (
                          <div key={idx} className="flex items-start gap-2 text-xs text-slate-300">
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                            <span>{ben}</span>
                          </div>
                        ))}
                      </div>

                      {/* Ações do Card */}
                      <div className="pt-4 border-t border-slate-800/80 space-y-2">
                        {podeTestar && (
                          <Button
                            type="button"
                            onClick={() => handleSolicitarTrial(chave)}
                            disabled={ativandoTrial}
                            variant="outline"
                            className="w-full h-10 text-xs font-bold bg-purple-500/10 hover:bg-purple-500/20 text-purple-300 border-purple-500/40 rounded-xl gap-1.5 cursor-pointer"
                          >
                            <Gift className="w-3.5 h-3.5 text-purple-400" />
                            {ativandoTrial ? 'Ativando...' : 'Testar 3 Dias Grátis'}
                          </Button>
                        )}

                        <Button
                          type="button"
                          onClick={() => {
                            setPlanoSelecionado(chave);
                            setActiveModalTab('pagamento');
                          }}
                          className={`w-full h-10 text-xs font-bold rounded-xl gap-1.5 cursor-pointer ${
                            p.popular
                              ? 'bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-600/20'
                              : 'bg-slate-800 hover:bg-slate-700 text-slate-100'
                          }`}
                        >
                          <Zap className="w-3.5 h-3.5 text-emerald-400" />
                          {isPlanoAtual ? 'Renovar Este Plano' : 'Assinar Este Plano'}
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>

            </div>
          )}

          {/* ABA 2: PAGAMENTO & RENOVAÇÃO */}
          {activeModalTab === 'pagamento' && (
            <div className="space-y-6">

              {/* Resumo da Contratação Selecionada */}
              <div className="bg-slate-950/70 border border-slate-800 rounded-2xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div>
                  <span className="text-[11px] text-slate-400 font-semibold uppercase">Plano Selecionado para Pagamento:</span>
                  <div className="flex items-center gap-2 mt-0.5">
                    <h3 className="text-base font-black text-white">
                      Plano {obterPlanoPorTipo(planoSelecionado).nome}
                    </h3>
                    <Badge className="bg-blue-500/20 text-blue-300 border-blue-500/40 text-[10px] uppercase font-mono">
                      Ciclo {periodoSelecionado}
                    </Badge>
                  </div>
                </div>

                <div className="text-left sm:text-right">
                  <span className="text-[11px] text-slate-400 font-semibold uppercase">Total a Pagar:</span>
                  <p className="text-xl font-mono font-black text-emerald-400">
                    R$ {valorCobrancaFinal.toFixed(2).replace('.', ',')}
                  </p>
                </div>
              </div>

              {isRenovacaoAntecipada && (
                <div className="bg-sky-500/10 border border-sky-500/30 rounded-xl p-3 text-xs space-y-1">
                  <div className="flex items-center justify-between font-bold">
                    <span className="text-sky-300">Renovação Parcial Inteligente:</span>
                    <span className="text-emerald-400 font-mono text-sm">
                      R$ {valorCobrancaFinal.toFixed(2).replace('.', ',')}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-300">
                    Você ainda tem <b>{diasRestantes} dias</b> de validade. Você paga somente <b>{diasParaCompletar} dias</b> (R$ {valorDiaria.toFixed(2).replace('.', ',')}/dia) para estender sua validade para <b>30 dias a partir de hoje</b>!
                  </p>
                </div>
              )}

              {/* MÉTODOS DE PAGAMENTO */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                
                {/* 1. CARTÃO DE CRÉDITO (MERCADO PAGO) */}
                <div className="bg-gradient-to-br from-indigo-950/40 to-slate-950/60 rounded-2xl border border-indigo-500/30 p-5 space-y-4 flex flex-col justify-between">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-sm font-bold text-indigo-300">
                        <CreditCard className="w-4 h-4 text-indigo-400" /> Cartão de Crédito
                      </div>
                      <Badge className="bg-indigo-500/20 text-indigo-300 border-indigo-500/40 text-[10px]">
                        Até 12x
                      </Badge>
                    </div>
                    <p className="text-xs text-slate-300 leading-relaxed">
                      Pague no cartão de crédito via Mercado Pago com total segurança e parcele sua assinatura em até 12 vezes.
                    </p>
                  </div>

                  <Button
                    type="button"
                    onClick={handlePagarCartao}
                    disabled={gerandoCartao}
                    className="w-full h-11 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs rounded-xl shadow-lg shadow-indigo-600/20 gap-2 cursor-pointer"
                  >
                    {gerandoCartao ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" /> Abrindo Checkout Seguro...
                      </>
                    ) : (
                      <>
                        <CreditCard className="w-4 h-4" /> Pagar no Cartão (R$ {valorCobrancaFinal.toFixed(2).replace('.', ',')})
                      </>
                    )}
                  </Button>
                </div>

                {/* 2. PIX DINÂMICO AUTOMÁTICO */}
                <div className="bg-gradient-to-br from-emerald-950/40 to-slate-950/60 rounded-2xl border border-emerald-500/30 p-5 space-y-4 flex flex-col justify-between">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-sm font-bold text-emerald-300">
                        <Zap className="w-4 h-4 text-emerald-400" /> PIX Instantâneo
                      </div>
                      <Badge className="bg-emerald-500/20 text-emerald-300 border-emerald-500/40 text-[10px]">
                        Aprovação 24/7
                      </Badge>
                    </div>
                    <p className="text-xs text-slate-300 leading-relaxed">
                      QR Code e Copia e Cola. O sistema reconhece o pagamento na hora e libera seu acesso em poucos segundos.
                    </p>
                  </div>

                  {!pixDinamico ? (
                    <Button
                      type="button"
                      onClick={handleGerarPixDinamico}
                      disabled={gerandoPix}
                      className="w-full h-11 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl shadow-lg shadow-emerald-600/20 gap-2 cursor-pointer"
                    >
                      {gerandoPix ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" /> Gerando QR Code PIX...
                        </>
                      ) : (
                        <>
                          <QrCode className="w-4 h-4" /> Gerar QR Code PIX (R$ {valorCobrancaFinal.toFixed(2).replace('.', ',')})
                        </>
                      )}
                    </Button>
                  ) : (
                    <div className="space-y-3 bg-slate-900/90 border border-slate-800 p-3 rounded-xl">
                      {pagamentoAprovadoAuto ? (
                        <div className="p-3 bg-emerald-500/20 border border-emerald-500/40 rounded-xl text-center space-y-1">
                          <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto" />
                          <h4 className="font-bold text-white text-sm">Pagamento Confirmado!</h4>
                          <p className="text-[11px] text-emerald-300">Seu plano já está ativo.</p>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          <div className="flex items-center justify-center">
                            {pixDinamico.qrCodeBase64 ? (
                              <img 
                                src={`data:image/png;base64,${pixDinamico.qrCodeBase64}`} 
                                alt="QR Code Pix" 
                                className="w-32 h-32 object-contain bg-white p-1 rounded-lg"
                              />
                            ) : (
                              <img 
                                src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(pixDinamico.qrCode || pixDinamico.chavePix || planData.chavePixCobranca)}`} 
                                alt="QR Code Pix" 
                                className="w-32 h-32 object-contain bg-white p-1 rounded-lg"
                              />
                            )}
                          </div>
                          <Button
                            type="button"
                            size="sm"
                            onClick={handleCopyPixDinamico}
                            className="w-full gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs h-9"
                          >
                            {pixCopiado ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                            {pixCopiado ? 'Código Pix Copiado!' : 'Copiar Código Pix'}
                          </Button>
                        </div>
                      )}
                    </div>
                  )}
                </div>

              </div>

              {/* Chave PIX Manual e Envio de Comprovante */}
              <div className="bg-slate-950/40 rounded-2xl border border-slate-800 p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm font-bold text-slate-200">
                    <ShieldCheck className="w-4 h-4 text-slate-400" /> Ou Pague via Chave Pix Direta e Envie Comprovante
                  </div>
                </div>
                
                <div className="bg-slate-900 p-3 rounded-xl border border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3">
                  <div className="w-full sm:w-auto truncate">
                    <p className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">Chave Pix Cadastrada</p>
                    <p className="text-xs font-mono font-bold text-emerald-400 truncate">{planData.chavePixCobranca}</p>
                  </div>
                  <Button
                    type="button"
                    onClick={handleCopyPix}
                    variant="outline"
                    size="sm"
                    className="w-full sm:w-auto gap-1.5 bg-emerald-600/10 border-emerald-500/30 text-emerald-400 hover:bg-emerald-600/20 text-xs h-8"
                  >
                    {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    {copied ? 'Copiado!' : 'Copiar Chave'}
                  </Button>
                </div>

                <form onSubmit={handleSubmit} className="space-y-3 pt-2">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs text-slate-300 font-medium">Anexar Comprovante (Opcional)</label>
                      <label className="flex flex-col items-center justify-center h-20 border border-dashed border-slate-700 hover:border-blue-500 rounded-xl cursor-pointer bg-slate-950/40 hover:bg-blue-500/5 transition text-center p-2">
                        {comprovante ? (
                          <span className="text-xs text-emerald-400 font-bold">Comprovante Anexado ✓</span>
                        ) : (
                          <>
                            <Upload className="w-4 h-4 text-slate-400 mb-1" />
                            <span className="text-[11px] text-slate-300">Clique para enviar imagem</span>
                          </>
                        )}
                        <input type="file" accept="image/*" onChange={handleUploadComprovante} className="hidden" />
                      </label>
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs text-slate-300 font-medium">Observações</label>
                      <textarea
                        value={observacao}
                        onChange={(e) => setObservacao(e.target.value)}
                        placeholder="Ex: Pagamento referente ao Plano Intermediário..."
                        className="w-full h-20 bg-slate-950/60 border border-slate-800 rounded-xl p-2 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-blue-500 resize-none"
                      />
                    </div>
                  </div>

                  <Button
                    type="submit"
                    disabled={enviando}
                    className="w-full h-10 bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs rounded-xl gap-2 cursor-pointer border border-slate-700"
                  >
                    {enviando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                    Enviar Comprovante para Aprovação Manual
                  </Button>
                </form>
              </div>

            </div>
          )}

          {/* ABA 3: HISTÓRICO DE PAGAMENTOS */}
          {activeModalTab === 'historico' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-bold text-white flex items-center gap-2">
                    <Clock className="w-4 h-4 text-purple-400" /> Histórico de Transações & Assinaturas
                  </h4>
                  <p className="text-xs text-slate-400">
                    Acompanhe todos os pagamentos realizados, cobranças em aberto e períodos de teste.
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
                    Assim que gerar cobranças PIX, cartão ou ativar testes, eles ficarão listados aqui.
                  </p>
                </div>
              ) : (
                <div className="space-y-2.5 max-h-[450px] overflow-y-auto pr-1 scrollbar-soft">
                  {historicoPagamentos.map((pag) => {
                    const status = pag.status || 'pendente';
                    const isMercadoPago = !!pag.mp_payment_id;
                    const isCartao = pag.metodo_pagamento === 'cartao_credito' || pag.forma_pagamento === 'cartao_credito';
                    const isTrial = pag.metodo_pagamento === 'trial_3_dias' || pag.forma_pagamento === 'trial_gratis';
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
                                R$ {Number(pag.valor || 0).toFixed(2).replace('.', ',')}
                              </span>
                              {status === 'aprovado' && (
                                <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 text-[10px] font-bold">
                                  ✓ Confirmado
                                </Badge>
                              )}
                              {status === 'pendente' && (
                                <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30 text-[10px] font-bold">
                                  ⏳ Aguardando Pagamento
                                </Badge>
                              )}
                              {status === 'pendente_aprovacao' && (
                                <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30 text-[10px] font-bold">
                                  📩 Em Análise
                                </Badge>
                              )}
                              {isTrial && (
                                <Badge className="bg-purple-500/20 text-purple-300 border-purple-500/30 text-[10px] font-bold">
                                  🎁 Teste 3 Dias
                                </Badge>
                              )}
                            </div>

                            <p className="text-xs text-slate-400 flex items-center gap-1">
                              <Calendar className="w-3 h-3 text-slate-500" />
                              {formatarDataHora(pag.data_pagamento || pag.created_at)}
                            </p>
                          </div>

                          <div className="text-right shrink-0">
                            {isTrial ? (
                              <span className="text-[10px] font-mono text-purple-300 bg-purple-500/10 px-2 py-0.5 rounded border border-purple-500/20 block">
                                Período de Teste
                              </span>
                            ) : isCartao ? (
                              <span className="text-[10px] font-mono text-indigo-300 bg-indigo-500/10 px-2 py-0.5 rounded border border-indigo-500/20 block">
                                Cartão de Crédito
                              </span>
                            ) : isMercadoPago ? (
                              <span className="text-[10px] font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20 block">
                                PIX Mercado Pago #{pag.mp_payment_id}
                              </span>
                            ) : temComprovante ? (
                              <span className="text-[10px] font-mono text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded border border-blue-500/20 block">
                                Comprovante Manual
                              </span>
                            ) : (
                              <span className="text-[10px] font-mono text-slate-400 bg-slate-800 px-2 py-0.5 rounded block">
                                PIX Direto
                              </span>
                            )}
                          </div>
                        </div>

                        {pag.observacao && (
                          <p className="text-xs text-slate-400 bg-slate-900/90 rounded-lg p-2 border border-slate-800/80">
                            {pag.observacao}
                          </p>
                        )}
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
