const modelOptions = {
  'gpt-4o': 'GPT-4o',
  'gpt-4-turbo': 'GPT-4 Turbo with Vision',
  'gpt-4': 'GPT-4',
};
const defaultModel = 'gpt-4o';

const EMBEDDINGS_VERSION = 'v1.6'; // when reindexing of code embedding is needed, update this version
const EMBEDDINGS_MODEL_NAME = 'text-embedding-ada-002';

module.exports = {
  modelOptions,
  defaultModel,
  EMBEDDINGS_VERSION,
  EMBEDDINGS_MODEL_NAME,
};
