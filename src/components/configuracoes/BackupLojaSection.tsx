'use client';

import { useCallback, useEffect, useState } from 'react';
import { Cloud, Download, FileJson, FileSpreadsheet, Loader2, RefreshCw } from 'lucide-react';
import { GlassCard } from '@/components/GlassCard';
import { Button } from '@/components/ui/button';
import { TABELAS_BACKUP, type SnapshotBackup, type TabelaBackup } from '@/lib/estoque/backupLoja';
import { toast } from 'sonner';

/**
 * Seção "Backup de Dados" de Configurações > Dados.
 *
 * O botão antigo esperava 2 segundos e dizia "Backup realizado" sem copiar nada.
 * Agora baixa o JSON da loja gerado por GET /api/backup e lista as cópias
 * diárias do Storage (GET /api/backup/snapshots) com link assinado.
 */

const ROTULOS_TABELA: Record<TabelaBackup, string> = {
  aparelhos: 'Aparelhos',
  vendas: 'Vendas',
  clientes: 'Clientes',
  ordens_servico: 'Ordens de serviço',
  garantias: 'Garantias',
  lojistas_devedores: 'Lojistas (atacado)',
  pecas: 'Peças',
  tecnicos: 'Equipe',
  agendamentos: 'Agendamentos',
};

function formatarBytes(bytes: number | null): string {
  if (bytes === null) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function nomeDoCabecalho(resposta: Response, padrao: string): string {
  const disposicao = resposta.headers.get('Content-Disposition') || '';
  return disposicao.match(/filename="([^"]+)"/)?.[1] || padrao;
}

async function baixarDaApi(url: string, nomePadrao: string): Promise<void> {
  const resposta = await fetch(url, { credentials: 'same-origin' });
  if (!resposta.ok) {
    const corpo = await resposta.json().catch(() => null);
    throw new Error(corpo?.error || `Falha ao gerar o arquivo (${resposta.status}).`);
  }
  const blob = await resposta.blob();
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = nomeDoCabecalho(resposta, nomePadrao);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(link.href);
}

