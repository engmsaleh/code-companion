const os = require('os');
const { OpenAI } = require('openai');
const Parser = require('@postlight/parser');
const _ = require('lodash');
const autosize = require('autosize');

const Agent = require('./chat/agent');
const Chat = require('./chat/chat');
const TerminalSession = require('./tools/terminal_session');
const { trackEvent } = require('@aptabase/electron/renderer');
const BackgroundTask = require('./background_task');
const { toolDefinitions, formattedTools } = require('./tools/tools');
const { defaultModel } = require('./static/models_config');

const MAX_RETRIES = 3;
const DEFAULT_SETTINGS = {
  apiKey: '',
  baseUrl: '',
  selectedModel: defaultModel,
  approvalRequired: true,
  maxFilesToEmbed: 1000,
  commandToOpenFile: 'code',
  theme: 'dark',
};

class ChatController {
  constructor() {
    this.openai = null;
    this.stopProcess = false;
    this.conversationTokens = 0;
    this.lastRequestTokens = 0;
    this.isProcessing = false;

    this.loadAllSettings();
    this.initializeOpenAIAPI();
    this.abortController = new AbortController();
    this.chat = new Chat();
    this.agent = new Agent();
    this.terminalSession = new TerminalSession();
    this.processMessageChange = this.processMessageChange.bind(this);
    this.submitMessage = this.submitMessage.bind(this);
    this.formattedTools = formattedTools();
  }

  initializeOpenAIAPI() {
    const apiKey = this.settings.apiKey;
    if (!apiKey) {
      return;
    }

    const config = {
      apiKey: apiKey,
      dangerouslyAllowBrowser: true,
      maxRetries: MAX_RETRIES,
    };

    if (this.settings.baseUrl) {
      config.baseURL = this.settings.baseUrl;
    }

    this.openai = new OpenAI(config);
    this.backgroundTask = new BackgroundTask(this);
  }

  loadAllSettings() {
    this.settings = {};

    Object.keys(DEFAULT_SETTINGS).forEach((key) => {
      const value = this.loadSetting(key);
      this.renderSettingValueInUI(key, value);
    });
  }

  renderSettingValueInUI(key, value) {
    let element = document.getElementById(key);
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

  saveSetting(key, value = null) {
    const element = document.getElementById(key);
    if (value === null) {
      element.type === 'checkbox' ? (value = element.checked) : (value = element.value);
    }
    localStorage.set(key, value);
    this.settings[key] = value;
    this.renderSettingValueInUI(key, value);

    if (key === 'apiKey' || key === 'baseUrl') {
      this.initializeOpenAIAPI();
      this.clearChat();
    }
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

  requestStopProcess() {
    this.stopProcess = true;
    this.isProcessing = false;
    this.abortController.abort();
    const stopButton = document.getElementById('requestStopProcess');
    this.terminalSession.interruptShellSession();
    stopButton.innerHTML = '<i class="bi bg-body border-0 bi-stop-circle text-danger me-2"></i> Stopping...';
    setTimeout(() => {
      stopButton.innerHTML = '<i class="bi bg-body border-0 bi-stop-circle me-2"></i>';
      this.abortController = new AbortController();
      this.stopProcess = false;
    }, 2000);
  }

  async callAPI(api_messages, model = this.settings.selectedModel, retryCount = 0) {
    try {
      this.lastRequestTokens = 0;

      const callParams = {
        model,
        messages: api_messages,
        top_p: 0.1,
        stream: true,
        tools: this.formattedTools.map((tool) => ({ type: 'function', function: tool })),
      };

      if (isDevelopment) {
        callParams.seed = 69;
        console.log(`Calling API (${this.chat.countTokens(JSON.stringify(api_messages))} tokens)`, callParams);
      }

      const stream = await this.openai.beta.chat.completions.stream(callParams, {
        maxRetries: this.MAX_RETRIES,
        signal: this.abortController.signal,
      });

      stream.on('content', (_delta, snapshot) => {
        this.chat.updateStreamingMessage(snapshot);
      });

      const chatCompletion = await stream.finalChatCompletion();
      if (isDevelopment) {
        console.log('API response:', chatCompletion);
      }

      this.estimateTokenUsage(api_messages, chatCompletion);

      // if function call try parsing to retry
      if (chatCompletion?.choices[0].message?.function_call) {
        JSON.parse(chatCompletion.choices[0].message.function_call.arguments);
      }

      viewController.updateFooterMessage();

      return chatCompletion;
    } catch (error) {
      console.error('Error during openai.createChatCompletion:', error);

      if ((error instanceof OpenAI.APIError && error.status == 429) || error instanceof SyntaxError) {
        if (retryCount >= this.MAX_RETRIES) {
          throw error;
        }
        console.error(`Rate limit exceeded, retrying - ${retryCount}...`, error);
        viewController.updateFooterMessage('Error occured. Retrying...');
        await new Promise((resolve) => setTimeout(resolve, 300));
        return this.callAPI(api_messages, model, retryCount + 1);
      } else {
        throw error;
      }
    }
  }

  estimateTokenUsage(api_messages, chatCompletion) {
    this.lastRequestTokens += this.chat.countTokens(
      JSON.stringify(api_messages.filter((message) => !Array.isArray(message.content))),
    );

    this.conversationTokens += this.lastRequestTokens;

    if (chatCompletion?.choices[0]?.message) {
      this.conversationTokens += this.chat.countTokens(JSON.stringify(chatCompletion?.choices[0].message));
    }
  }

  retry() {
    this.process('', false);
  }

  async process(query, renderUserMessage = true, reflectMessage = null) {
    let apiResponseMessage;
    document.getElementById('retry_button').setAttribute('hidden', true);

    if (!this.openai) {
      this.chat.addFrontendMessage(
        'error',
        'Please add your <a href="https://platform.openai.com/account/api-keys">OpenAI API key</a> under settings menu (<i class="bi bi-gear bg-body border-0"></i>)',
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
      viewController.updateLoadingIndicator(true, 'Waiting for ChatGPT ...');
      const apiMessages = await this.chat.chatContextBuilder.buildMessages(query, reflectMessage);
      const apiResponse = await this.callAPI(apiMessages);

      if (!apiResponse) {
        console.error('No response from API');
        throw new Error('No response from API');
      }

      if (apiResponse.choices[0].finish_reason === 'length') {
        this.chat.addFrontendMessage(
          'error',
          'Response was incomplete due to model context size limit. <br />Please clear chat or delete some messages and try again.',
        );
        document.getElementById('retry_button').removeAttribute('hidden');
        return;
      }

      apiResponseMessage = apiResponse.choices[0].message;
    } catch (error) {
      this.handleError(error);
    } finally {
      this.isProcessing = false;
      viewController.updateLoadingIndicator(false);
    }

    await this.agent.runAgent(apiResponseMessage);
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
    if (this.chat.isEmpty()) {
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
    this.chat = new Chat();
    this.agent.userDecision = null;
    this.terminalSession.createShellSession();
    document.getElementById('output').innerHTML = '';
    document.getElementById('retry_button').setAttribute('hidden', true);
    document.getElementById('approval_buttons').setAttribute('hidden', true);
    document.getElementById('messageInput').disabled = false;
    this.chat.renderTask();
    document.getElementById('messageInput').setAttribute('placeholder', 'Provide task details...');
    this.stopProcess = false;
    this.conversationTokens = 0;
    this.lastRequestTokens = 0;
    viewController.updateFooterMessage();
    viewController.updateProjectsWindow();

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
