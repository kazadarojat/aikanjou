import {
  ARCHETYPE_PRESETS,
  clamp,
  MBTI_OPTIONS,
  normalizeEmotions,
  sanitizeResponseConfig,
  type Archetype,
  type MBTIType,
  type Persona,
  type PersonaMemoryItem,
  type TrainingRule,
  type WebSourceRef,
} from './emotionEngine';
import { createInitialSession, type PersonaSessionState } from './sessionUtils';
import { sanitizeAppSettings, type AppSettings } from './settings';

export interface PersonaPackagePayload {
  schemaVersion: '1.0';
  type: 'kanjou-persona';
  exportedAt: string;
  persona: Persona;
}

export interface FullBackupPayload {
  schemaVersion: '1.0';
  type: 'kanjou-full-backup';
  exportedAt: string;
  activePersonaId: string;
  personas: Persona[];
  sessions: Record<string, PersonaSessionState>;
  memoriesByPersona: Record<string, PersonaMemoryItem[]>;
  settings: AppSettings;
}

const VALID_MBTI = new Set<string>(MBTI_OPTIONS.map((m) => m.code));
const VALID_ARCHETYPES = new Set<string>(Object.keys(ARCHETYPE_PRESETS));

export function sanitizePersona(raw: unknown, fallbackId?: string): Persona {
  const obj = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const name =
    typeof obj.name === 'string' && obj.name.trim() ? obj.name.trim().slice(0, 80) : 'Persona Impor';

  const mbtiRaw = typeof obj.mbti === 'string' ? obj.mbti.trim().toUpperCase() : 'INTJ';
  const mbti: MBTIType = VALID_MBTI.has(mbtiRaw) ? (mbtiRaw as MBTIType) : 'INTJ';

  const archRaw = typeof obj.archetype === 'string' ? obj.archetype.trim() : 'Kustom';
  const archetype: Archetype = VALID_ARCHETYPES.has(archRaw) ? (archRaw as Archetype) : 'Kustom';
  const preset = ARCHETYPE_PRESETS[archetype];

  const roleTitle =
    typeof obj.roleTitle === 'string' && obj.roleTitle.trim()
      ? obj.roleTitle.trim().slice(0, 120)
      : `${mbti} · ${archetype}`;

  const basePersonality =
    typeof obj.basePersonality === 'string' && obj.basePersonality.trim()
      ? obj.basePersonality.trim()
      : preset.description;

  const speakingStyle =
    typeof obj.speakingStyle === 'string' && obj.speakingStyle.trim()
      ? obj.speakingStyle.trim()
      : preset.speakingHint;

  const avatarUrl =
    typeof obj.avatarUrl === 'string' && obj.avatarUrl.trim() ? obj.avatarUrl.trim() : undefined;

  const sourceCategory =
    typeof obj.sourceCategory === 'string' && obj.sourceCategory.trim()
      ? obj.sourceCategory.trim()
      : undefined;

  const webSources: WebSourceRef[] | undefined = Array.isArray(obj.webSources)
    ? obj.webSources
        .filter((s): s is Record<string, unknown> => Boolean(s && typeof s === 'object'))
        .map((s) => ({
          title: typeof s.title === 'string' && s.title.trim() ? s.title.trim() : 'Sumber Web',
          url: typeof s.url === 'string' ? s.url.trim() : '',
          ...(typeof s.snippet === 'string' && s.snippet.trim()
            ? { snippet: s.snippet.trim().slice(0, 400) }
            : {}),
          ...(typeof s.sourceName === 'string' && s.sourceName.trim()
            ? { sourceName: s.sourceName.trim().slice(0, 60) }
            : {}),
        }))
        .filter((s) => s.url.startsWith('http://') || s.url.startsWith('https://'))
        .slice(0, 8)
    : undefined;

  const sourceFacts: string[] | undefined = Array.isArray(obj.sourceFacts)
    ? obj.sourceFacts
        .filter((f): f is string => typeof f === 'string' && f.trim().length > 0)
        .map((f) => f.trim().slice(0, 260))
        .slice(0, 8)
    : undefined;

  const aiInterpretationNote =
    typeof obj.aiInterpretationNote === 'string' && obj.aiInterpretationNote.trim()
      ? obj.aiInterpretationNote.trim()
      : undefined;

  const baselineEmotions = normalizeEmotions(
    (obj.baselineEmotions && typeof obj.baselineEmotions === 'object'
      ? obj.baselineEmotions
      : preset.baseline) as Partial<Persona['baselineEmotions']>,
    preset.baseline
  );

  const tr = (obj.training && typeof obj.training === 'object' ? obj.training : {}) as Record<
    string,
    unknown
  >;
  const bias = (tr.intensityBias && typeof tr.intensityBias === 'object'
    ? tr.intensityBias
    : {}) as Record<string, unknown>;

  const rules: TrainingRule[] = Array.isArray(tr.rules)
    ? tr.rules
        .filter((r): r is Record<string, unknown> => Boolean(r && typeof r === 'object'))
        .map((r, idx) => ({
          id:
            typeof r.id === 'string' && r.id.trim()
              ? r.id.trim()
              : `rule-imp-${Date.now()}-${idx}`,
          label:
            typeof r.label === 'string' && r.label.trim() ? r.label.trim() : `Aturan ${idx + 1}`,
          triggerKeywords: Array.isArray(r.triggerKeywords)
            ? r.triggerKeywords.filter((k): k is string => typeof k === 'string' && k.trim().length > 0)
            : [],
          targetEmotion:
            typeof r.targetEmotion === 'string' &&
            ['senang', 'marah', 'takut', 'bingung', 'sedih', 'jijik'].includes(r.targetEmotion)
              ? (r.targetEmotion as TrainingRule['targetEmotion'])
              : 'senang',
          boostAmount:
            typeof r.boostAmount === 'number' && Number.isFinite(r.boostAmount)
              ? Math.round(clamp(r.boostAmount, 5, 80))
              : 25,
          enabled: typeof r.enabled === 'boolean' ? r.enabled : true,
        }))
        .filter((r) => r.triggerKeywords.length > 0)
    : [];

  return {
    id:
      fallbackId ||
      (typeof obj.id === 'string' && obj.id.trim() ? obj.id.trim() : `persona-${Date.now()}`),
    name,
    roleTitle,
    mbti,
    archetype,
    basePersonality,
    speakingStyle,
    avatarUrl,
    sourceCategory,
    webSources: webSources && webSources.length > 0 ? webSources : undefined,
    sourceFacts: sourceFacts && sourceFacts.length > 0 ? sourceFacts : undefined,
    aiInterpretationNote,
    baselineEmotions,
    training: {
      reactivity:
        typeof tr.reactivity === 'number' && Number.isFinite(tr.reactivity)
          ? clamp(Number(tr.reactivity.toFixed(2)), 0.3, 2.0)
          : preset.reactivity,
      inertia:
        typeof tr.inertia === 'number' && Number.isFinite(tr.inertia)
          ? clamp(Number(tr.inertia.toFixed(2)), 0.05, 0.85)
          : preset.inertia,
      intensityBias: {
        rendah:
          typeof bias.rendah === 'number' && Number.isFinite(bias.rendah)
            ? clamp(bias.rendah, 0.3, 2.2)
            : 0.65,
        sedang:
          typeof bias.sedang === 'number' && Number.isFinite(bias.sedang)
            ? clamp(bias.sedang, 0.3, 2.2)
            : 1.0,
        tinggi:
          typeof bias.tinggi === 'number' && Number.isFinite(bias.tinggi)
            ? clamp(bias.tinggi, 0.3, 2.2)
            : 1.45,
        ekstrem:
          typeof bias.ekstrem === 'number' && Number.isFinite(bias.ekstrem)
            ? clamp(bias.ekstrem, 0.3, 2.2)
            : 1.85,
      },
      rules,
    },
    responseConfig: sanitizeResponseConfig(obj.responseConfig),
  };
}