export function BackupLojaSection() {
  const [baixandoJson, setBaixandoJson] = useState(false);
  const [tabelaCsv, setTabelaCsv] = useState<TabelaBackup>('vendas');
  const [baixandoCsv, setBaixandoCsv] = useState(false);
  const [ultimoBackup, setUltimoBackup] = useState<Date | null>(null);
  const [snapshots, setSnapshots] = useState<SnapshotBackup[]>([]);
  const [avisoSnapshots, setAvisoSnapshots] = useState<string | null>(null);
  const [carregandoSnapshots, setCarregandoSnapshots] = useState(false);

  const carregarSnapshots = useCallback(async () => {
    setCarregandoSnapshots(true);
    setAvisoSnapshots(null);
    try {
      const resposta = await fetch('/api/backup/snapshots', { credentials: 'same-origin' });
      const corpo = await resposta.json().catch(() => null);
      if (!resposta.ok) throw new Error(corpo?.error || `Erro ${resposta.status}`);
      setSnapshots(corpo?.snapshots || []);
      if (corpo?.aviso) setAvisoSnapshots(corpo.aviso);
    } catch (erro: any) {
      setAvisoSnapshots(erro?.message || 'Não foi possível listar as cópias diárias.');
    } finally {
      setCarregandoSnapshots(false);
    }
  }, []);

  useEffect(() => {
    void carregarSnapshots();
  }, [carregarSnapshots]);

  const baixarJson = async () => {
    setBaixandoJson(true);
    try {
      await baixarDaApi('/api/backup', 'backup-loja.json');
      setUltimoBackup(new Date());
      toast.success('Backup baixado. Guarde o arquivo em um lugar seguro.');
    } catch (erro: any) {
      toast.error(erro?.message || 'Não foi possível gerar o backup.');
    } finally {
      setBaixandoJson(false);
    }
  };

  const baixarCsv = async () => {
    setBaixandoCsv(true);
    try {
      await baixarDaApi(`/api/backup?formato=csv&tabela=${tabelaCsv}`, `${tabelaCsv}.csv`);
    } catch (erro: any) {
      toast.error(erro?.message || 'Não foi possível exportar a tabela.');
    } finally {
      setBaixandoCsv(false);
    }
  };

  return (
    <GlassCard className="rounded-3xl">
      <div className="pb-4 border-b border-white/10 mb-4">
        <h3 className="text-base sm:text-lg font-bold">Backup de Dados</h3>
        <p className="text-xs sm:text-sm text-muted-foreground">
          Copia aparelhos, vendas, clientes, OS, garantias, lojistas, peças, equipe e agendamentos da sua loja.
        </p>
      </div>

      <div className="space-y-5">
        <div className="space-y-3">
          {ultimoBackup && (
            <div className="bg-green-50 dark:bg-green-950/50 border border-green-200 dark:border-green-800 rounded-lg p-3 sm:p-4">
              <p className="text-sm text-green-800 dark:text-green-300">
                ✓ Backup baixado em {ultimoBackup.toLocaleDateString('pt-BR')} às {ultimoBackup.toLocaleTimeString('pt-BR')}
              </p>
            </div>
          )}
          <Button onClick={baixarJson} disabled={baixandoJson} className="w-full h-10 sm:h-auto gap-2">
            {baixandoJson ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileJson className="w-4 h-4" />}
            {baixandoJson ? 'Gerando o arquivo...' : 'Fazer Backup Agora (JSON completo)'}
          </Button>

          <div className="flex flex-col sm:flex-row gap-2">
            <select
              value={tabelaCsv}
              onChange={(e) => setTabelaCsv(e.target.value as TabelaBackup)}
              className="input-glass flex-1 text-sm"
              aria-label="Tabela para exportar em CSV"
            >
              {TABELAS_BACKUP.map((t) => (
                <option key={t} value={t}>
                  {ROTULOS_TABELA[t]}
                </option>
              ))}
            </select>
            <Button variant="outline" onClick={baixarCsv} disabled={baixandoCsv} className="gap-2">
              {baixandoCsv ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileSpreadsheet className="w-4 h-4" />}
              Exportar CSV
            </Button>
          </div>
        </div>

        <div className="border-t border-white/10 pt-4 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h4 className="text-sm font-semibold flex items-center gap-2">
                <Cloud className="w-4 h-4 text-blue-400" /> Cópias diárias automáticas
              </h4>
              <p className="text-xs text-muted-foreground">
                Todo dia às 3h (horário de Brasília) uma cópia da loja é guardada por 30 dias. Os links valem 15 minutos.
              </p>
            </div>
            <Button variant="ghost" size="sm" onClick={carregarSnapshots} disabled={carregandoSnapshots} aria-label="Atualizar lista">
              <RefreshCw className={`w-4 h-4 ${carregandoSnapshots ? 'animate-spin' : ''}`} />
            </Button>
          </div>

          {avisoSnapshots && <p className="text-xs text-amber-300">{avisoSnapshots}</p>}

          {carregandoSnapshots && snapshots.length === 0 ? (
            <p className="text-xs text-muted-foreground">Carregando...</p>
          ) : snapshots.length === 0 ? (
            !avisoSnapshots && <p className="text-xs text-muted-foreground">Nenhuma cópia diária ainda. A primeira aparece depois da próxima madrugada.</p>
          ) : (
            <ul className="divide-y divide-white/5 rounded-2xl border border-white/10 bg-white/5">
              {snapshots.map((s) => (
                <li key={s.nome} className="flex items-center justify-between gap-3 px-3.5 py-2.5 text-sm">
                  <div>
                    <span className="font-semibold tabular-nums">{s.data.split('-').reverse().join('/')}</span>
                    {s.bytes !== null && <span className="text-xs text-muted-foreground ml-2">{formatarBytes(s.bytes)}</span>}
                  </div>
                  {s.url ? (
                    <a
                      href={s.url}
                      className="inline-flex items-center gap-1.5 text-xs font-bold text-blue-400 hover:text-blue-300"
                      download={s.nome}
                    >
                      <Download className="w-3.5 h-3.5" /> Baixar
                    </a>
                  ) : (
                    <span className="text-xs text-muted-foreground">sem link</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </GlassCard>
  );
}
