'use client';

import { useState } from 'react';
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
  LogOut
} from 'lucide-react';
import { useStorePlan } from '@/hooks/useStorePlan';
import { useAuth } from '@/hooks/useAuth';
import { checkIsSuperAdmin } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

export function PlanPaywallModal() {
  const { usuario, logout } = useAuth();
  const { planData, loading, enviarSolicitacaoLiberacao, refetchPlan } = useStorePlan();
  const [copied, setCopied] = useState(false);
  const [comprovante, setComprovante] = useState<string | null>(null);
  const [observacao, setObservacao] = useState('');
  const [enviando, setEnviando] = useState(false);

  // SuperAdmins e contas de desenvolvimento não são bloqueadas pelo paywall
  if (loading || !usuario || checkIsSuperAdmin(usuario) || !planData.isBloqueado) {
    return null;
  }

  const handleCopyPix = () => {
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

  const handleSubmit = async (e: React.FormEvent) => {
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

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 sm:p-6 bg-slate-950/90 backdrop-blur-2xl">
      <div className="relative w-full max-w-xl bg-slate-900 border border-red-500/30 rounded-3xl shadow-2xl overflow-hidden text-slate-100 p-6 sm:p-8 space-y-6">
        
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

        {/* Chave Pix */}
        <div className="bg-slate-950/60 rounded-2xl border border-slate-800 p-4 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-400 font-medium">Chave Pix para Pagamento:</span>
            <span className="text-[10px] text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded font-mono">Chave Oficial</span>
          </div>
          <div className="flex items-center justify-between bg-slate-900 p-3 rounded-xl border border-slate-800 gap-2">
            <span className="text-xs font-mono font-bold text-emerald-400 truncate">{planData.chavePixCobranca}</span>
            <Button
              onClick={handleCopyPix}
              size="sm"
              variant="outline"
              className="gap-1.5 text-xs bg-emerald-600/10 border-emerald-500/30 text-emerald-400 hover:bg-emerald-600/20 shrink-0"
            >
              {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              {copied ? 'Copiado' : 'Copiar'}
            </Button>
          </div>
        </div>

        {/* Form para Enviar Comprovante */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {planData.solicitacaoStatus === 'pendente_aprovacao' ? (
            <div className="bg-amber-500/10 border border-amber-500/30 text-amber-300 p-4 rounded-2xl text-xs text-center space-y-1">
              <p className="font-bold">⏳ Solicitação de Liberação Enviada!</p>
              <p className="text-[11px] opacity-90">O Super Admin foi notificado e liberará seu acesso assim que o comprovante for verificado.</p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Upload */}
                <label className="flex flex-col items-center justify-center h-24 border border-dashed border-slate-700 hover:border-blue-500 rounded-xl cursor-pointer bg-slate-950/40 hover:bg-blue-500/5 transition text-center p-2">
                  {comprovante ? (
                    <span className="text-xs text-emerald-400 font-bold">Comprovante Anexado ✓</span>
                  ) : (
                    <>
                      <Upload className="w-5 h-5 text-slate-400 mb-1" />
                      <span className="text-xs text-slate-300 font-medium">Anexar Comprovante</span>
                    </>
                  )}
                  <input type="file" accept="image/*" onChange={handleUploadComprovante} className="hidden" />
                </label>

                {/* Observação */}
                <textarea
                  value={observacao}
                  onChange={(e) => setObservacao(e.target.value)}
                  placeholder="Mensagem ao Super Admin..."
                  className="w-full h-24 bg-slate-950/60 border border-slate-800 rounded-xl p-2.5 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-blue-500 resize-none"
                />
              </div>

              <Button
                type="submit"
                disabled={enviando}
                className="w-full h-11 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-xs rounded-xl shadow-lg shadow-emerald-500/20 gap-2 cursor-pointer"
              >
                {enviando ? (
                  <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
                Enviar Comprovante e Solicitar Liberação
              </Button>
            </>
          )}
        </form>

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
