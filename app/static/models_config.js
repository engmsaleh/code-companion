const MODEL_OPTIONS = [
  { provider: 'OpenAI', model: 'gpt-4-turbo', name: 'GPT-4 Turbo' },
  { provider: 'OpenAI', model: 'gpt-4', name: 'GPT-4' },
  { provider: 'OpenAI', model: 'gpt-4o', name: 'GPT-4o' },
  { provider: 'OpenAI', model: 'gpt-4o-mini', name: 'GPT-4o Mini' },
  { provider: 'Anthropic', model: 'claude-3-5-sonnet-20240620', name: 'Claude 3.5 Sonnet (Recommended)' },
  { provider: 'Anthropic', model: 'claude-3-opus-20240229', name: 'Claude 3 Opus' },
  {
    provider: 'OpenRouter',
    model: 'anthropic/claude-3.5-sonnet:beta',
    name: 'anthropic/claude-3.5-sonnet:beta',
  },
  { provider: 'OpenRouter', model: 'openai/gpt-4o-mini', name: 'openai/gpt-4o-mini' },
];

const SMALL_MODEL_OPTIONS = [
  { provider: 'OpenAI', model: 'gpt-4o-mini', name: 'GPT-4o Mini (Recommended)' },
  { provider: 'Anthropic', model: 'claude-3-haiku-20240307', name: 'Claude 3 Haiku' },
  { provider: 'OpenRouter', model: 'openai/gpt-4o-mini', name: 'openai/gpt-4o-mini' },
];

const EMBEDDINGS_MODEL_OPTIONS = [
  { provider: 'OpenAI', model: 'text-embedding-3-small', name: 'text-embedding-3-small (Recommended)' },
  { provider: 'OpenAI', model: 'text-embedding-3-large', name: 'text-embedding-3-large' },
  { provider: 'OpenAI', model: 'text-embedding-ada-002', name: 'text-embedding-ada-002' },
];

const DEFAULT_LARGE_MODEL = 'claude-3-5-sonnet-20240620';
const DEFAULT_SMALL_MODEL = 'gpt-4o-mini';
const DEFAULT_EMBEDDINGS_MODEL = 'text-embedding-3-small';

const EMBEDDINGS_VERSION = 'v1.9'; // when reindexing of code embedding is needed, update this version to bust cache

module.exports = {
  MODEL_OPTIONS,
  SMALL_MODEL_OPTIONS,
  EMBEDDINGS_MODEL_OPTIONS,
  DEFAULT_LARGE_MODEL,
  DEFAULT_SMALL_MODEL,
  DEFAULT_EMBEDDINGS_MODEL,
  EMBEDDINGS_VERSION,
};
