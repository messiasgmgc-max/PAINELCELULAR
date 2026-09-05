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
  ChevronUp
} from 'lucide-react';
import { useStorePlan } from '@/hooks/useStorePlan';
import { useAuth } from '@/hooks/useAuth';
import { checkIsSuperAdmin } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

export function PlanPaywallModal() {
  const { usuario, logout } = useAuth();
  const { planData, loading, enviarSolicitacaoLiberacao, refetchPlan } = useStorePlan();
  
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
          valor: planData.valorMensalidade,
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

      // Inicia polling automático apenas se for Mercado Pago dinâmico real
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

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 sm:p-6 bg-slate-950/90 backdrop-blur-2xl overflow-y-auto">
      <div className="relative w-full max-w-xl bg-slate-900 border border-red-500/30 rounded-3xl shadow-2xl overflow-hidden text-slate-100 p-6 sm:p-8 space-y-6 my-auto">
        
        {/* Ícone e Alerta */}
        <div className="flex flex-col items-center text-center space-y-3">
          <div className="w-16 h-16 rounded-3xl bg-red-500/10 text-red-400 border border-red-500/20 flex items-center justify-center shadow-lg shadow-red-500/10 animate-pulse">
            <Lock className="w-8 h-8" />
          </div>
          <h2 className="text-2xl font-black text-white">Acesso ao Painel Suspenso</h2>
          <p className="text-xs sm:text-sm text-slate-300 max-w-md leading-relaxed">
            A mensalidade do plano da loja <span className="font-bold text-white">{planData.nomeLoja}</span> está pendente de pagamento ou bloqueada pelo administrador.
          </p>
        </div>

        {/* Detalhes do Plano */}
        <div className="bg-slate-950/80 rounded-2xl border border-slate-800 p-4 flex justify-between items-center text-xs">
          <div>
            <span className="text-slate-400">Valor da Mensalidade:</span>
            <p className="text-base font-bold text-emerald-400">R$ {planData.valorMensalidade.toFixed(2).replace('.', ',')}</p>
          </div>
          <div className="text-right">
            <span className="text-slate-400">Status Atual:</span>
            <p className="text-xs font-bold text-red-400 uppercase tracking-wider">
              {planData.planoStatus === 'vencido' ? 'Mensalidade Vencida' : 'Loja Bloqueada'}
            </p>
          </div>
        </div>

        {/* ÁREA PRINCIPAL: PIX DINÂMICO MERCADO PAGO COM LIBERAÇÃO INSTANTÂNEA */}
        <div className="space-y-4">
          {!pixDinamico ? (
            <div className="space-y-3">
              <Button
                type="button"
                onClick={handleGerarPix}
                disabled={gerandoPix}
                className="w-full h-12 bg-gradient-to-r from-emerald-600 via-teal-600 to-sky-600 hover:from-emerald-500 hover:via-teal-500 hover:to-sky-500 text-white font-black text-xs sm:text-sm rounded-2xl shadow-xl shadow-emerald-500/20 gap-2 cursor-pointer transition-all duration-200 hover:scale-[1.01]"
              >
                {gerandoPix ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" /> Gerando QR Code Oficial do Mercado Pago...
                  </>
                ) : (
                  <>
                    <QrCode className="w-5 h-5" /> Gerar QR Code PIX (Liberação Instantânea)
                  </>
                )}
              </Button>
              <p className="text-[11px] text-center text-slate-400 flex items-center justify-center gap-1.5">
                <Zap className="w-3.5 h-3.5 text-amber-400" />
                <span>O sistema reconhece o pagamento na hora e <b>desbloqueia o painel imediatamente</b>.</span>
              </p>
            </div>
          ) : (
            <div className="bg-slate-950/90 border border-emerald-500/30 p-5 rounded-2xl space-y-4 shadow-lg">
              {pagamentoAprovadoAuto ? (
                <div className="p-4 bg-emerald-500/20 border border-emerald-500/40 rounded-xl text-center space-y-2">
                  <CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto animate-bounce" />
                  <h3 className="font-bold text-white text-base">Pagamento Confirmado!</h3>
                  <p className="text-xs text-emerald-300">Seu acesso foi restabelecido e sua loja já está liberada.</p>
                </div>
              ) : (
                <>
                  <div className="flex flex-col sm:flex-row items-center justify-center gap-5">
                    {/* Imagem do QR Code */}
                    {qrCodeImageSrc ? (
                      <div className="bg-white p-3 rounded-2xl shrink-0 shadow-xl border-2 border-emerald-500/30">
                        <img 
                          src={qrCodeImageSrc} 
                          alt="QR Code Pix Mercado Pago" 
                          className="w-44 h-44 object-contain"
                        />
                      </div>
                    ) : (
                      <div className="w-44 h-44 bg-slate-900 border border-slate-800 rounded-2xl flex items-center justify-center text-center p-3 text-xs text-slate-400">
                        <QrCode className="w-12 h-12 text-emerald-400 opacity-70" />
                      </div>
                    )}

                    {/* Dados Copia e Cola */}
                    <div className="space-y-2.5 flex-1 w-full">
                      <div className="flex items-center justify-between text-xs pb-1 border-b border-slate-800">
                        <span className="text-slate-400 font-semibold">Valor da Mensalidade:</span>
                        <span className="text-emerald-400 font-bold font-mono text-sm">
                          R$ {planData.valorMensalidade.toFixed(2).replace('.', ',')}
                        </span>
                      </div>

                      <p className="text-[11px] text-slate-300">
                        Abra o app do seu banco, escolha <b>Pix Copia e Cola</b> ou aponte a câmera para o QR Code.
                      </p>
                      
                      <Button
                        type="button"
                        onClick={handleCopyPixDinamico}
                        className="w-full gap-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs h-10 rounded-xl cursor-pointer"
                      >
                        {pixCopiado ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                        {pixCopiado ? 'Código Pix Copiado!' : 'Copiar Código Pix (Copia e Cola)'}
                      </Button>

                      {pixDinamico.modo === 'mercadopago' ? (
                        <div className="flex items-center justify-center gap-2 pt-1 text-[11px] text-amber-400 bg-amber-500/10 py-1.5 px-2 rounded-lg border border-amber-500/20">
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          <span>Aguardando confirmação bancária em tempo real...</span>
                        </div>
                      ) : (
                        <div className="flex items-center justify-center gap-2 pt-1 text-[11px] text-sky-300 bg-sky-500/10 py-1.5 px-2 rounded-lg border border-sky-500/20">
                          <span>Após pagar, anexe o comprovante na seção abaixo para liberação.</span>
                        </div>
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {/* ÁREA SECUNDÁRIA: PAGAMENTO MANUAL POR CHAVE PIX (ACCORDION) */}
        <div className="pt-2 border-t border-slate-800/80">
          <button
            type="button"
            onClick={() => setMostrarManual(!mostrarManual)}
            className="flex items-center justify-between w-full text-xs text-slate-400 hover:text-slate-200 py-1 font-medium transition cursor-pointer"
          >
            <span>Prefere pagar via Chave PIX Manual e enviar comprovante?</span>
            {mostrarManual ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>

          {mostrarManual && (
            <div className="mt-3 space-y-4 bg-slate-950/50 p-4 rounded-2xl border border-slate-800">
              {/* Chave Pix */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-slate-400 font-medium">Chave Pix Oficial:</span>
                  <span className="text-[10px] text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded font-mono">Chave Cadastrada</span>
                </div>
                <div className="flex items-center justify-between bg-slate-900 p-2.5 rounded-xl border border-slate-800 gap-2">
                  <span className="text-xs font-mono font-bold text-emerald-400 truncate">{planData.chavePixCobranca}</span>
                  <Button
                    onClick={handleCopyPixManual}
                    size="sm"
                    variant="outline"
                    className="gap-1.5 text-xs bg-emerald-600/10 border-emerald-500/30 text-emerald-400 hover:bg-emerald-600/20 shrink-0 h-8"
                  >
                    {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    {copied ? 'Copiado' : 'Copiar'}
                  </Button>
                </div>
              </div>

              {/* Form para Enviar Comprovante */}
              <form onSubmit={handleSubmitManual} className="space-y-3">
                {planData.solicitacaoStatus === 'pendente_aprovacao' ? (
                  <div className="bg-amber-500/10 border border-amber-500/30 text-amber-300 p-3 rounded-xl text-xs text-center space-y-1">
                    <p className="font-bold">⏳ Solicitação de Liberação Enviada!</p>
                    <p className="text-[11px] opacity-90">O Super Admin foi notificado e liberará seu acesso assim que o comprovante for verificado.</p>
                  </div>
                ) : (
                  <>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      {/* Upload */}
                      <label className="flex flex-col items-center justify-center h-20 border border-dashed border-slate-700 hover:border-blue-500 rounded-xl cursor-pointer bg-slate-950/40 hover:bg-blue-500/5 transition text-center p-2">
                        {comprovante ? (
                          <span className="text-xs text-emerald-400 font-bold">Comprovante Anexado ✓</span>
                        ) : (
                          <>
                            <Upload className="w-4 h-4 text-slate-400 mb-1" />
                            <span className="text-[11px] text-slate-300 font-medium">Anexar Comprovante</span>
                          </>
                        )}
                        <input type="file" accept="image/*" onChange={handleUploadComprovante} className="hidden" />
                      </label>

                      {/* Observação */}
                      <textarea
                        value={observacao}
                        onChange={(e) => setObservacao(e.target.value)}
                        placeholder="Mensagem ao Super Admin..."
                        className="w-full h-20 bg-slate-950/60 border border-slate-800 rounded-xl p-2 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-blue-500 resize-none"
                      />
                    </div>

                    <Button
                      type="submit"
                      disabled={enviando}
                      className="w-full h-10 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white font-bold text-xs rounded-xl gap-2 cursor-pointer"
                    >
                      {enviando ? (
                        <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
                      ) : (
                        <Send className="w-4 h-4" />
                      )}
                      Enviar Comprovante para Análise Manual
                    </Button>
                  </>
                )}
              </form>
            </div>
          )}
        </div>

        {/* Rodapé / Botão de Logout */}
        <div className="pt-2 flex justify-center border-t border-slate-800/80">
          <button
            onClick={logout}
            className="flex items-center gap-2 text-xs text-slate-400 hover:text-white transition cursor-pointer"
          >
            <LogOut className="w-4 h-4" /> Sair / Trocar de Usuário
          </button>
        </div>
      </div>
    </div>
  );
}
