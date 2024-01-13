const { modelOptions, defaultModel } = require('./static/models_config');
const { exec } = require('child_process');

function populateModelDropdown(selectedModel) {
  const selectModel = selectedModel || defaultModel;
  const select = document.getElementById('modelDropdown');
  for (const key in modelOptions) {
    const option = document.createElement('option');
    option.value = key;
    option.innerText = modelOptions[key];
    if (key === selectModel) {
      option.selected = true;
    }
    select.appendChild(option);
  }
}

function scrollToBottom() {
  const container = document.getElementById('search_result_container');
  const lastMessage = container.lastElementChild;

  if (lastMessage) {
    const rect = lastMessage.getBoundingClientRect();
    const bodyRect = document.body.getBoundingClientRect();
    const scrollPos = rect.bottom - bodyRect.top + 150; // offset from top of the body
    window.scrollTo({
      top: scrollPos,
      behavior: 'smooth',
    });
  }
}

async function copyCode(block, button) {
  const code = block.querySelector('code');
  const text = code.innerText;
  await navigator.clipboard.writeText(text);
  button.innerHTML = '<i class="bi bi-clipboard-check"></i>';

  setTimeout(() => {
    button.innerHTML = '<i class="bi bi-clipboard"></i>';
  }, 1000);
}

function addCopyCodeButtons() {
  const blocks = document.querySelectorAll('pre');
  blocks.forEach((block) => {
    block.classList.add('hljs');
    if (navigator.clipboard) {
      const button = document.createElement('button');
      button.classList.add('btn', 'btn-sm', 'position-absolute');
      button.style.top = '8px';
      button.style.right = '8px';
      button.innerHTML = '<i class="bi bi-clipboard"></i>';
      block.style.position = 'relative';
      block.appendChild(button);

      button.addEventListener('click', async () => {
        await copyCode(block, button);
      });
    }
  });
}

function formatResponse(item) {
  const copyButton = `<button class="btn btn-sm" id=copyMessage${item.id} onclick="chatController.chat.copyFrontendMessage(${item.id})"><i class="bi bi-clipboard"></i></button>`;
  const deleteMessagesButton = `<button class="btn btn-sm" id=deleteMessage${item.id} onclick="chatController.chat.deleteMessagesAfterId(${item.id})"><i class="bi bi-trash"></i></button>`;
  const buttons = `<div class="col-auto pt-3">${deleteMessagesButton}${copyButton}</div>`;

  if (item.role === 'user') {
    return `<div class="row bg-light-subtle rounded border mt-3">
                  <div class="col-auto pt-3">
                      <i class="bi bi-person"></i>
                  </div>
                  <div class="col pt-3">
                      ${item && item.content ? marked.parse(item.content) : ''}
                  </div>
                  ${buttons}
              </div>`;
  }
  if (item.role === 'command') {
    return `<div class="row mt-3">
                  <div class="col-auto pt-3">
                      <i class="bi bi-terminal"></i>
                    </div>
                  <div class="col pt-3">
                      ${item && item.content ? marked.parse(item.content) : ''}
                  </div>
              </div>`;
  }
  if (item.role === 'function') {
    return `<div class="row">
              <div class="col pt-0 text-muted ms-5">
                  ${item.content}
              </div>
            </div>`;
  }
  if (item.role === 'error') {
    return `<div class="row mt-3">
                  <div class="col-auto pt-3">
                      <i class="bi bi-exclamation-triangle text-warning"></i>
                    </div>
                  <div class="col pt-3">
                      ${item && item.content ? marked.parse(item.content) : ''}
                  </div>
              </div>`;
  }
  if (item.role === 'info') {
    return `<div class="row mt-3">
                  <div class="col-auto pt-3">
                      <i class="bi bi-info-circle"></i>
                    </div>
                  <div class="col pt-3">
                      ${item && item.content ? marked.parse(item.content) : ''}
                  </div>
              </div>`;
  }
  if (item.role === 'file') {
    return `<div class="row bg-light-subtle rounded border mt-3">
                  <div class="col-auto pt-3">
                      <i class="bi bi-paperclip"></i>
                    </div>
                  <div class="col pt-3">
                      ${item && item.content ? marked.parse(item.content) : ''}
                  </div>
                  <div class="col-auto pt-3">${deleteMessagesButton}</div>
              </div>`;
  }
  if (item.role === 'onboarding') {
    return `<div class="row border rounded mt-3">
                  <div class="col-auto pt-3">
                     <i class="bi bi-info-circle"></i>
                  </div>
                  <div class="col pt-3">
                      <p>Tip: ${item.content}</p>
                  </div>
              </div>`;
  }

  return `<div class="row mt-3">
                  <div class="col-auto pt-3">
                      <i class="bi bi-chat-right-dots" style="color:#03BD9D"></i>
                    </div>
                  <div class="col pt-3 with-code-block">
                      ${item && item.content ? marked.parse(item.content) : ''}
                  </div>
                  ${buttons}
              </div>`;
}

