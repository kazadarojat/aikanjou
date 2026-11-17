import {
  EMOTION_META,
  EMOTION_ORDER,
  getDominantEmotion,
  type EmotionKey,
  type EmotionState,
  type IntensityAnalysis,
  type Persona,
  type PersonaMemoryItem,
} from './emotionEngine';
import type { UserPreferences } from './settings';

export interface ExportChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  kaomoji?: string;
  emotions?: EmotionState;
  deltas?: EmotionState;
  dominant?: EmotionKey;
  internalThought?: string;
  intensity?: IntensityAnalysis;
  triggeredRules?: string[];
}

export interface ExportEmotionSnapshot {
  turn: number;
  emotions: EmotionState;
  kaomoji: string;
  dominant: EmotionKey;
}

export interface ChatExportInput {
  persona: Persona;
  messages: ExportChatMessage[];
  currentEmotions: EmotionState;
  currentKaomoji: string;
  internalThought?: string;
  history: ExportEmotionSnapshot[];
  memories?: PersonaMemoryItem[];
  userPreferences?: Partial<UserPreferences>;
  exportedAt?: Date;
}

export interface ChatExportJsonPayload {
  schemaVersion: '1.0';
  app: 'Kanjou Harness';
  exportedAt: string;
  persona: {
    id: string;
    name: string;
    roleTitle: string;
    mbti: Persona['mbti'];
    archetype: Persona['archetype'];
    sourceCategory?: string;
    basePersonality: string;
    speakingStyle: string;
    baselineEmotions: EmotionState;
    training: Persona['training'];
  };
  userContext: {
    userName: string;
    relationship: string;
    customNote: string;
  };
  session: {
    messageCount: number;
    currentKaomoji: string;
    dominantEmotion: EmotionKey;
    dominantEmotionLabel: string;
    dominantEmotionValue: number;
    currentEmotions: EmotionState;
    internalThought?: string;
    emotionHistory: ExportEmotionSnapshot[];
  };
  memories?: PersonaMemoryItem[];
  messages: ExportChatMessage[];
}

