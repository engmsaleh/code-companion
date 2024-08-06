const os = require('os');
const Parser = require('@postlight/parser');
const _ = require('lodash');
const autosize = require('autosize');

const Agent = require('./chat/agent');
const Chat = require('./chat/chat');
const TerminalSession = require('./tools/terminal_session');
const Browser = require('./chat/tabs/browser');
const { trackEvent } = require('@aptabase/electron/renderer');
const BackgroundTask = require('./background_task');
const OpenAIModel = require('./models/openai');
const AnthropicModel = require('./models/anthropic');
const AWSBedrockModel = require('./models/aws_bedrock');
const { DEFAULT_LARGE_MODEL, DEFAULT_SMALL_MODEL, DEFAULT_EMBEDDINGS_MODEL } = require('./static/models_config');
const { allEnabledTools, planningTools } = require('./tools/tools');
const CustomModelsManager = require('./chat/custom_models');

const DEFAULT_SETTINGS = {
  apiKey: '',
  anthropicApiKey: '',
  openRouterApiKey: '',
  baseUrl: '',
  selectedModel: DEFAULT_LARGE_MODEL,
  selectedSmallModel: DEFAULT_SMALL_MODEL,
  selectedEmbeddingsModel: DEFAULT_EMBEDDINGS_MODEL,
  approvalRequired: true,
  maxFilesToEmbed: 1000,
  commandToOpenFile: 'code',
  theme: 'dark',
  awsAccessKeyId: '',
  awsSecretAccessKey: '',
  awsRegion: '',
};

class ChatController {
  constructor() {
    this.stopProcess = false;
    this.isProcessing = false;
    this.customModelsManager = new CustomModelsManager();
    this.loadAllSettings();
    this.initializeModel();
    this.chat = new Chat();
    this.chatLogs = [];
    this.agent = new Agent();
    this.terminalSession = new TerminalSession();
    this.browser = new Browser();
    this.processMessageChange = this.processMessageChange.bind(this);
    this.submitMessage = this.submitMessage.bind(this);
    this.usage = {
      input_tokens: 0,
      output_tokens: 0,
      total_tokens: 0,
    };
  }

  loadAllSettings() {
    this.settings = {};
    Object.keys(DEFAULT_SETTINGS).forEach((key) => {
      const value = this.loadSetting(key);
      this.renderSettingValueInUI(key, value);
    });
  }

  initializeModel() {
    this.model = null;
    this.smallModel = null;
    this.abortController = new AbortController();
    this.model = this.createModel(this.settings.selectedModel, (snapshot) => {
      this.chat.updateStreamingMessage(snapshot);
    });
    this.smallModel = this.createModel(this.settings.selectedSmallModel);
    this.backgroundTask = new BackgroundTask(this);
  }

  createModel(selectedModel, streamCallback) {
    let apiKey;
    let baseUrl;
    let AIModel;
    let defaultHeaders;
    const modelOptions = [...MODEL_OPTIONS, ...SMALL_MODEL_OPTIONS, ...this.customModelsManager.getCustomModels()];

    const selectedOption = modelOptions.find((option) => option.model === selectedModel);
    if (selectedOption?.provider === 'Anthropic') {
      apiKey = this.settings.anthropicApiKey;
      AIModel = AnthropicModel;
    } else if (selectedOption?.provider === 'OpenRouter') {
      defaultHeaders = {
        'HTTP-Referer': 'https://codecompanion.ai/',
        'X-Title': 'CodeCompanion',
      };
      apiKey = this.settings.openRouterApiKey;
      baseUrl = 'https://openrouter.ai/api/v1';
      AIModel = OpenAIModel;
    } else if (selectedOption?.provider === 'AWS') {
      AIModel = AWSBedrockModel;
      console.log('Creating AWS Bedrock Model with settings:', {
        awsAccessKeyId: this.settings.awsAccessKeyId,
        awsSecretAccessKey: this.settings.awsSecretAccessKey,
        awsRegion: this.settings.awsRegion,
      });
      return new AIModel({
        model: selectedModel,
        accessKeyId: this.settings.awsAccessKeyId,
        secretAccessKey: this.settings.awsSecretAccessKey,
        region: this.settings.awsRegion,
        chatController: this,
        streamCallback,
      });
    } else {
      apiKey = this.settings.apiKey;
      baseUrl = this.settings.baseUrl;
      AIModel = OpenAIModel;
    }

    if (!apiKey) return;

    return new AIModel({
      apiKey,
      model: selectedModel,
      baseUrl,
      chatController: this,
      streamCallback,
      defaultHeaders,
    });
  }

  renderSettingValueInUI(key, value) {
    let element = document.getElementById(key);
    if (!element) return;

    if (element.type === 'checkbox') {
      element.checked = value;
    } else {
      element.value = value;
    }
  }

  loadSetting(key) {
    const storedValue = localStorage.get(key);
    this.settings[key] = storedValue === undefined ? DEFAULT_SETTINGS[key] : storedValue;
    return this.settings[key];
  }

  saveSetting(key, value = null, elementId = null) {
    const element = elementId ? document.getElementById(elementId) : document.getElementById(key);
    if (value === null) {
      element.type === 'checkbox' ? (value = element.checked) : (value = element.value);
    }
    localStorage.set(key, value);
    this.settings[key] = value;
    this.renderSettingValueInUI(key, value);
    this.initializeModel();
  }

  handleError(error) {
    console.error('Error :', error);
    if (this.abortController.signal.aborted) {
      this.abortController = new AbortController();
      this.chat.addFrontendMessage('error', 'Request was aborted');
    } else {
      this.chat.addFrontendMessage('error', `Error occured. ${error.message}`);
    }
    this.stopProcess = false;
    document.getElementById('retry_button').removeAttribute('hidden');
  }

