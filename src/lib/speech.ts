import type { Archetype, EmotionKey } from './emotionEngine';

export function cleanTextForSpeech(text: string): string {
  return text
    .replace(/[*_`~#>]/g, '')
    .replace(
      /[ヽ٩Σ＼щ]?\([^()]{1,18}\)[ゞノﾉงو彡┻━゜。･✧☆:･ﾟ]*/g,
      (match) => (/[a-zA-Z0-9]{3,}/.test(match) ? match : '')
    )
    .replace(/\s+/g, ' ')
    .trim();
}

export function getVoiceParamsForMood(
  dominant: EmotionKey,
  archetype: Archetype,
  baseRate = 1.0
): { rate: number; pitch: number } {
  let rateOffset = 0;
  let pitchOffset = 0;

  switch (dominant) {
    case 'senang':
      rateOffset += 0.06;
      pitchOffset += 0.08;
      break;
    case 'marah':
      rateOffset += 0.08;
      pitchOffset -= 0.04;
      break;
    case 'takut':
      rateOffset += 0.04;
      pitchOffset += 0.1;
      break;
    case 'sedih':
      rateOffset -= 0.1;
      pitchOffset -= 0.08;
      break;
    case 'jijik':
      rateOffset -= 0.05;
      pitchOffset -= 0.06;
      break;
    case 'bingung':
    default:
      break;
  }

  if (archetype === 'Genki') {
    rateOffset += 0.05;
    pitchOffset += 0.06;
  } else if (archetype === 'Kuudere' || archetype === 'Stoik') {
    rateOffset -= 0.06;
    pitchOffset -= 0.05;
  }

  return {
    rate: Math.min(1.6, Math.max(0.65, Number((baseRate + rateOffset).toFixed(2)))),
    pitch: Math.min(1.4, Math.max(0.75, Number((1.0 + pitchOffset).toFixed(2)))),
  };
}

export function isTtsSupported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

export interface SpeechRecognitionLike {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((event: SpeechRecognitionResultEventLike) => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}

export interface SpeechRecognitionResultEventLike {
  resultIndex: number;
  results: ArrayLike<{
    isFinal: boolean;
    0: { transcript: string };
  }>;
}

export function getSpeechRecognitionCtor(): (new () => SpeechRecognitionLike) | null {
  if (typeof window === 'undefined') return null;
  const win = window as unknown as {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  };
  return win.SpeechRecognition || win.webkitSpeechRecognition || null;
}

export function isSttSupported(): boolean {
  return Boolean(getSpeechRecognitionCtor());
}

export function stopSpeaking(): void {
  if (!isTtsSupported()) return;
  window.speechSynthesis.cancel();
}

export function speakPersonaReply(options: {
  text: string;
  dominant: EmotionKey;
  archetype: Archetype;
  baseRate?: number;
  onEnd?: () => void;
  onError?: () => void;
}): boolean {
  if (!isTtsSupported()) return false;
  const cleaned = cleanTextForSpeech(options.text);
  if (!cleaned) return false;

  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(cleaned);
  utterance.lang = 'id-ID';

  const voices = window.speechSynthesis.getVoices();
  const idVoice =
    voices.find((v) => v.lang.toLowerCase().startsWith('id')) ||
    voices.find((v) => v.lang.toLowerCase().startsWith('ms')) ||
    voices[0];
  if (idVoice) {
    utterance.voice = idVoice;
  }

  const params = getVoiceParamsForMood(options.dominant, options.archetype, options.baseRate ?? 1.0);
  utterance.rate = params.rate;
  utterance.pitch = params.pitch;
  utterance.onend = () => options.onEnd?.();
  utterance.onerror = () => options.onError?.();

  window.speechSynthesis.speak(utterance);
  return true;
}
