export type ByokProvider = 'gemini' | 'openai' | 'openai-compatible';

export interface ByokConfig {
  enabled: boolean;
  provider: ByokProvider;
  apiKey: string;
  model: string;
  baseUrl: string;
}

export interface ByokProviderMeta {
  id: ByokProvider;
  label: string;
  shortLabel: string;
  description: string;
  defaultModel: string;
  suggestedModels: string[];
  defaultBaseUrl: string;
  keyPlaceholder: string;
  needsBaseUrl: boolean;
}

export const BYOK_PROVIDERS: Record<ByokProvider, ByokProviderMeta> = {
  gemini: {
    id: 'gemini',
    label: 'Google Gemini',
    shortLabel: 'Gemini',
    description: 'Gunakan API key Google AI Studio / Gemini Anda sendiri.',
    defaultModel: 'gemini-4-hydrogen',
    suggestedModels: [
      'gemini-4-hydrogen',
      'gemini-3.1-flash-lite',
      'gemini-2.5-flash',
      'gemini-2.5-pro',
    ],
    defaultBaseUrl: '',
    keyPlaceholder: 'AIzaSy...',
    needsBaseUrl: false,
  },
  openai: {
    id: 'openai',
    label: 'OpenAI',
    shortLabel: 'OpenAI',
    description: 'Gunakan API key OpenAI resmi (GPT-4o / GPT-4.1).',
    defaultModel: 'gpt-4o-mini',
    suggestedModels: ['gpt-4o-mini', 'gpt-4.1-mini', 'gpt-4o'],
    defaultBaseUrl: 'https://api.openai.com/v1',
    keyPlaceholder: 'sk-...',
    needsBaseUrl: false,
  },
  'openai-compatible': {
    id: 'openai-compatible',
    label: 'OpenAI-Compatible',
    shortLabel: 'Custom API',
    description: 'OpenRouter, Groq, DeepSeek, Together, atau endpoint lokal (/v1).',
    defaultModel: 'llama-3.3-70b-versatile',
    suggestedModels: [
      'llama-3.3-70b-versatile',
      'openai/gpt-4o-mini',
      'deepseek-chat',
      'anthropic/claude-3.5-sonnet',
    ],
    defaultBaseUrl: 'https://api.groq.com/openai/v1',
    keyPlaceholder: 'gsk_... / sk-or-...',
    needsBaseUrl: true,
  },
};

export const BYOK_PROVIDER_ORDER: ByokProvider[] = [
  'gemini',
  'openai',
  'openai-compatible',
];

export const DEFAULT_BYOK_CONFIG: ByokConfig = {
  enabled: false,
  provider: 'gemini',
  apiKey: '',
  model: BYOK_PROVIDERS.gemini.defaultModel,
  baseUrl: '',
};

const VALID_PROVIDERS = new Set<ByokProvider>(['gemini', 'openai', 'openai-compatible']);

export function isValidHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

export function sanitizeByokConfig(raw: unknown): ByokConfig {
  const obj = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const provider: ByokProvider =
    typeof obj.provider === 'string' && VALID_PROVIDERS.has(obj.provider as ByokProvider)
      ? (obj.provider as ByokProvider)
      : DEFAULT_BYOK_CONFIG.provider;

  const meta = BYOK_PROVIDERS[provider];
  const apiKey = typeof obj.apiKey === 'string' ? obj.apiKey.trim().slice(0, 300) : '';
  const enabled = Boolean(obj.enabled);

  const rawModel = typeof obj.model === 'string' ? obj.model.trim().slice(0, 120) : '';
  const model = rawModel || meta.defaultModel;

  const rawBaseUrl = typeof obj.baseUrl === 'string' ? obj.baseUrl.trim().replace(/\/+$/, '') : '';
  let baseUrl = '';
  if (rawBaseUrl && isValidHttpUrl(rawBaseUrl)) {
    baseUrl = rawBaseUrl;
  } else if (meta.needsBaseUrl) {
    baseUrl = meta.defaultBaseUrl;
  }

  return {
    enabled,
    provider,
    apiKey,
    model,
    baseUrl,
  };
}

export function isByokActive(config: ByokConfig): boolean {
  return Boolean(config.enabled && config.apiKey.trim().length > 0);
}

export function buildByokHeaders(config: ByokConfig): Record<string, string> {
  if (!isByokActive(config)) {
    return {};
  }
  const clean = sanitizeByokConfig(config);
  const headers: Record<string, string> = {
    'X-BYOK-Provider': clean.provider,
    'X-BYOK-Api-Key': clean.apiKey,
    'X-BYOK-Model': clean.model,
  };
  if (clean.baseUrl) {
    headers['X-BYOK-Base-Url'] = clean.baseUrl;
  }
  return headers;
}

export function maskApiKey(key: string): string {
  const trimmed = key.trim();
  if (!trimmed) return '';
  if (trimmed.length <= 8) return '••••••••';
  return `${trimmed.slice(0, 4)}••••${trimmed.slice(-4)}`;
}
