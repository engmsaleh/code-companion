const modelOptions = {
  'gpt-4-turbo': 'GPT-4 Turbo',
  'gpt-4o': 'GPT-4o',
  'gpt-4o-mini': 'GPT-4o Mini',
  'gpt-4': 'GPT-4',
  'claude-3-5-sonnet-20240620': 'Claude 3.5 Sonnet',
  'claude-3-opus-20240229': 'Claude 3 Opus',
};
const defaultModel = 'gpt-4-turbo';

const EMBEDDINGS_VERSION = 'v1.9'; // when reindexing of code embedding is needed, update this version
const EMBEDDINGS_MODEL_NAME = 'text-embedding-ada-002';
const CONTEXTUAL_COMPRESSION_MODEL_NAME = 'gpt-3.5-turbo';

module.exports = {
  modelOptions,
  defaultModel,
  EMBEDDINGS_VERSION,
  EMBEDDINGS_MODEL_NAME,
  CONTEXTUAL_COMPRESSION_MODEL_NAME,
};
