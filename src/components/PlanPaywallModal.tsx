'use client';

import { useState, useRef, useEffect } from 'react';
import { 
  Lock, 
  AlertTriangle, 
  Copy, 
  Check, 
  Upload, 
  Send, 
  Building2, 
  DollarSign, 
  ShieldAlert,
  LogOut,
  QrCode,
  Zap,
  Loader2,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  CreditCard,
  Gift,
  Sparkles,
  MessageCircle
} from 'lucide-react';
import { useStorePlan } from '@/hooks/useStorePlan';
import { useAuth } from '@/hooks/useAuth';
import { checkIsSuperAdmin } from '@/lib/utils';
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

export function PlanPaywallModal() {
  const { usuario, logout } = useAuth();
  const { 
    planData, 
    loading, 
    enviarSolicitacaoLiberacao, 
    solicitarTrial,
    iniciarCheckoutCartao,
    refetchPlan 
  } = useStorePlan();
  
  // Seleção de Plano e Ciclo
  const [planoEscolhido, setPlanoEscolhido] = useState<TipoPlano>(planData.planoTipo || 'entrada');
  const [periodoEscolhido, setPeriodoEscolhido] = useState<PeriodoFaturamento>('mensal');

  const infoCalculo = calcularValoresPlano(planoEscolhido, periodoEscolhido);

  // Estados para PIX Dinâmico / Mercado Pago
  const [gerandoPix, setGerandoPix] = useState(false);
  const [pixDinamico, setPixDinamico] = useState<{
    modo: string;
    paymentId: string;
    qrCode?: string;
    qrCodeBase64?: string;
    ticketUrl?: string;
    valor: number;
    chavePix?: string;
    mensagem?: string;
  } | null>(null);
  const [pixCopiado, setPixCopiado] = useState(false);
  const [pagamentoAprovadoAuto, setPagamentoAprovadoAuto] = useState(false);
  const pollingRef = useRef<NodeJS.Timeout | null>(null);

  // Cartão & Trial
  const [gerandoCartao, setGerandoCartao] = useState(false);
  const [ativandoTrial, setAtivandoTrial] = useState(false);

  // Estados para Pagamento Manual
  const [mostrarManual, setMostrarManual] = useState(false);
  const [copied, setCopied] = useState(false);
  const [comprovante, setComprovante] = useState<string | null>(null);
  const [observacao, setObservacao] = useState('');
  const [enviando, setEnviando] = useState(false);

  // Limpeza de polling
  useEffect(() => {
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, []);

  // SuperAdmins e contas de desenvolvimento não são bloqueadas pelo paywall
  if (loading || !usuario || checkIsSuperAdmin(usuario) || !planData.isBloqueado) {
    return null;
  }

  // Gerar PIX Automático (Mercado Pago)
  const handleGerarPix = async () => {
    if (!planData.lojaId) {
      toast.error('Identificação da loja não encontrada');
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
          valor: infoCalculo.valorTotal,
          plano: planoEscolhido,
          periodo: periodoEscolhido,
          email: usuario?.email,
          nome: usuario?.nome || planData.nomeLoja
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Não foi possível gerar a cobrança PIX');
      }

      setPixDinamico(data);
      if (data.modo === 'mercadopago') {
        toast.success('QR Code Pix gerado! Pague com seu app do banco para liberação imediata.');
      } else {
        toast.success(data.mensagem || 'Chave PIX gerada com sucesso.');
      }

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
                toast.success('🎉 Pagamento aprovado com sucesso! Desbloqueando painel...', {
                  duration: 6000
                });
                await refetchPlan();
                setTimeout(() => {
                  window.location.reload();
                }, 1800);
              }
            }
          } catch (pollErr) {
            console.error('Erro na checagem do pagamento:', pollErr);
          }
        }, 4000);
      }

    } catch (err: any) {
      console.error('Erro ao gerar PIX no paywall:', err);
      toast.error(err.message || 'Erro ao gerar cobrança PIX');
    } finally {
      setGerandoPix(false);
    }
  };

  // Pagar com Cartão de Crédito
  const handlePagarCartao = async () => {
    try {
      setGerandoCartao(true);
      const res = await iniciarCheckoutCartao(planoEscolhido, periodoEscolhido);
      if (res?.checkoutUrl) {
        toast.success('Abrindo checkout do Mercado Pago...');
        window.open(res.checkoutUrl, '_blank');
      } else {
        toast.error('Erro ao iniciar pagamento com cartão.');
      }
    } catch (err: any) {
      toast.error(err.message || 'Erro ao gerar link de pagamento com cartão');
    } finally {
      setGerandoCartao(false);
    }
  };

  // Ativar 3 dias de Teste Gratuito
  const handleAtivarTrial = async () => {
    try {
      setAtivandoTrial(true);
      const res = await solicitarTrial(planoEscolhido);
      toast.success(res.mensagem || '🎉 Teste de 3 dias ativado! Painel liberado!');
      await refetchPlan();
      setTimeout(() => {
        window.location.reload();
      }, 1500);
    } catch (err: any) {
      toast.error(err.message || 'Você já utilizou o teste gratuito deste plano.');
    } finally {
      setAtivandoTrial(false);
    }
  };

  const handleCopyPixDinamico = () => {
    const texto = pixDinamico?.qrCode || pixDinamico?.chavePix || planData.chavePixCobranca;
    navigator.clipboard.writeText(texto);
    setPixCopiado(true);
    toast.success('Código PIX Copia e Cola copiado com sucesso!');
    setTimeout(() => setPixCopiado(false), 2500);
  };

  const handleCopyPixManual = () => {
    navigator.clipboard.writeText(planData.chavePixCobranca);
    setCopied(true);
    toast.success('Chave Pix copiada com sucesso!');
    setTimeout(() => setCopied(false), 2500);
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

  const handleSubmitManual = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setEnviando(true);
      await enviarSolicitacaoLiberacao(comprovante || undefined, observacao || undefined);
      toast.success('Solicitação de liberação enviada com sucesso! O Super Admin irá analisar em breve.');
      setComprovante(null);
      setObservacao('');
      refetchPlan();
    } catch (err: any) {
      toast.error(err?.message || 'Erro ao enviar solicitação.');
    } finally {
      setEnviando(false);
    }
  };

  const qrCodeImageSrc = pixDinamico?.qrCodeBase64 
    ? `data:image/png;base64,${pixDinamico.qrCodeBase64}`
    : (pixDinamico?.qrCode || pixDinamico?.chavePix || planData.chavePixCobranca)
      ? `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(pixDinamico?.qrCode || pixDinamico?.chavePix || planData.chavePixCobranca)}`
      : null;

  const podeTestarPlano = !planData.trialPlanosUsados.includes(planoEscolhido);

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 sm:p-6 bg-slate-950/90 backdrop-blur-2xl overflow-y-auto">
      <div className="relative w-full max-w-2xl bg-slate-900 border border-red-500/30 rounded-3xl shadow-2xl overflow-hidden text-slate-100 p-6 sm:p-8 space-y-6 my-auto">
        
        {/* Ícone e Alerta */}
        <div className="flex flex-col items-center text-center space-y-2">
          <div className="w-14 h-14 rounded-2xl bg-red-500/10 text-red-400 border border-red-500/20 flex items-center justify-center shadow-lg shadow-red-500/10 animate-pulse">
            <Lock className="w-7 h-7" />
          </div>
          <h2 className="text-2xl font-black text-white">Acesso ao Painel Suspenso</h2>
          <p className="text-xs sm:text-sm text-slate-300 max-w-md leading-relaxed">
            A assinatura da loja <strong className="text-white">{planData.nomeLoja}</strong> venceu. Escolha seu plano e renove para desbloquear imediatamente todas as ferramentas.
          </p>
        </div>

        {/* SELETOR DE PLANOS (3 OPÇÕES) */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-300 uppercase tracking-wider">Escolha seu Plano:</span>
            
            {/* Toggle Ciclo */}
            <div className="flex items-center bg-slate-950 p-1 rounded-xl border border-slate-800 text-[11px]">
              <button
                type="button"
                onClick={() => setPeriodoEscolhido('mensal')}
                className={`px-2.5 py-1 rounded-lg font-bold transition ${
                  periodoEscolhido === 'mensal' ? 'bg-blue-600 text-white' : 'text-slate-400'
                }`}
              >
                Mensal
              </button>
              <button
                type="button"
                onClick={() => setPeriodoEscolhido('trimestral')}
                className={`px-2.5 py-1 rounded-lg font-bold transition flex items-center gap-1 ${
                  periodoEscolhido === 'trimestral' ? 'bg-blue-600 text-white' : 'text-slate-400'
                }`}
              >
                Trimestral <span className="text-[9px] bg-emerald-500/20 text-emerald-400 px-1 rounded">-10%</span>
              </button>
              <button
                type="button"
                onClick={() => setPeriodoEscolhido('anual')}
                className={`px-2.5 py-1 rounded-lg font-bold transition flex items-center gap-1 ${
                  periodoEscolhido === 'anual' ? 'bg-blue-600 text-white' : 'text-slate-400'
                }`}
              >
                Anual <span className="text-[9px] bg-emerald-500/20 text-emerald-400 px-1 rounded">-20%</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2.5">
            {(Object.keys(PLANOS_SISTEMA) as TipoPlano[]).map((chave) => {
              const p = PLANOS_SISTEMA[chave];
              const precoObj = p.precos[periodoEscolhido];
              const isSelected = planoEscolhido === chave;

              return (
                <button
                  key={chave}
                  type="button"
                  onClick={() => {
                    setPlanoEscolhido(chave);
                    setPixDinamico(null);
                  }}
                  className={`p-3 rounded-2xl border text-left transition cursor-pointer flex flex-col justify-between ${
                    isSelected
                      ? 'bg-blue-600/20 border-blue-500 ring-1 ring-blue-500/40 text-white'
                      : 'bg-slate-950/60 border-slate-800 text-slate-300 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-bold">{p.nome}</span>
                    {p.popular && (
                      <span className="text-[9px] bg-blue-500/20 text-blue-300 border border-blue-500/30 px-1.5 py-0.2 rounded-full font-mono">
                        TOP
                      </span>
                    )}
                  </div>
                  <div>
                    <div className="text-sm sm:text-base font-black font-mono text-emerald-400">
                      R$ {precoObj.valorMensal.toFixed(2).replace('.', ',')}
                    </div>
                    <span className="text-[10px] text-slate-400">/mês</span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Resumo do Valor */}
        <div className="bg-slate-950/80 rounded-2xl border border-slate-800 p-4 flex justify-between items-center text-xs">
          <div>
            <span className="text-slate-400">Plano Selecionado:</span>
            <p className="text-sm font-bold text-white">Plano {obterPlanoPorTipo(planoEscolhido).nome} ({periodoEscolhido})</p>
          </div>
          <div className="text-right">
            <span className="text-slate-400">Total a Pagar:</span>
            <p className="text-lg font-mono font-black text-emerald-400">
              R$ {infoCalculo.valorTotal.toFixed(2).replace('.', ',')}
            </p>
          </div>
        </div>

        {/* ATIVAÇÃO DE TRIAL GRATUITO (SE DISPONÍVEL) */}
        {podeTestarPlano && (
          <div className="bg-purple-950/30 border border-purple-500/30 rounded-2xl p-4 flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="space-y-0.5 text-center sm:text-left">
              <div className="flex items-center justify-center sm:justify-start gap-1.5 text-xs font-bold text-purple-300">
                <Gift className="w-4 h-4 text-purple-400" /> Quer testar antes de pagar?
              </div>
              <p className="text-[11px] text-slate-400">
                Ative <b>3 dias de teste grátis</b> deste plano agora mesmo, sem precisar de cartão.
              </p>
            </div>
            <Button
              type="button"
              onClick={handleAtivarTrial}
              disabled={ativandoTrial}
              className="w-full sm:w-auto h-9 bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs rounded-xl shadow-lg shadow-purple-600/20 gap-1.5 cursor-pointer shrink-0"
            >
              {ativandoTrial ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
              Ativar 3 Dias Grátis
            </Button>
          </div>
        )}

        {/* BOTÕES DE PAGAMENTO (PIX & CARTÃO) */}
        <div className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Botão Cartão */}
            <Button
              type="button"
              onClick={handlePagarCartao}
              disabled={gerandoCartao}
              className="w-full h-11 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs rounded-xl shadow-lg shadow-indigo-600/20 gap-2 cursor-pointer"
            >
              {gerandoCartao ? <Loader2 className="w-4 h-4 animate-spin" /> : <CreditCard className="w-4 h-4" />}
              Pagar no Cartão (até 12x)
            </Button>

            {/* Botão PIX */}
            <Button
              type="button"
              onClick={handleGerarPix}
              disabled={gerandoPix}
              className="w-full h-11 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl shadow-lg shadow-emerald-600/20 gap-2 cursor-pointer"
            >
              {gerandoPix ? <Loader2 className="w-4 h-4 animate-spin" /> : <QrCode className="w-4 h-4" />}
              Pagar com PIX Instantâneo
            </Button>
          </div>

          {/* QR CODE PIX (QUANDO GERADO) */}
          {pixDinamico && (
            <div className="bg-slate-950/90 border border-emerald-500/30 p-4 rounded-2xl space-y-3">
              {pagamentoAprovadoAuto ? (
                <div className="p-3 bg-emerald-500/20 border border-emerald-500/40 rounded-xl text-center space-y-1">
                  <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto" />
                  <h4 className="font-bold text-white text-sm">Pagamento Aprovado!</h4>
                  <p className="text-xs text-emerald-300">Desbloqueando painel...</p>
                </div>
              ) : (
                <div className="flex flex-col sm:flex-row items-center gap-4">
                  {qrCodeImageSrc && (
                    <img 
                      src={qrCodeImageSrc} 
                      alt="QR Code Pix" 
                      className="w-36 h-36 object-contain bg-white p-2 rounded-xl shadow-md shrink-0"
                    />
                  )}
                  <div className="space-y-2 flex-1 w-full">
                    <p className="text-xs text-slate-300">
                      Escaneie o QR Code ou copie o código abaixo no app do seu banco:
                    </p>
                    <Button
                      type="button"
                      onClick={handleCopyPixDinamico}
                      className="w-full h-9 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs gap-1.5"
                    >
                      {pixCopiado ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                      {pixCopiado ? 'Código Copiado!' : 'Copiar Código Pix (Copia e Cola)'}
                    </Button>
                    <div className="flex items-center justify-center gap-1.5 text-[11px] text-amber-400">
                      <Loader2 className="w-3 h-3 animate-spin" />
                      <span>Aguardando confirmação bancária em tempo real...</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ACCORDION MANUAL PIX */}
        <div className="pt-2 border-t border-slate-800/80">
          <button
            type="button"
            onClick={() => setMostrarManual(!mostrarManual)}
            className="flex items-center justify-between w-full text-xs text-slate-400 hover:text-slate-200 py-1 font-medium transition cursor-pointer"
          >
            <span>Prefere transferir por chave direta e enviar comprovante?</span>
            {mostrarManual ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>

          {mostrarManual && (
            <div className="mt-3 space-y-3 bg-slate-950/50 p-4 rounded-2xl border border-slate-800">
              <div className="flex items-center justify-between bg-slate-900 p-2.5 rounded-xl border border-slate-800 gap-2">
                <span className="text-xs font-mono font-bold text-emerald-400 truncate">{planData.chavePixCobranca}</span>
                <Button
                  onClick={handleCopyPixManual}
                  size="sm"
                  variant="outline"
                  className="gap-1 text-xs bg-emerald-600/10 border-emerald-500/30 text-emerald-400 hover:bg-emerald-600/20 h-7"
                >
                  {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                  {copied ? 'Copiado' : 'Copiar'}
                </Button>
              </div>

              <form onSubmit={handleSubmitManual} className="space-y-2.5">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <label className="flex flex-col items-center justify-center h-16 border border-dashed border-slate-700 hover:border-blue-500 rounded-xl cursor-pointer bg-slate-950/40 text-center p-1.5">
                    {comprovante ? (
                      <span className="text-xs text-emerald-400 font-bold">Comprovante Anexado ✓</span>
                    ) : (
                      <>
                        <Upload className="w-3.5 h-3.5 text-slate-400 mb-0.5" />
                        <span className="text-[10px] text-slate-300">Anexar Comprovante</span>
                      </>
                    )}
                    <input type="file" accept="image/*" onChange={handleUploadComprovante} className="hidden" />
                  </label>

                  <textarea
                    value={observacao}
                    onChange={(e) => setObservacao(e.target.value)}
                    placeholder="Mensagem ao Super Admin..."
                    className="w-full h-16 bg-slate-950/60 border border-slate-800 rounded-xl p-2 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none resize-none"
                  />
                </div>

                <Button
                  type="submit"
                  disabled={enviando}
                  className="w-full h-9 bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs rounded-xl gap-2 cursor-pointer border border-slate-700"
                >
                  {enviando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                  Enviar Comprovante
                </Button>
              </form>
            </div>
          )}
        </div>

        {/* Rodapé / WhatsApp & Logout */}
        <div className="pt-2 flex items-center justify-between border-t border-slate-800/80 text-xs">
          <a
            href={WHATSAPP_SUPORTE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-emerald-400 hover:text-emerald-300 font-semibold cursor-pointer"
          >
            <MessageCircle className="w-4 h-4" /> Falar com Suporte (31 99358-6377)
          </a>

          <button
            onClick={logout}
            className="flex items-center gap-1.5 text-slate-400 hover:text-white transition cursor-pointer"
          >
            <LogOut className="w-4 h-4" /> Sair
          </button>
        </div>

      </div>
    </div>
  );
}
