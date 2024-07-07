const modelOptions = {
  'gpt-4-turbo': 'GPT-4 Turbo with Vision',
  'gpt-4o': 'GPT-4o',
  'gpt-4': 'GPT-4',
  'claude-3-5-sonnet-20240620': 'Claude 3.5 Sonnet',
};
const defaultModel = 'gpt-4-turbo';

const EMBEDDINGS_VERSION = 'v1.8'; // when reindexing of code embedding is needed, update this version
const EMBEDDINGS_MODEL_NAME = 'text-embedding-ada-002';

module.exports = {
  modelOptions,
  defaultModel,
  EMBEDDINGS_VERSION,
  EMBEDDINGS_MODEL_NAME,
};