export function exportPersonaPackageJson(
  persona: Persona,
  exportedAt: Date = new Date()
): string {
  const payload: PersonaPackagePayload = {
    schemaVersion: '1.0',
    type: 'kanjou-persona',
    exportedAt: exportedAt.toISOString(),
    persona,
  };
  return JSON.stringify(payload, null, 2);
}

export function parsePersonaPackageJson(
  rawText: string,
  existingIds: Set<string> = new Set()
): Persona {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    throw new Error('File JSON persona tidak dapat dibaca (format JSON tidak valid).');
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Isi file persona tidak valid.');
  }

  const obj = parsed as Record<string, unknown>;
  const candidate =
    obj.type === 'kanjou-persona' && obj.persona && typeof obj.persona === 'object'
      ? obj.persona
      : obj;

  const candidateObj = candidate as Record<string, unknown>;
  if (typeof candidateObj.name !== 'string' || !candidateObj.name.trim()) {
    throw new Error('File JSON tidak memuat profil persona yang valid (nama persona kosong).');
  }

  const baseId =
    typeof candidateObj.id === 'string' && candidateObj.id.trim()
      ? candidateObj.id.trim()
      : `persona-${Date.now()}`;
  const finalId = existingIds.has(baseId)
    ? `${baseId}-${Math.random().toString(36).slice(2, 6)}`
    : baseId;

  return sanitizePersona(candidateObj, finalId);
}

