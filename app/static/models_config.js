const modelOptions = {
  'gpt-4-turbo-preview': 'GPT-4 Turbo',
  'gpt-4-0125-preview': 'GPT-4',
};
const defaultModel = 'gpt-4-turbo-preview';

const EMBEDDINGS_VERSION = 'v1.6'; // when reindexing is needed, update this version
const EMBEDDINGS_MODEL_NAME = 'text-embedding-ada-002';
const MODELS_WITH_JSON_SUPPORT = ['gpt-3.5-turbo-0125', 'gpt-4-turbo-preview'];
const DEFAULT_BACKGROUND_TASK_MODEL = 'gpt-3.5-turbo-0125';

module.exports = {
  modelOptions,
  defaultModel,
  EMBEDDINGS_VERSION,
  EMBEDDINGS_MODEL_NAME,
  MODELS_WITH_JSON_SUPPORT,
  DEFAULT_BACKGROUND_TASK_MODEL,
};
