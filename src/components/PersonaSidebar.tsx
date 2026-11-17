import { useRef, useState } from 'react';
import { Download, Plus, Search, Settings, Trash2, Upload, X } from 'lucide-react';
import { getDominantEmotion, EMOTION_META, type EmotionState, type Persona } from '../lib/emotionEngine';
import { PersonaAvatar } from './PersonaAvatar';

interface PersonaSidebarProps {
  personas: Persona[];
  activePersonaId: string;
  emotionMap: Record<string, EmotionState>;
  messageCountMap?: Record<string, number>;
  onSelectPersona: (id: string) => void;
  onCreatePersona: () => void;
  onDeletePersona: (id: string) => void;
  onExportPersona: (persona: Persona) => void;
  onImportPersona: (rawJsonText: string) => { ok: boolean; message: string };
  onOpenSettings: () => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
  isDark?: boolean;
}

export function PersonaSidebar({
  personas,
  activePersonaId,
  emotionMap,
  messageCountMap = {},
  onSelectPersona,
  onCreatePersona,
  onDeletePersona,
  onExportPersona,
  onImportPersona,
  onOpenSettings,
  mobileOpen,
  onCloseMobile,
  isDark = false,
}: PersonaSidebarProps) {
  const [rosterQuery, setRosterQuery] = useState('');
  const [importFeedback, setImportFeedback] = useState<{ ok: boolean; message: string } | null>(
    null
  );
  const importInputRef = useRef<HTMLInputElement>(null);

  const filteredPersonas = rosterQuery.trim()
    ? personas.filter((p) => {
        const q = rosterQuery.trim().toLowerCase();
        return (
          p.name.toLowerCase().includes(q) ||
          p.archetype.toLowerCase().includes(q) ||
          p.mbti.toLowerCase().includes(q)
        );
      })
    : personas;

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const text = await file.text();
      const res = onImportPersona(text);
      setImportFeedback(res);
    } catch {
      setImportFeedback({ ok: false, message: 'Gagal membaca file JSON persona.' });
    }
  };

  const content = (
    <aside
      aria-label="Daftar Persona AI"
      className="flex h-full w-[276px] flex-col border-r border-[var(--app-border)] bg-[var(--app-surface)] text-[var(--app-text)]"
    >
      <div className="flex items-center justify-between gap-3 border-b border-[var(--app-border)] px-4 py-4">
        <span className="font-display text-lg font-bold tracking-tight whitespace-nowrap shrink-0">
          Kanjou Harness
        </span>
        <button
          type="button"
          onClick={onCloseMobile}
          aria-label="Tutup daftar persona"
          className="flex h-9 w-9 items-center justify-center rounded-lg text-[var(--app-text-muted)] hover:bg-[var(--app-surface-alt)] hover:text-[var(--app-text)] lg:hidden"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="space-y-2 border-b border-[var(--app-border-soft)] p-3.5">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              onCreatePersona();
              onCloseMobile();
            }}
            className="flex flex-1 min-h-[40px] items-center justify-center gap-1.5 rounded-lg bg-slate-900 dark:bg-indigo-600 px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-slate-800 dark:hover:bg-indigo-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 whitespace-nowrap"
          >
            <Plus className="h-4 w-4 shrink-0" />
            <span>Persona Baru</span>
          </button>

          <input
            ref={importInputRef}
            type="file"
            accept=".json,application/json"
            onChange={handleImportFile}
            aria-label="Impor berkas JSON persona"
            className="hidden"
          />
          <button
            type="button"
            onClick={() => {
              setImportFeedback(null);
              importInputRef.current?.click();
            }}
            title="Impor persona dari file JSON"
            aria-label="Impor persona JSON"
            className="inline-flex min-h-[40px] items-center justify-center gap-1.5 rounded-lg border border-[var(--app-border)] bg-[var(--app-surface-alt)] px-2.5 py-2 text-xs font-medium text-[var(--app-text)] transition-colors hover:border-indigo-400 whitespace-nowrap shrink-0"
          >
            <Upload className="h-3.5 w-3.5 shrink-0" />
            <span>Impor</span>
          </button>
        </div>

        {importFeedback && (
          <div
            role="status"
            className={`flex items-center justify-between gap-2 rounded-lg border px-2.5 py-1.5 text-[11px] ${
              importFeedback.ok
                ? 'border-emerald-200 dark:border-emerald-900 bg-emerald-50 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-200'
                : 'border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/50 text-rose-800 dark:text-rose-200'
            }`}
          >
            <span className="truncate">{importFeedback.message}</span>
            <button
              type="button"
              onClick={() => setImportFeedback(null)}
              className="shrink-0 font-semibold hover:underline"
            >
              ×
            </button>
          </div>
        )}

        {personas.length > 3 && (
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--app-text-muted)]" />
            <input
              type="text"
              value={rosterQuery}
              onChange={(e) => setRosterQuery(e.target.value)}
              placeholder="Saring persona..."
              aria-label="Saring daftar persona"
              className="w-full rounded-lg border border-[var(--app-border)] bg-[var(--app-surface-alt)] py-1.5 pl-8 pr-2.5 text-xs text-[var(--app-text)] placeholder:text-[var(--app-text-muted)] focus:border-indigo-500 focus:bg-[var(--app-surface)] focus:outline-none"
            />
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-3">
        <div className="px-2 pb-2 text-xs font-medium text-[var(--app-text-muted)]">
          Daftar Identitas ({filteredPersonas.length})
        </div>
        <ul className="space-y-1.5">
          {filteredPersonas.map((persona) => {
            const isActive = persona.id === activePersonaId;
            const currentState = emotionMap[persona.id] || persona.baselineEmotions;
            const dominant = getDominantEmotion(currentState);
            const meta = EMOTION_META[dominant.key];
            const msgCount = messageCountMap[persona.id] ?? 0;

            return (
              <li key={persona.id} className="group relative flex items-center">
                <button
                  type="button"
                  onClick={() => {
                    onSelectPersona(persona.id);
                    onCloseMobile();
                  }}
                  aria-current={isActive ? 'true' : undefined}
                  className={`flex w-full items-center gap-3 rounded-xl px-2.5 py-2.5 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 ${
                    isActive
                      ? 'bg-[var(--app-surface-alt)] border border-[var(--app-border)] text-[var(--app-text)]'
                      : 'border border-transparent text-[var(--app-text)] hover:bg-[var(--app-surface-alt)]/60'
                  }`}
                >
                  <PersonaAvatar name={persona.name} avatarUrl={persona.avatarUrl} size="sm" />
                  <div className="min-w-0 flex-1 pr-12">
                    <div className="truncate text-sm font-semibold">{persona.name}</div>
                    <div className="mt-0.5 flex items-center gap-1.5 truncate text-xs text-[var(--app-text-muted)]">
                      <span className="font-mono font-medium text-[var(--app-text)]">
                        {persona.mbti}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span className="truncate">{persona.archetype}</span>
                    </div>
                    <div className="mt-0.5 flex items-center gap-1.5 truncate text-[11px] tabular-nums">
                      <span
                        style={{ color: isDark ? meta.color : meta.textColor }}
                        className="font-semibold shrink-0"
                      >
                        {meta.label} {dominant.value}%
                      </span>
                      <span aria-hidden="true" className="text-[var(--app-text-muted)]">
                        ·
                      </span>
                      <span className="truncate font-mono text-[var(--app-text-muted)]">
                        {msgCount > 0 ? `${msgCount} pesan` : 'Baru'}
                      </span>
                    </div>
                  </div>
                </button>

                <div className="absolute right-1.5 flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onExportPersona(persona);
                    }}
                    title={`Ekspor JSON ${persona.name}`}
                    aria-label={`Ekspor persona ${persona.name}`}
                    className="flex h-7 w-7 items-center justify-center rounded-md text-[var(--app-text-muted)] hover:bg-[var(--app-surface)] hover:text-indigo-600 dark:hover:text-indigo-400"
                  >
                    <Download className="h-3.5 w-3.5" />
                  </button>
                  {personas.length > 1 && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeletePersona(persona.id);
                      }}
                      title={`Hapus ${persona.name}`}
                      aria-label={`Hapus persona ${persona.name}`}
                      className="flex h-7 w-7 items-center justify-center rounded-md text-[var(--app-text-muted)] hover:bg-rose-50 dark:hover:bg-rose-950/60 hover:text-rose-600 dark:hover:text-rose-400"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="space-y-3 border-t border-[var(--app-border)] p-3.5">
        <button
          type="button"
          onClick={() => {
            onOpenSettings();
            onCloseMobile();
          }}
          className="flex w-full min-h-[40px] items-center justify-center gap-2 rounded-lg border border-[var(--app-border)] bg-[var(--app-surface-alt)] px-3.5 py-2 text-xs font-semibold text-[var(--app-text)] transition-colors hover:border-indigo-400 whitespace-nowrap"
        >
          <Settings className="h-3.5 w-3.5 shrink-0" />
          <span>Pengaturan &amp; Cadangan</span>
        </button>
        <p className="px-1 text-[11px] leading-relaxed text-[var(--app-text-muted)]">
          Percakapan, memori, dan emosi tersimpan terpisah untuk setiap persona.
        </p>
      </div>
    </aside>
  );

  return (
    <>
      <div className="hidden lg:block h-full shrink-0">{content}</div>
      {mobileOpen && (
        <div className="fixed inset-0 z-40 flex lg:hidden">
          <button
            type="button"
            aria-label="Tutup latar belakang menu"
            onClick={onCloseMobile}
            className="fixed inset-0 bg-slate-900/45 backdrop-blur-[1px]"
          />
          <div className="relative z-50 h-full">{content}</div>
        </div>
      )}
    </>
  );
}