export function slugifyFilename(name: string): string {
  const normalized = name
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return normalized || 'persona';
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

export function buildExportFilename(
  personaName: string,
  format: 'txt' | 'json',
  exportedAt: Date = new Date()
): string {
  const slug = slugifyFilename(personaName);
  const stamp = [
    exportedAt.getFullYear(),
    pad2(exportedAt.getMonth() + 1),
    pad2(exportedAt.getDate()),
    '-',
    pad2(exportedAt.getHours()),
    pad2(exportedAt.getMinutes()),
  ].join('');
  return `kanjou-log-${slug}-${stamp}.${format}`;
}

function formatEmotionBreakdown(
  emotions: EmotionState,
  deltas?: EmotionState
): string {
  return EMOTION_ORDER.map((key) => {
    const label = EMOTION_META[key].label;
    const val = emotions[key];
    const delta = deltas ? deltas[key] : 0;
    const deltaStr = delta !== 0 ? ` (${delta > 0 ? `+${delta}` : delta})` : '';
    return `${label} ${val}%${deltaStr}`;
  }).join(' | ');
}

export function buildChatExportPayload(input: ChatExportInput): ChatExportJsonPayload {
  const now = input.exportedAt ?? new Date();
  const dominant = getDominantEmotion(input.currentEmotions);

  return {
    schemaVersion: '1.0',
    app: 'Kanjou Harness',
    exportedAt: now.toISOString(),
    persona: {
      id: input.persona.id,
      name: input.persona.name,
      roleTitle: input.persona.roleTitle,
      mbti: input.persona.mbti,
      archetype: input.persona.archetype,
      ...(input.persona.sourceCategory
        ? { sourceCategory: input.persona.sourceCategory }
        : {}),
      basePersonality: input.persona.basePersonality,
      speakingStyle: input.persona.speakingStyle,
      baselineEmotions: input.persona.baselineEmotions,
      training: input.persona.training,
    },
    userContext: {
      userName: input.userPreferences?.userName?.trim() || '',
      relationship: input.userPreferences?.relationship?.trim() || '',
      customNote: input.userPreferences?.customNote?.trim() || '',
    },
    session: {
      messageCount: input.messages.length,
      currentKaomoji: input.currentKaomoji,
      dominantEmotion: dominant.key,
      dominantEmotionLabel: EMOTION_META[dominant.key].label,
      dominantEmotionValue: dominant.value,
      currentEmotions: input.currentEmotions,
      ...(input.internalThought ? { internalThought: input.internalThought } : {}),
      emotionHistory: input.history,
    },
    ...(input.memories && input.memories.length > 0 ? { memories: input.memories } : {}),
    messages: input.messages,
  };
}

export function formatChatLogAsJson(input: ChatExportInput): string {
  return JSON.stringify(buildChatExportPayload(input), null, 2);
}

export function formatChatLogAsText(input: ChatExportInput): string {
  const now = input.exportedAt ?? new Date();
  const dominant = getDominantEmotion(input.currentEmotions);
  const userName = input.userPreferences?.userName?.trim() || 'User';
  const relationship = input.userPreferences?.relationship?.trim();

  const lines: string[] = [
    '============================================================',
    'LOG PERCAKAPAN — KANJOU HARNESS',
    '============================================================',
    `Persona        : ${input.persona.name} (${input.persona.roleTitle})`,
    `MBTI / Watak   : ${input.persona.mbti} · ${input.persona.archetype}`,
    ...(input.persona.sourceCategory
      ? [`Kategori       : ${input.persona.sourceCategory}`]
      : []),
    `Lawan Bicara   : ${userName}${relationship ? ` (Hubungan: ${relationship})` : ''}`,
    `Waktu Ekspor   : ${now.toISOString()}`,
    `Jumlah Pesan   : ${input.messages.length}`,
    `Emosi Terkini  : ${EMOTION_META[dominant.key].label} ${dominant.value}% ${input.currentKaomoji}`,
    `Rincian Emosi  : ${formatEmotionBreakdown(input.currentEmotions)}`,
    '------------------------------------------------------------',
    '',
  ];

  if (input.messages.length === 0) {
    lines.push('(Belum ada pesan dalam percakapan ini.)');
  } else {
    lines.push('--- HISTORI PERCAKAPAN ---');
    lines.push('');

    for (const msg of input.messages) {
      if (msg.role === 'user') {
        const intensityNote = msg.intensity
          ? ` [Intensitas: ${msg.intensity.level} (${Math.round(msg.intensity.score * 100)}%)]`
          : '';
        lines.push(`[${msg.timestamp}] ${userName}${intensityNote}`);
        lines.push(msg.content);
        lines.push('');
      } else {
        const domKey = msg.dominant || dominant.key;
        const domVal =
          msg.emotions && msg.dominant ? msg.emotions[msg.dominant] : dominant.value;
        const kao = msg.kaomoji ? ` ${msg.kaomoji}` : '';
        lines.push(
          `[${msg.timestamp}] ${input.persona.name}${kao} [Dominan: ${EMOTION_META[domKey].label} ${domVal}%]`
        );
        lines.push(msg.content);
        if (msg.internalThought) {
          lines.push(`  Batin: "${msg.internalThought}"`);
        }
        if (msg.emotions) {
          lines.push(`  Emosi: ${formatEmotionBreakdown(msg.emotions, msg.deltas)}`);
        }
        if (msg.triggeredRules && msg.triggeredRules.length > 0) {
          lines.push(`  Aturan terpicu: ${msg.triggeredRules.join(', ')}`);
        }
        lines.push('');
      }
    }
  }

  if (input.history.length > 0) {
    lines.push('--- JEJAK PERUBAHAN EMOSI ---');
    for (const snap of input.history) {
      const domLabel = EMOTION_META[snap.dominant].label;
      lines.push(
        `Putaran ${snap.turn}: ${domLabel} (${snap.emotions[snap.dominant]}%) ${snap.kaomoji} — ${formatEmotionBreakdown(snap.emotions)}`
      );
    }
  }

  if (input.memories && input.memories.length > 0) {
    lines.push('');
    lines.push('--- MEMORI PERSONA ---');
    for (const mem of input.memories) {
      lines.push(`- [${mem.category.toUpperCase()}] ${mem.content}`);
    }
  }

  return `${lines.join('\n').trimEnd()}\n`;
}

export function triggerFileDownload(
  content: string,
  filename: string,
  mimeType: string
): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 1500);
}
