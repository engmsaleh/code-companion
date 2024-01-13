const os = require('os');
const fs = require('graceful-fs');
const path = require('path');
const hljs = require('highlight.js/lib/common');
const { marked } = require('marked');
const { markedHighlight } = require('marked-highlight');
const autosize = require('autosize');
const { _, debounce } = require('lodash');
const { ipcRenderer, shell } = require('electron');
const { OpenAI } = require('openai');
const Store = require('electron-store');

const {
  populateModelDropdown,
  changeTheme,
  selectDirectory,
  openFileDialogue,
  onShow,
  updateLoadingIndicator,
  saveApiKey,
  saveMaxTokensPerRequest,
  saveMaxTokensPerChat,
  renderSystemMessage,
  saveMaxFilesToEmbed,
  saveCommandToOpenFile,
  openFile,
} = require('./js/view_handler');
const ChatController = require('./js/chat_controller');
const { processFile, handleDrop } = require('./js/file_handler');
const Onboarding = require('./js/onboarding');
const onboardingSteps = require('./js/static/onboarding_steps');
const { modelOptions, defaultModel } = require('./js/static/models_config');

const settings = new Store();
const chatController = new ChatController();
const onboarding = new Onboarding(onboardingSteps);
const isWindows = process.platform === 'win32';
const isDevelopment = process.env.NODE_ENV === 'development';
let dataPath;

// IPC listeners

ipcRenderer.on('read-files', async (event, file) => {
  const { filePaths } = file;
  for (const filePath of filePaths) {
    processFile(filePath);
  }
});

ipcRenderer.on('directory-data', async (event, file) => {
  const { filePaths } = file;
  if (filePaths.length > 0) {
    chatController.codeAgent.projectHandler.openProject(filePaths[0]);
  }
});

ipcRenderer.on('app-info', (event, data) => {
  const { version, userDataPath } = data;
  dataPath = userDataPath;
  document.getElementById('appVersion').innerText = version;
});

ipcRenderer.on('file-error', (event, errMessage) => {
  alert(`An error occurred reading the file: ${errMessage}`);
});

ipcRenderer.on('save-shortcut-triggered', () => {
  chatController.chat.history.showModal();
});

// Event listeners

document.addEventListener('DOMContentLoaded', () => {
  let savedModel = settings.get('selectedModel');
  if (!modelOptions.hasOwnProperty(savedModel)) {
    savedModel = defaultModel;
  }
  const savedApiKey = settings.get('apiKey');
  const savedTheme = settings.get('theme') || 'dark';
  const maxTokensPerRequest = settings.get('maxTokensPerRequest') || 10000;
  const maxTokensPerChat = settings.get('maxTokensPerChat') || 100000;

  chatController.maxTokensPerRequest = maxTokensPerRequest;
  chatController.maxTokensPerChat = maxTokensPerChat;

  chatController.setModel(savedModel);
  chatController.clearChat();
  if (savedApiKey) {
    chatController.openai = new OpenAI({ apiKey: savedApiKey, dangerouslyAllowBrowser: true, maxRetries: chatController.MAX_RETRIES });
  }

  changeTheme(savedTheme);
  const themeDropdown = document.getElementById('themeDropdown');
  themeDropdown.value = savedTheme;

  populateModelDropdown(savedModel);

  marked.setOptions({
    renderer: new marked.Renderer(),
    pedantic: false,
    gfm: true,
    breaks: true,
    smartypants: false,
    xhtml: false,
  });
  marked.use(
    markedHighlight({
      langPrefix: 'language-',
      highlight(code, language) {
        // Check if the highlighting language exists
        if (hljs.getLanguage(language)) {
          return hljs.highlight(code, { language }).value;
        }
        // If the language doesn't exist, fallback to auto-detection
        return hljs.highlightAuto(code).value;
      },
    }),
  );

  const messageInput = document.getElementById('messageInput');
  autosize(messageInput);

  document.getElementById('apiKey').value = savedApiKey || '';
  document.getElementById('maxTokensPerRequest').value = maxTokensPerRequest;
  document.getElementById('maxTokensPerChat').value = maxTokensPerChat;
  document.getElementById('maxFilesToEmbed').value = settings.get('maxFilesToEmbed') || 500;
  document.getElementById('commandToOpenFile').value = settings.get('commandToOpenFile') || 'code';
  document.getElementById('approvalToggle').checked = settings.get('approvalRequired') !== undefined ? settings.get('approvalRequired') : true;
  onboarding.showAllTips();
});

const debouncedSubmit = debounce(chatController.processMessageChange, 100);
document.getElementById('messageInput').addEventListener('keydown', debouncedSubmit);

document.getElementById('reject_button').addEventListener('click', function () {
  chatController.codeAgent.userDecision = false;
});

document.getElementById('approve_button').addEventListener('click', function () {
  chatController.codeAgent.userDecision = true;
});

// Open links in browser not in app
document.addEventListener('click', (event) => {
  let targetElement = event.target;

  if (targetElement.tagName === 'I' && targetElement.parentElement && targetElement.parentElement.tagName === 'A') {
    targetElement = targetElement.parentElement;
  }

  if (targetElement.tagName === 'A' && targetElement.href.startsWith('http')) {
    event.preventDefault();
    shell.openExternal(targetElement.href);
  }
});