  async requestStopProcess() {
    this.stopProcess = true;
    this.isProcessing = false;
    this.model.abort();
    const stopButton = document.getElementById('requestStopProcess');
    await this.terminalSession.interruptShellSession();
    stopButton.innerHTML = '<i class="bi bg-body border-0 bi-stop-circle text-danger me-2"></i> Stopping...';
    setTimeout(() => {
      stopButton.innerHTML = '<i class="bi bg-body border-0 bi-stop-circle me-2"></i>';
      this.stopProcess = false;
    }, 2000);
  }

  retry() {
    this.process('', false);
  }

  async process(query, renderUserMessage = true, reflectMessage = null) {
    let apiResponse;
    document.getElementById('retry_button').setAttribute('hidden', true);

    if (!this.model) {
      this.chat.addFrontendMessage(
        'error',
        'No API key found for base model. Please add your API key under <a href="#" onclick="document.getElementById(\'settingsToggle\').click(); return false;">Settings</a>',
      );
      return;
    }

    if (this.stopProcess) {
      viewController.updateLoadingIndicator(false);
      return;
    }

    if (query) {
      this.chat.addBackendMessage('user', query);
      if (renderUserMessage) {
        this.chat.addFrontendMessage('user', query);
      }
    }

    if (this.isProcessing) {
      console.error('Already processing');
      this.isProcessing = false;
      return;
    }

    try {
      this.isProcessing = true;
      viewController.updateLoadingIndicator(true, '');
      const messages = await this.chat.chatContextBuilder.buildMessages(query, reflectMessage);
      const tools = this.chat.chatContextBuilder.taskNeedsPlan ? planningTools() : allEnabledTools();
      apiResponse = await this.model.call({ messages, model: this.settings.selectedModel, tools });
      this.updateUsage(apiResponse.usage);
    } catch (error) {
      this.handleError(error);
    } finally {
      this.isProcessing = false;
      viewController.updateLoadingIndicator(false);
    }

    await this.agent.runAgent(apiResponse);
  }

  updateUsage(usage) {
    if (!usage) return;

    this.usage = {
      input_tokens: usage.input_tokens,
      output_tokens: usage.output_tokens,
      total_tokens: this.usage.total_tokens + usage.input_tokens + usage.output_tokens,
    };
    viewController.updateFooterMessage();
  }

  async fetchAndParseUrl(url) {
    viewController.updateLoadingIndicator(true);
    try {
      const parsedResult = await Parser.parse(url, { contentType: 'text' });
      if (parsedResult.failed) {
        console.error('Error parsing URL:', parsedResult.error);
        this.chat.addFrontendMessage('error', `Error parsing URL:${parsedResult.error}`);
        return;
      }

      this.chat.addMessage('user', `Title: ${parsedResult.title}\nContent:\n${parsedResult.content}`);
    } catch (error) {
      console.error('Error fetching and parsing URL:', error);
      this.chat.addFrontendMessage('error', `Error fetching and parsing URL:${error}`);
    }
  }

  async processURL(url) {
    this.chat.addFrontendMessage('user', `URL: ${url}`);

    await this.fetchAndParseUrl(url);
  }

  async submitMessage() {
    const messageInput = document.getElementById('messageInput');
    const userMessage = messageInput.value.replace(/\n$/, '');
    if (!userMessage) return;

    messageInput.value = '';
    autosize.update(messageInput);

    const urlRegex = /https?:\/\/[^\s/$.?#].[^\s]*/gi;
    const urlMatches = userMessage.match(urlRegex);

    if (urlRegex.test(userMessage) && userMessage === urlMatches[0]) {
      this.processURL(urlMatches[0]);
    } else {
      await this.processNewUserMessage(userMessage);
    }
  }

  async processNewUserMessage(userMessage) {
    // only submitted form UI
    if (this.chat.isEmpty() || this.chat.onlyHasImages()) {
      this.chat.addTask(userMessage);
      document.getElementById('projectsCard').innerHTML = '';
      await this.process();
    } else {
      await this.process(userMessage);
    }
  }

  processMessageChange(event) {
    if (event.code === 'N' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      this.clearChat();
      return;
    }

    if (event.keyCode === 13 && !event.shiftKey) {
      this.submitMessage();
    }

    if (event.keyCode === 38) {
      const lastUserMessage = this.chat.getLastUserMessage();
      if (lastUserMessage) document.getElementById('messageInput').value = lastUserMessage;
    }
  }

  async clearChat() {
    trackEvent(`new_chat`);
    if (this.chat && this.chat.task) {
      document.getElementById('taskTitle').innerText = '';
      document.getElementById('taskContainer').innerHTML =
        '<div class="text-secondary">Provide task details in the chat input to start a new task</div>';
    }
    this.chat = new Chat();
    this.agent = new Agent(this.agent.projectController.currentProject);
    this.initializeModel();
    this.chatLogs = [];
    this.agent.userDecision = null;
    this.terminalSession.createShellSession();
    document.getElementById('output').innerHTML = '';
    document.getElementById('retry_button').setAttribute('hidden', true);
    document.getElementById('approval_buttons').setAttribute('hidden', true);
    document.getElementById('messageInput').disabled = false;
    this.stopProcess = false;
    this.usage = {
      input_tokens: 0,
      output_tokens: 0,
      total_tokens: 0,
    };
    viewController.updateFooterMessage();
    viewController.showWelcomeContent();

    this.agent.projectState = {
      complexity: '',
      currentWorkingDir: '',
      folderStructure: '',
      requirementsChecklist: '',
    };

    onboardingController.showAllTips();
    viewController.onShow();
  }
}

module.exports = ChatController;