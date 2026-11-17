import { useEffect, useRef, useState } from 'react';
import {
  Download,
  ExternalLink,
  Globe,
  ImagePlus,
  Loader2,
  Plus,
  Quote,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import {
  ARCHETYPE_PRESETS,
  DEFAULT_RESPONSE_CONFIG,
  EMOTION_META,
  EMOTION_ORDER,
  MBTI_OPTIONS,
  normalizeEmotions,
  sanitizeResponseConfig,
  type AnalyzedPersonaDraft,
  type Archetype,
  type EmotionState,
  type MBTIType,
  type Persona,
  type TrainingRule,
  type WebSourceRef,
} from '../lib/emotionEngine';
import { buildByokHeaders, type ByokConfig } from '../lib/byok';
import { PRESET_AVATARS } from '../lib/settings';
import { PersonaAvatar } from './PersonaAvatar';

interface PersonaEditorModalProps {
  open: boolean;
  initialPersona: Persona | null; // null = create new
  byok?: ByokConfig;
  onClose: () => void;
  onSave: (persona: Persona) => void;
  onExportPersona?: (persona: Persona) => void;
}

type ResearchCategory = 'otomatis' | 'sejarah' | 'publik_figur' | 'fiksi_film_game';

const ARCHETYPES = Object.keys(ARCHETYPE_PRESETS) as Archetype[];

const CATEGORY_OPTIONS: { id: ResearchCategory; label: string }[] = [
  { id: 'otomatis', label: 'Otomatis' },
  { id: 'sejarah', label: 'Tokoh Sejarah' },
  { id: 'publik_figur', label: 'Publik Figur' },
  { id: 'fiksi_film_game', label: 'Film & Game' },
];

const SAMPLE_CHARACTERS: { name: string; category: ResearchCategory }[] = [
  { name: 'B.J. Habibie', category: 'sejarah' },
  { name: 'Nikola Tesla', category: 'sejarah' },
  { name: 'Sherlock Holmes', category: 'fiksi_film_game' },
  { name: 'Geralt of Rivia', category: 'fiksi_film_game' },
];

export function PersonaEditorModal({
  open,
  initialPersona,
  byok,
  onClose,
  onSave,
  onExportPersona,
}: PersonaEditorModalProps) {
  const [name, setName] = useState('');
  const [roleTitle, setRoleTitle] = useState('');
  const [mbti, setMbti] = useState<MBTIType>('INTJ');
  const [archetype, setArchetype] = useState<Archetype>('Tsundere');
  const [basePersonality, setBasePersonality] = useState('');
  const [speakingStyle, setSpeakingStyle] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [photoError, setPhotoError] = useState('');
  const [rawBaseline, setRawBaseline] = useState<EmotionState>(ARCHETYPE_PRESETS.Tsundere.baseline);
  const [error, setError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Web character research state
  const [queryName, setQueryName] = useState('');
  const [researchCategory, setResearchCategory] = useState<ResearchCategory>('otomatis');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analyzeError, setAnalyzeError] = useState('');
  const [webSummary, setWebSummary] = useState('');
  const [sourceCategory, setSourceCategory] = useState<string | undefined>(undefined);
  const [webSources, setWebSources] = useState<WebSourceRef[]>([]);
  const [sourceFacts, setSourceFacts] = useState<string[]>([]);
  const [aiInterpretationNote, setAiInterpretationNote] = useState('');
  const [analyzedReactivity, setAnalyzedReactivity] = useState<number | null>(null);
  const [analyzedInertia, setAnalyzedInertia] = useState<number | null>(null);
  const [analyzedRules, setAnalyzedRules] = useState<TrainingRule[] | null>(null);

  // Manual source input state
  const [showAddSource, setShowAddSource] = useState(false);
  const [manualSourceTitle, setManualSourceTitle] = useState('');
  const [manualSourceUrl, setManualSourceUrl] = useState('');
  const [manualSourceName, setManualSourceName] = useState('');
  const [manualSourceSnippet, setManualSourceSnippet] = useState('');
  const [newFactInput, setNewFactInput] = useState('');

  useEffect(() => {
    if (!open) return;
    setError('');
    setPhotoError('');
    setAnalyzeError('');
    setIsAnalyzing(false);
    setShowAddSource(false);
    setManualSourceTitle('');
    setManualSourceUrl('');
    setManualSourceName('');
    setManualSourceSnippet('');
    setNewFactInput('');

    if (initialPersona) {
      setName(initialPersona.name);
      setRoleTitle(initialPersona.roleTitle);
      setMbti(initialPersona.mbti);
      setArchetype(initialPersona.archetype);
      setBasePersonality(initialPersona.basePersonality);
      setSpeakingStyle(initialPersona.speakingStyle);
      setAvatarUrl(initialPersona.avatarUrl || '');
      setRawBaseline({ ...initialPersona.baselineEmotions });
      setQueryName(initialPersona.name);
      setSourceCategory(initialPersona.sourceCategory);
      setWebSources(initialPersona.webSources || []);
      setSourceFacts(initialPersona.sourceFacts || []);
      setAiInterpretationNote(initialPersona.aiInterpretationNote || '');
      setWebSummary('');
      setAnalyzedReactivity(null);
      setAnalyzedInertia(null);
      setAnalyzedRules(null);
    } else {
      const preset = ARCHETYPE_PRESETS.Tsundere;
      setName('');
      setRoleTitle('Rekan Diskusi Kognitif');
      setMbti('INTJ');
      setArchetype('Tsundere');
      setBasePersonality(preset.description);
      setSpeakingStyle(preset.speakingHint);
      setAvatarUrl('');
      setRawBaseline({ ...preset.baseline });
      setQueryName('');
      setResearchCategory('otomatis');
      setSourceCategory(undefined);
      setWebSources([]);
      setSourceFacts([]);
      setAiInterpretationNote('');
      setWebSummary('');
      setAnalyzedReactivity(null);
      setAnalyzedInertia(null);
      setAnalyzedRules(null);
    }
  }, [open, initialPersona]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const applyArchetypePreset = (selected: Archetype) => {
    setArchetype(selected);
    const preset = ARCHETYPE_PRESETS[selected];
    setRawBaseline({ ...preset.baseline });
    if (!initialPersona || !basePersonality.trim()) {
      setBasePersonality(preset.description);
      setSpeakingStyle(preset.speakingHint);
    }
  };

  const handleAnalyzeFromWeb = async (overrideName?: string, overrideCat?: ResearchCategory) => {
    const targetName = (overrideName ?? queryName).trim();
    const targetCat = overrideCat ?? researchCategory;
    if (targetName.length < 2) {
      setAnalyzeError('Ketik nama tokoh atau karakter minimal 2 huruf untuk dianalisa.');
      return;
    }

    setQueryName(targetName);
    setResearchCategory(targetCat);
    setAnalyzeError('');
    setIsAnalyzing(true);

    try {
      const res = await fetch('/api/persona/analyze', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(byok ? buildByokHeaders(byok) : {}),
        },
        body: JSON.stringify({
          characterName: targetName,
          category: targetCat,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || `Gagal menganalisa tokoh (${res.status}).`);
      }

      const draft = data.draft as AnalyzedPersonaDraft;
      const sources = Array.isArray(data.sources) ? (data.sources as WebSourceRef[]) : [];

      setName(draft.name);
      setRoleTitle(draft.roleTitle);
      setMbti(draft.mbti);
      setArchetype(draft.archetype);
      setBasePersonality(draft.basePersonality);
      setSpeakingStyle(draft.speakingStyle);
      setRawBaseline(draft.baselineEmotions);
      setSourceCategory(draft.sourceCategory);
      setWebSummary(draft.webSummary);
      setWebSources(sources);
      setSourceFacts(Array.isArray(draft.sourceFacts) ? draft.sourceFacts : []);
      setAiInterpretationNote(draft.aiInterpretationNote || '');
      setAnalyzedReactivity(draft.reactivity);
      setAnalyzedInertia(draft.inertia);
      setAnalyzedRules(draft.suggestedRules);
      setError('');
    } catch (err: unknown) {
      setAnalyzeError(err instanceof Error ? err.message : 'Gagal menghubungi layanan analisa web.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleAddManualSource = () => {
    const title = manualSourceTitle.trim();
    const url = manualSourceUrl.trim();
    if (!title || !/^https?:\/\//i.test(url)) {
      setAnalyzeError('Sumber manual membutuhkan judul dan URL diawali http:// atau https://.');
      return;
    }
    setAnalyzeError('');
    setWebSources((prev) => [
      ...prev,
      {
        title,
        url,
        ...(manualSourceName.trim() ? { sourceName: manualSourceName.trim() } : {}),
        ...(manualSourceSnippet.trim() ? { snippet: manualSourceSnippet.trim() } : {}),
      },
    ]);
    setManualSourceTitle('');
    setManualSourceUrl('');
    setManualSourceName('');
    setManualSourceSnippet('');
    setShowAddSource(false);
  };

  const handleAddFact = () => {
    const fact = newFactInput.trim();
    if (!fact) return;
    setSourceFacts((prev) => [...prev, fact]);
    setNewFactInput('');
  };

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setPhotoError('Pilih file gambar (JPG, PNG, atau WebP).');
      return;
    }
    setPhotoError('');
    const reader = new FileReader();
    reader.onload = () => {
      const rawUrl = typeof reader.result === 'string' ? reader.result : '';
      if (!rawUrl) return;
      const img = new Image();
      img.onload = () => {
        const size = 256;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          setAvatarUrl(rawUrl);
          return;
        }
        const minSide = Math.min(img.width, img.height);
        const sx = (img.width - minSide) / 2;
        const sy = (img.height - minSide) / 2;
        ctx.drawImage(img, sx, sy, minSide, minSide, 0, 0, size, size);
        setAvatarUrl(canvas.toDataURL('image/jpeg', 0.85));
      };
      img.onerror = () => setPhotoError('File gambar tidak dapat dibaca.');
      img.src = rawUrl;
    };
    reader.onerror = () => setPhotoError('Gagal membaca file gambar.');
    reader.readAsDataURL(file);
  };

  const normalizedPreview = normalizeEmotions(rawBaseline);

  const buildPersonaObject = (): Persona => {
    const preset = ARCHETYPE_PRESETS[archetype];
    const cleanedAvatar = avatarUrl.trim();
    const cleanedFacts = sourceFacts.map((f) => f.trim()).filter(Boolean);
    const cleanedInterp = aiInterpretationNote.trim();

    return {
      id: initialPersona ? initialPersona.id : `persona-${Date.now()}`,
      name: name.trim(),
      roleTitle: roleTitle.trim() || `${mbti} · ${archetype}`,
      mbti,
      archetype,
      basePersonality: basePersonality.trim(),
      speakingStyle: speakingStyle.trim() || preset.speakingHint,
      avatarUrl: cleanedAvatar || undefined,
      sourceCategory,
      webSources: webSources.length > 0 ? webSources : undefined,
      sourceFacts: cleanedFacts.length > 0 ? cleanedFacts : undefined,
      aiInterpretationNote: cleanedInterp || undefined,
      baselineEmotions: normalizedPreview,
      training: initialPersona
        ? {
            ...initialPersona.training,
            reactivity: analyzedReactivity ?? initialPersona.training.reactivity,
            inertia: analyzedInertia ?? initialPersona.training.inertia,
            rules:
              analyzedRules && analyzedRules.length > 0
                ? analyzedRules
                : initialPersona.training.rules,
          }
        : {
            reactivity: analyzedReactivity ?? preset.reactivity,
            inertia: analyzedInertia ?? preset.inertia,
            intensityBias: {
              rendah: 0.65,
              sedang: 1.0,
              tinggi: 1.45,
              ekstrem: 1.85,
            },
            rules: analyzedRules || [],
          },
      responseConfig: sanitizeResponseConfig(
        initialPersona?.responseConfig || DEFAULT_RESPONSE_CONFIG
      ),
    };
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Nama persona wajib diisi.');
      return;
    }
    if (!basePersonality.trim()) {
      setError('Deskripsi sifat dasar & kepribadian wajib diisi.');
      return;
    }
    onSave(buildPersonaObject());
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-[1px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="persona-modal-title"
    >
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-[var(--app-border)] bg-[var(--app-surface)] text-[var(--app-text)] shadow-xl">
        <div className="flex items-center justify-between border-b border-[var(--app-border)] px-6 py-4">
          <h2 id="persona-modal-title" className="font-display text-lg font-bold">
            {initialPersona ? `Edit Persona: ${initialPersona.name}` : 'Buat Persona AI Baru'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup editor persona"
            className="flex h-9 w-9 items-center justify-center rounded-lg text-[var(--app-text-muted)] hover:bg-[var(--app-surface-alt)] hover:text-[var(--app-text)]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
            {/* Riset Karakter dari Web */}
            <section
              aria-label="Riset Tokoh dari Web"
              className="space-y-3 rounded-xl border border-indigo-200/80 dark:border-indigo-500/30 bg-indigo-50/40 dark:bg-indigo-950/30 p-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-xs font-semibold text-indigo-950 dark:text-indigo-200">
                  <Globe className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
                  <span>Analisa Tokoh Sejarah, Publik Figur, atau Karakter Fiksi dari Web</span>
                </div>
                <button
                  type="button"
                  onClick={() => setShowAddSource((s) => !s)}
                  className="inline-flex items-center gap-1 rounded-md border border-[var(--app-border)] bg-[var(--app-surface)] px-2.5 py-1 text-[11px] font-medium text-[var(--app-text)] hover:border-indigo-400"
                >
                  <Plus className="h-3 w-3" />
                  <span>Tambah Sumber Manual</span>
                </button>
              </div>

              <div
                role="tablist"
                aria-label="Kategori tokoh untuk riset web"
                className="flex flex-wrap gap-1 rounded-lg border border-[var(--app-border)] bg-[var(--app-surface)] p-1"
              >
                {CATEGORY_OPTIONS.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    role="tab"
                    aria-selected={researchCategory === opt.id}
                    onClick={() => setResearchCategory(opt.id)}
                    className={`flex-1 min-h-[32px] rounded-md px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap ${
                      researchCategory === opt.id
                        ? 'bg-indigo-600 text-white'
                        : 'text-[var(--app-text-muted)] hover:text-[var(--app-text)]'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>

              <div className="flex flex-col gap-2 sm:flex-row">
                <input
                  type="text"
                  value={queryName}
                  onChange={(e) => setQueryName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAnalyzeFromWeb();
                    }
                  }}
                  aria-label="Nama tokoh untuk analisa web"
                  placeholder="Ketik nama tokoh (mis. Nikola Tesla, B.J. Habibie, Sherlock Holmes, Kratos)"
                  className="min-w-0 flex-1 rounded-lg border border-[var(--app-border)] bg-[var(--app-surface)] px-3 py-2 text-sm text-[var(--app-text)] placeholder:text-[var(--app-text-muted)] focus:border-indigo-500 focus:outline-none"
                />
                <button
                  type="button"
                  disabled={isAnalyzing}
                  onClick={() => handleAnalyzeFromWeb()}
                  className="inline-flex min-h-[40px] items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-indigo-700 disabled:opacity-60 whitespace-nowrap shrink-0"
                >
                  {isAnalyzing ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      <span>Menganalisa...</span>
                    </>
                  ) : (
                    <span>Analisa dari Web</span>
                  )}
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-[var(--app-text-muted)]">
                <span>Contoh cepat:</span>
                {SAMPLE_CHARACTERS.map((sample) => (
                  <button
                    key={sample.name}
                    type="button"
                    disabled={isAnalyzing}
                    onClick={() => handleAnalyzeFromWeb(sample.name, sample.category)}
                    className="rounded-md border border-[var(--app-border)] bg-[var(--app-surface)] px-2 py-1 text-[11px] font-medium text-[var(--app-text)] hover:border-indigo-400 hover:text-indigo-600 dark:hover:text-indigo-300 disabled:opacity-50"
                  >
                    {sample.name}
                  </button>
                ))}
              </div>

              {showAddSource && (
                <div className="space-y-2 rounded-lg border border-[var(--app-border)] bg-[var(--app-surface)] p-3">
                  <div className="text-xs font-semibold text-[var(--app-text)]">
                    Tambah Sumber Referensi Web Manual
                  </div>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <input
                      type="text"
                      value={manualSourceTitle}
                      onChange={(e) => setManualSourceTitle(e.target.value)}
                      placeholder="Judul artikel / halaman"
                      aria-label="Judul sumber manual"
                      className="rounded-lg border border-[var(--app-border)] bg-[var(--app-surface-alt)] px-2.5 py-1.5 text-xs text-[var(--app-text)] focus:border-indigo-500 focus:outline-none"
                    />
                    <input
                      type="text"
                      value={manualSourceName}
                      onChange={(e) => setManualSourceName(e.target.value)}
                      placeholder="Nama situs (mis. Wikipedia)"
                      aria-label="Nama situs sumber manual"
                      className="rounded-lg border border-[var(--app-border)] bg-[var(--app-surface-alt)] px-2.5 py-1.5 text-xs text-[var(--app-text)] focus:border-indigo-500 focus:outline-none"
                    />
                  </div>
                  <input
                    type="url"
                    value={manualSourceUrl}
                    onChange={(e) => setManualSourceUrl(e.target.value)}
                    placeholder="https://..."
                    aria-label="URL sumber manual"
                    className="w-full rounded-lg border border-[var(--app-border)] bg-[var(--app-surface-alt)] px-2.5 py-1.5 text-xs text-[var(--app-text)] focus:border-indigo-500 focus:outline-none"
                  />
                  <textarea
                    rows={2}
                    value={manualSourceSnippet}
                    onChange={(e) => setManualSourceSnippet(e.target.value)}
                    placeholder="Kutipan ringkas dari sumber (opsional)"
                    aria-label="Kutipan sumber manual"
                    className="w-full rounded-lg border border-[var(--app-border)] bg-[var(--app-surface-alt)] px-2.5 py-1.5 text-xs text-[var(--app-text)] focus:border-indigo-500 focus:outline-none"
                  />
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setShowAddSource(false)}
                      className="rounded-md border border-[var(--app-border)] px-2.5 py-1 text-xs font-medium text-[var(--app-text-muted)]"
                    >
                      Batal
                    </button>
                    <button
                      type="button"
                      onClick={handleAddManualSource}
                      className="rounded-md bg-indigo-600 px-3 py-1 text-xs font-medium text-white hover:bg-indigo-700"
                    >
                      Tambahkan Sumber
                    </button>
                  </div>
                </div>
              )}

              {analyzeError && (
                <div role="alert" className="rounded-lg border border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/60 px-3 py-2 text-xs text-rose-700 dark:text-rose-300">
                  {analyzeError}
                </div>
              )}

              {(webSummary || webSources.length > 0 || sourceFacts.length > 0 || aiInterpretationNote) && (
                <div className="space-y-3 rounded-lg border border-[var(--app-border)] bg-[var(--app-surface)] p-3.5 text-xs text-[var(--app-text)]">
                  {sourceCategory && (
                    <div className="font-semibold text-indigo-700 dark:text-indigo-300">
                      Hasil Analisa Web · {sourceCategory}
                      {analyzedRules && analyzedRules.length > 0
                        ? ` · ${analyzedRules.length} aturan pemicu emosi siap diterapkan`
                        : ''}
                    </div>
                  )}
                  {webSummary && (
                    <p className="leading-relaxed text-[var(--app-text-muted)]">{webSummary}</p>
                  )}

                  {/* Pemisahan Fakta Sumber vs Interpretasi AI */}
                  <div className="grid grid-cols-1 gap-3 border-t border-[var(--app-border-soft)] pt-2.5 sm:grid-cols-2">
                    <div className="space-y-1.5 rounded-lg bg-[var(--app-surface-alt)] p-2.5">
                      <div className="font-semibold text-emerald-700 dark:text-emerald-400">
                        Fakta dari Sumber ({sourceFacts.length})
                      </div>
                      {sourceFacts.length > 0 ? (
                        <ul className="space-y-1 text-[11px] leading-relaxed text-[var(--app-text)]">
                          {sourceFacts.map((fact, idx) => (
                            <li key={idx} className="flex items-start justify-between gap-1.5">
                              <span>• {fact}</span>
                              <button
                                type="button"
                                onClick={() =>
                                  setSourceFacts((prev) => prev.filter((_, i) => i !== idx))
                                }
                                aria-label={`Hapus fakta ${idx + 1}`}
                                className="shrink-0 text-[var(--app-text-muted)] hover:text-rose-600"
                              >
                                ×
                              </button>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="text-[11px] text-[var(--app-text-muted)]">
                          Belum ada fakta sumber tercatat.
                        </p>
                      )}
                      <div className="flex gap-1 pt-1">
                        <input
                          type="text"
                          value={newFactInput}
                          onChange={(e) => setNewFactInput(e.target.value)}
                          placeholder="Tambah fakta terverifikasi..."
                          aria-label="Tambah fakta sumber"
                          className="min-w-0 flex-1 rounded border border-[var(--app-border)] bg-[var(--app-surface)] px-2 py-1 text-[11px]"
                        />
                        <button
                          type="button"
                          onClick={handleAddFact}
                          className="rounded border border-[var(--app-border)] bg-[var(--app-surface)] px-2 py-1 text-[11px] font-medium hover:border-indigo-400"
                        >
                          +
                        </button>
                      </div>
                    </div>

                    <div className="space-y-1.5 rounded-lg bg-[var(--app-surface-alt)] p-2.5">
                      <div className="flex items-center gap-1 font-semibold text-indigo-700 dark:text-indigo-400">
                        <Sparkles className="h-3 w-3" />
                        <span>Interpretasi AI (MBTI &amp; Watak)</span>
                      </div>
                      <textarea
                        rows={3}
                        value={aiInterpretationNote}
                        onChange={(e) => setAiInterpretationNote(e.target.value)}
                        aria-label="Catatan interpretasi AI"
                        placeholder="Penjelasan mengapa MBTI, arketipe, atau komposisi emosi ditafsirkan demikian..."
                        className="w-full rounded border border-[var(--app-border)] bg-[var(--app-surface)] p-2 text-[11px] leading-relaxed text-[var(--app-text)] focus:border-indigo-500 focus:outline-none"
                      />
                    </div>
                  </div>

                  {/* Daftar Sumber dengan Kutipan & Tautan */}
                  {webSources.length > 0 && (
                    <div className="space-y-2 border-t border-[var(--app-border-soft)] pt-2.5">
                      <div className="font-medium text-[var(--app-text-muted)]">
                        Sumber Referensi ({webSources.length})
                      </div>
                      <ul className="space-y-2">
                        {webSources.map((src, idx) => (
                          <li
                            key={idx}
                            className="rounded-lg border border-[var(--app-border-soft)] bg-[var(--app-surface-alt)] p-2.5"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <a
                                href={src.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 font-medium text-indigo-700 dark:text-indigo-300 hover:underline"
                              >
                                <span>{src.title}</span>
                                <ExternalLink className="h-3 w-3 shrink-0" />
                              </a>
                              <div className="flex items-center gap-2 shrink-0">
                                {src.sourceName && (
                                  <span className="font-mono text-[10px] text-[var(--app-text-muted)]">
                                    {src.sourceName}
                                  </span>
                                )}
                                <button
                                  type="button"
                                  onClick={() =>
                                    setWebSources((prev) => prev.filter((_, i) => i !== idx))
                                  }
                                  aria-label={`Hapus sumber ${src.title}`}
                                  className="text-[var(--app-text-muted)] hover:text-rose-600"
                                >
                                  <Trash2 className="h-3 w-3" />
                                </button>
                              </div>
                            </div>
                            {src.snippet && (
                              <blockquote className="mt-1.5 flex items-start gap-1.5 text-[11px] italic leading-relaxed text-[var(--app-text-muted)]">
                                <Quote className="mt-0.5 h-3 w-3 shrink-0 opacity-60" />
                                <span>“{src.snippet}”</span>
                              </blockquote>
                            )}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </section>

            {/* Foto Profil Persona */}
            <section
              aria-label="Foto profil persona"
              className="space-y-3 rounded-xl border border-[var(--app-border)] bg-[var(--app-surface-alt)] p-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-semibold">Foto Profil Persona</span>
                <span className="text-[11px] text-[var(--app-text-muted)]">
                  Unggah gambar, pilih potret bawaan, atau tempel URL
                </span>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <PersonaAvatar name={name || 'AI'} avatarUrl={avatarUrl || undefined} size="lg" />

                <div className="min-w-0 flex-1 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handlePhotoUpload}
                      aria-label="Unggah file foto profil persona"
                      className="hidden"
                    />
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-[var(--app-border)] bg-[var(--app-surface)] px-3 py-1.5 text-xs font-medium text-[var(--app-text)] hover:border-indigo-400 whitespace-nowrap"
                    >
                      <ImagePlus className="h-3.5 w-3.5" />
                      <span>Unggah Foto</span>
                    </button>

                    {avatarUrl && (
                      <button
                        type="button"
                        onClick={() => setAvatarUrl('')}
                        className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-[var(--app-border)] bg-[var(--app-surface)] px-3 py-1.5 text-xs font-medium text-rose-600 dark:text-rose-400 hover:border-rose-400 whitespace-nowrap"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        <span>Hapus Foto</span>
                      </button>
                    )}

                    <div className="flex items-center gap-1.5">
                      {PRESET_AVATARS.map((presetAv) => {
                        const selected = avatarUrl === presetAv.url;
                        return (
                          <button
                            key={presetAv.url}
                            type="button"
                            title={`Gunakan potret ${presetAv.label}`}
                            aria-label={`Pilih foto bawaan ${presetAv.label}`}
                            onClick={() => {
                              setPhotoError('');
                              setAvatarUrl(presetAv.url);
                            }}
                            className={`h-9 w-9 overflow-hidden rounded-lg border transition-all ${
                              selected
                                ? 'border-indigo-600 ring-2 ring-indigo-500/40'
                                : 'border-[var(--app-border)] opacity-80 hover:opacity-100'
                            }`}
                          >
                            <img
                              src={presetAv.url}
                              alt={presetAv.label}
                              className="h-full w-full object-cover"
                            />
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <input
                    id="persona-avatar-url"
                    type="text"
                    value={avatarUrl.startsWith('data:') ? '' : avatarUrl}
                    onChange={(e) => {
                      setPhotoError('');
                      setAvatarUrl(e.target.value);
                    }}
                    aria-label="URL foto profil persona"
                    placeholder={
                      avatarUrl.startsWith('data:')
                        ? 'Foto lokal terunggah (atau tempel URL baru untuk mengganti)'
                        : 'Atau tempel URL gambar (https://...)'
                    }
                    className="w-full rounded-lg border border-[var(--app-border)] bg-[var(--app-surface)] px-3 py-1.5 text-xs text-[var(--app-text)] placeholder:text-[var(--app-text-muted)] focus:border-indigo-500 focus:outline-none"
                  />

                  {photoError && (
                    <p className="text-xs text-rose-600 dark:text-rose-400">{photoError}</p>
                  )}
                </div>
              </div>
            </section>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="persona-name" className="block text-xs font-semibold">
                  Nama Persona
                </label>
                <input
                  id="persona-name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Contoh: Akira Mizuno"
                  className="mt-1.5 w-full rounded-lg border border-[var(--app-border)] bg-[var(--app-surface)] px-3 py-2 text-sm text-[var(--app-text)] focus:border-indigo-500 focus:outline-none"
                />
              </div>

              <div>
                <label htmlFor="persona-role" className="block text-xs font-semibold">
                  Identitas / Peran
                </label>
                <input
                  id="persona-role"
                  type="text"
                  value={roleTitle}
                  onChange={(e) => setRoleTitle(e.target.value)}
                  placeholder="Contoh: Pengarsip Memori · Analis"
                  className="mt-1.5 w-full rounded-lg border border-[var(--app-border)] bg-[var(--app-surface)] px-3 py-2 text-sm text-[var(--app-text)] focus:border-indigo-500 focus:outline-none"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="persona-mbti" className="block text-xs font-semibold">
                  Tipe MBTI
                </label>
                <select
                  id="persona-mbti"
                  value={mbti}
                  onChange={(e) => setMbti(e.target.value as MBTIType)}
                  className="mt-1.5 w-full rounded-lg border border-[var(--app-border)] bg-[var(--app-surface)] px-3 py-2 text-sm text-[var(--app-text)] focus:border-indigo-500 focus:outline-none"
                >
                  {MBTI_OPTIONS.map((opt) => (
                    <option key={opt.code} value={opt.code}>
                      {opt.code} — {opt.summary}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="persona-archetype" className="block text-xs font-semibold">
                  Arketipe Watak
                </label>
                <select
                  id="persona-archetype"
                  value={archetype}
                  onChange={(e) => applyArchetypePreset(e.target.value as Archetype)}
                  className="mt-1.5 w-full rounded-lg border border-[var(--app-border)] bg-[var(--app-surface)] px-3 py-2 text-sm text-[var(--app-text)] focus:border-indigo-500 focus:outline-none"
                >
                  {ARCHETYPES.map((arch) => (
                    <option key={arch} value={arch}>
                      {arch}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="rounded-xl bg-[var(--app-surface-alt)] p-3 text-xs text-[var(--app-text-muted)]">
              <span className="font-semibold text-[var(--app-text)]">{archetype}:</span>{' '}
              {ARCHETYPE_PRESETS[archetype].description}
            </div>

            <div>
              <label htmlFor="persona-traits" className="block text-xs font-semibold">
                Sifat Dasar &amp; Kepribadian
              </label>
              <textarea
                id="persona-traits"
                rows={3}
                value={basePersonality}
                onChange={(e) => setBasePersonality(e.target.value)}
                placeholder="Jelaskan watak inti, cara ia menilai situasi, dan kerentanan emosionalnya..."
                className="mt-1.5 w-full rounded-lg border border-[var(--app-border)] bg-[var(--app-surface)] px-3 py-2 text-sm text-[var(--app-text)] focus:border-indigo-500 focus:outline-none"
              />
            </div>

            <div>
              <label htmlFor="persona-style" className="block text-xs font-semibold">
                Gaya Bicara &amp; Kebiasaan Ekspresi
              </label>
              <textarea
                id="persona-style"
                rows={2}
                value={speakingStyle}
                onChange={(e) => setSpeakingStyle(e.target.value)}
                placeholder="Contoh: Kalimat singkat dan logis, atau sesekali gagap saat tersipu..."
                className="mt-1.5 w-full rounded-lg border border-[var(--app-border)] bg-[var(--app-surface)] px-3 py-2 text-sm text-[var(--app-text)] focus:border-indigo-500 focus:outline-none"
              />
            </div>

            <div className="space-y-3 border-t border-[var(--app-border)] pt-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold">
                  Emosi Dasar (Otomatis dinormalisasi ke 100%)
                </span>
                <button
                  type="button"
                  onClick={() => setRawBaseline({ ...ARCHETYPE_PRESETS[archetype].baseline })}
                  className="text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:underline"
                >
                  Gunakan Default {archetype}
                </button>
              </div>

              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {EMOTION_ORDER.map((key) => {
                  const meta = EMOTION_META[key];
                  return (
                    <div key={key} className="rounded-lg bg-[var(--app-surface-alt)] p-2.5">
                      <div className="flex items-center justify-between text-xs">
                        <label htmlFor={`base-${key}`} className="font-medium text-[var(--app-text)]">
                          {meta.label}
                        </label>
                        <span className="font-mono font-semibold tabular-nums">
                          {normalizedPreview[key]}%
                        </span>
                      </div>
                      <input
                        id={`base-${key}`}
                        type="range"
                        min={0}
                        max={100}
                        value={rawBaseline[key]}
                        onChange={(e) =>
                          setRawBaseline((prev) => ({
                            ...prev,
                            [key]: Number(e.target.value),
                          }))
                        }
                        className="mt-1.5 w-full accent-indigo-600 cursor-pointer"
                      />
                    </div>
                  );
                })}
              </div>
            </div>

            {error && (
              <div role="alert" className="rounded-lg border border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/60 px-3 py-2 text-xs text-rose-700 dark:text-rose-300">
                {error}
              </div>
            )}
          </div>

          <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-[var(--app-border)] bg-[var(--app-surface)] px-6 py-4">
            <div>
              {initialPersona && onExportPersona && (
                <button
                  type="button"
                  onClick={() => onExportPersona(buildPersonaObject())}
                  className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-[var(--app-border)] bg-[var(--app-surface-alt)] px-3.5 py-2 text-xs font-medium text-[var(--app-text)] hover:border-indigo-400 whitespace-nowrap"
                >
                  <Download className="h-3.5 w-3.5" />
                  <span>Ekspor JSON</span>
                </button>
              )}
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={onClose}
                className="min-h-[40px] rounded-lg border border-[var(--app-border)] bg-[var(--app-surface)] px-4 py-2 text-sm font-medium text-[var(--app-text)] hover:bg-[var(--app-surface-alt)] whitespace-nowrap"
              >
                Batal
              </button>
              <button
                type="submit"
                className="min-h-[40px] rounded-lg bg-indigo-600 px-5 py-2 text-sm font-medium text-white hover:bg-indigo-700 whitespace-nowrap"
              >
                {initialPersona ? 'Simpan Perubahan' : 'Terapkan Persona'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