export function createFullBackupJson(input: {
  personas: Persona[];
  activePersonaId: string;
  sessions: Record<string, PersonaSessionState>;
  memoriesByPersona: Record<string, PersonaMemoryItem[]>;
  settings: AppSettings;
  exportedAt?: Date;
}): string {
  const payload: FullBackupPayload = {
    schemaVersion: '1.0',
    type: 'kanjou-full-backup',
    exportedAt: (input.exportedAt ?? new Date()).toISOString(),
    activePersonaId: input.activePersonaId,
    personas: input.personas,
    sessions: input.sessions,
    memoriesByPersona: input.memoriesByPersona,
    settings: input.settings,
  };
  return JSON.stringify(payload, null, 2);
}

export interface RestoredBackupData {
  personas: Persona[];
  activePersonaId: string;
  sessions: Record<string, PersonaSessionState>;
  memoriesByPersona: Record<string, PersonaMemoryItem[]>;
  settings: AppSettings;
}

export function parseFullBackupJson(rawText: string): RestoredBackupData {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    throw new Error('Berkas cadangan bukan file JSON yang valid.');
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Struktur berkas cadangan tidak dikenali.');
  }

  const obj = parsed as Record<string, unknown>;
  if (!Array.isArray(obj.personas) || obj.personas.length === 0) {
    throw new Error('Berkas cadangan tidak memiliki daftar persona yang valid.');
  }

  const personas = obj.personas.map((p, idx) =>
    sanitizePersona(p, typeof (p as { id?: unknown })?.id === 'string' ? undefined : `persona-restored-${idx}`)
  );
  const personaIds = new Set(personas.map((p) => p.id));

  const activePersonaId =
    typeof obj.activePersonaId === 'string' && personaIds.has(obj.activePersonaId)
      ? obj.activePersonaId
      : personas[0].id;

  const rawSessions =
    obj.sessions && typeof obj.sessions === 'object'
      ? (obj.sessions as Record<string, unknown>)
      : {};
  const sessions: Record<string, PersonaSessionState> = {};

  for (const p of personas) {
    const rawS = rawSessions[p.id] as Partial<PersonaSessionState> | undefined;
    if (rawS && typeof rawS === 'object' && Array.isArray(rawS.messages)) {
      const initial = createInitialSession(p);
      sessions[p.id] = {
        messages: rawS.messages,
        emotions: rawS.emotions ? normalizeEmotions(rawS.emotions, p.baselineEmotions) : initial.emotions,
        deltas: rawS.deltas || null,
        kaomoji: typeof rawS.kaomoji === 'string' && rawS.kaomoji ? rawS.kaomoji : initial.kaomoji,
        internalThought:
          typeof rawS.internalThought === 'string' ? rawS.internalThought : initial.internalThought,
        history: Array.isArray(rawS.history) && rawS.history.length > 0 ? rawS.history : initial.history,
      };
    }
  }

  const rawMemories =
    obj.memoriesByPersona && typeof obj.memoriesByPersona === 'object'
      ? (obj.memoriesByPersona as Record<string, unknown>)
      : {};
  const memoriesByPersona: Record<string, PersonaMemoryItem[]> = {};
  for (const p of personas) {
    const list = rawMemories[p.id];
    if (Array.isArray(list)) {
      memoriesByPersona[p.id] = list
        .filter((m): m is PersonaMemoryItem => Boolean(m && typeof m === 'object' && typeof (m as PersonaMemoryItem).content === 'string'));
    }
  }

  const settings = sanitizeAppSettings(obj.settings);

  return {
    personas,
    activePersonaId,
    sessions,
    memoriesByPersona,
    settings,
  };
}
