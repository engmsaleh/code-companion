const modelOptions = {
  'gpt-4-turbo-preview': 'GPT-4 Turbo',
  'gpt-4-0125-preview': 'GPT-4',
  'gpt-3.5-turbo-1106': 'GPT-3.5',
};
const defaultModel = 'gpt-4-turbo-preview';

const EMBEDDINGS_VERSION = 'v1.6'; // when reindexing is needed, update this version
const EMBEDDINGS_MODEL_NAME = 'text-embedding-ada-002';

module.exports = {
  modelOptions,
  defaultModel,
  EMBEDDINGS_VERSION,
  EMBEDDINGS_MODEL_NAME,
};