function changeTheme(theme) {
  const htmlElement = document.querySelector('html');
  htmlElement.setAttribute('data-bs-theme', theme);
  settings.set('theme', theme);

  const stylesheet = document.querySelector('link[href^="node_modules/highlight.js/styles/"]');
  if (theme === 'light') {
    stylesheet.href = 'node_modules/highlight.js/styles/github.css';
  } else {
    stylesheet.href = 'node_modules/highlight.js/styles/github-dark-dimmed.css';
  }

  ipcRenderer.send('theme-change', theme);
}

function renderSystemMessage(message) {
  let messageToShow = message || '';
  if (chatController.conversationTokens > 0 && message) {
    messageToShow += ' | ';
  }
  if (chatController.conversationTokens > 0) {
    messageToShow += `Tokens: Last - ${chatController.lastRequestTokens}, Total - ${chatController.conversationTokens}`;
  }
  if (messageToShow) {
    document.getElementById('systemMessage').innerText = messageToShow;
  }
}

function updateLoadingIndicator(show, message = 'Loading...') {
  const loadingIndicator = document.getElementById('loading_indicator');
  const loadingIndicatorMessage = document.getElementById('loading_message');
  if (show) {
    loadingIndicator.removeAttribute('hidden');
    loadingIndicatorMessage.innerText = message;
  } else {
    loadingIndicator.setAttribute('hidden', true);
    loadingIndicatorMessage.innerText = '';
  }
}

function onShow() {
  messageInput.focus();
}

function selectDirectory() {
  ipcRenderer.send('open-directory');
}

function saveApiKey() {
  const apiKey = document.getElementById('apiKey').value;
  settings.set('apiKey', apiKey);
  chatController.openai = new OpenAI({ apiKey: apiKey, dangerouslyAllowBrowser: true, maxRetries: chatController.MAX_RETRIES });
  chatController.clearChat();
}

function saveMaxTokensPerRequest() {
  const maxTokensPerRequest = document.getElementById('maxTokensPerRequest').value;
  settings.set('maxTokensPerRequest', maxTokensPerRequest);
  chatController.maxTokensPerRequest = maxTokensPerRequest;
}

function saveMaxTokensPerChat() {
  const maxTokensPerChat = document.getElementById('maxTokensPerChat').value;
  settings.set('maxTokensPerChat', maxTokensPerChat);
  chatController.maxTokensPerChat = maxTokensPerChat;
}

function saveMaxFilesToEmbed() {
  const maxFilesToEmbed = document.getElementById('maxFilesToEmbed').value;
  settings.set('maxFilesToEmbed', maxFilesToEmbed);
}

function saveCommandToOpenFile() {
  const commandToOpenFile = document.getElementById('commandToOpenFile').value;
  settings.set('commandToOpenFile', commandToOpenFile);
}

function openFileDialogue() {
  ipcRenderer.send('open-file-dialog');
}

function openFile(filePath) {
  const commandToOpenFile = settings.get('commandToOpenFile') || 'code';
  const terminalCommand = `${commandToOpenFile} "${filePath}"`;
  chatController.terminalSession.executeCommandWithoutOutput(terminalCommand);
}

module.exports = {
  populateModelDropdown,
  copyCode,
  changeTheme,
  renderSystemMessage,
  updateLoadingIndicator,
  onShow,
  selectDirectory,
  formatResponse,
  addCopyCodeButtons,
  scrollToBottom,
  saveApiKey,
  saveMaxTokensPerRequest,
  saveMaxTokensPerChat,
  openFileDialogue,
  saveMaxFilesToEmbed,
  saveCommandToOpenFile,
  openFile,
};
