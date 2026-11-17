import { MessageSquareText } from 'lucide-react';
import {
  DEFAULT_RESPONSE_CONFIG,
  sanitizeResponseConfig,
  type LanguageStyle,
  type Persona,
  type ResponseConfig,
  type ResponseLength,
} from '../lib/emotionEngine';

interface ResponseSettingsPanelProps {
  persona: Persona;
  onUpdateResponseConfig: (next: ResponseConfig) => void;
  onUpdateReactivity: (reactivity: number) => void;
}

const LENGTH_OPTIONS: { id: ResponseLength; label: string; hint: string }[] = [
  { id: 'singkat', label: 'Singkat', hint: '1–2 kalimat padat' },
  { id: 'sedang', label: 'Sedang', hint: '2–4 kalimat seimbang' },
  { id: 'panjang', label: 'Panjang', hint: '4–7 kalimat mendalam' },
];

const STYLE_OPTIONS: { id: LanguageStyle; label: string; hint: string }[] = [
  { id: 'santai', label: 'Santai', hint: 'Akrab sehari-hari' },
  { id: 'seimbang', label: 'Seimbang', hint: 'Alami sesuai watak' },
  { id: 'formal', label: 'Formal', hint: 'Rapi & sopan' },
  { id: 'puitis', label: 'Puitis', hint: 'Sarat metafora & rasa' },
  { id: 'ekspresif', label: 'Ekspresif', hint: 'Dinamis & penuh emosi' },
];

export function ResponseSettingsPanel({
  persona,
  onUpdateResponseConfig,
  onUpdateReactivity,
}: ResponseSettingsPanelProps) {
  const config = sanitizeResponseConfig(persona.responseConfig || DEFAULT_RESPONSE_CONFIG);
  const reactivity = persona.training.reactivity;

  const updateConfig = (patch: Partial<ResponseConfig>) => {
    onUpdateResponseConfig(sanitizeResponseConfig({ ...config, ...patch }));
  };

  return (
    <div className="space-y-4 rounded-xl border border-[var(--app-border)] bg-[var(--app-surface)] p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-semibold text-[var(--app-text)]">
          <MessageSquareText className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
          <span>Pengaturan Respons</span>
        </div>
        <span className="font-mono text-[11px] text-[var(--app-text-muted)] tabular-nums">
          {config.length} · {Math.round(config.creativity * 100)}%
        </span>
      </div>

      {/* Panjang Jawaban */}
      <div className="space-y-1.5">
        <div className="text-xs font-medium text-[var(--app-text)]">Panjang Jawaban</div>
        <div
          role="radiogroup"
          aria-label="Pilih panjang jawaban persona"
          className="grid grid-cols-3 gap-1.5"
        >
          {LENGTH_OPTIONS.map((opt) => {
            const active = config.length === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => updateConfig({ length: opt.id })}
                className={`rounded-lg border px-2 py-2 text-center transition-colors ${
                  active
                    ? 'border-indigo-600 bg-indigo-600 text-white'
                    : 'border-[var(--app-border)] bg-[var(--app-surface-alt)] text-[var(--app-text)] hover:border-indigo-400'
                }`}
              >
                <div className="text-xs font-semibold">{opt.label}</div>
                <div
                  className={`mt-0.5 text-[10px] leading-tight ${
                    active ? 'text-indigo-100' : 'text-[var(--app-text-muted)]'
                  }`}
                >
                  {opt.hint}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Gaya Bahasa */}
      <div className="space-y-1.5">
        <label htmlFor="response-language-style" className="block text-xs font-medium text-[var(--app-text)]">
          Gaya Bahasa
        </label>
        <div className="flex flex-wrap gap-1.5" id="response-language-style">
          {STYLE_OPTIONS.map((opt) => {
            const active = config.languageStyle === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                aria-pressed={active}
                onClick={() => updateConfig({ languageStyle: opt.id })}
                title={opt.hint}
                className={`rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                  active
                    ? 'border-indigo-600 bg-indigo-600 text-white'
                    : 'border-[var(--app-border)] bg-[var(--app-surface-alt)] text-[var(--app-text)] hover:border-indigo-400'
                }`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
        <p className="text-[11px] text-[var(--app-text-muted)]">
          {STYLE_OPTIONS.find((s) => s.id === config.languageStyle)?.hint}
        </p>
      </div>

      {/* Tingkat Kreativitas */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-xs">
          <label htmlFor="response-creativity-slider" className="font-medium text-[var(--app-text)]">
            Tingkat Kreativitas
          </label>
          <span className="font-mono font-semibold text-[var(--app-text)] tabular-nums">
            {Math.round(config.creativity * 100)}%
          </span>
        </div>
        <input
          id="response-creativity-slider"
          type="range"
          min={0.2}
          max={1.0}
          step={0.05}
          value={config.creativity}
          onChange={(e) => updateConfig({ creativity: parseFloat(e.target.value) })}
          className="w-full accent-indigo-600 cursor-pointer"
        />
        <div className="flex justify-between text-[11px] text-[var(--app-text-muted)]">
          <span>Konsisten & Faktual (20%)</span>
          <span>Imajinatif & Spontan (100%)</span>
        </div>
      </div>

      {/* Kecepatan Perubahan Emosi */}
      <div className="space-y-1.5 border-t border-[var(--app-border-soft)] pt-3">
        <div className="flex items-center justify-between text-xs">
          <label htmlFor="response-reactivity-slider" className="font-medium text-[var(--app-text)]">
            Kecepatan Perubahan Emosi
          </label>
          <span className="font-mono font-semibold text-[var(--app-text)] tabular-nums">
            {reactivity.toFixed(2)}x
          </span>
        </div>
        <input
          id="response-reactivity-slider"
          type="range"
          min={0.3}
          max={2.0}
          step={0.05}
          value={reactivity}
          onChange={(e) => onUpdateReactivity(parseFloat(e.target.value))}
          className="w-full accent-indigo-600 cursor-pointer"
        />
        <div className="flex justify-between text-[11px] text-[var(--app-text-muted)]">
          <span>Stabil Lambat (0.30x)</span>
          <span>Mudah Berubah (2.00x)</span>
        </div>
      </div>
    </div>
  );
}
