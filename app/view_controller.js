const hljs = require('highlight.js/lib/common');
const { marked } = require('marked');
const { markedHighlight } = require('marked-highlight');
const autosize = require('autosize');
const { drawDiff } = require('./tools/code_diff');
const feedbackModal = new bootstrap.Modal(document.getElementById('feedbackModal'));

class ViewController {
  initializeUIFormatting() {
    const renderer = new marked.Renderer();

    // Override the code method of the renderer
    renderer.code = function (code, language) {
      if (language && language === 'diff') {
        const diffContainer = document.createElement('div');
        diffContainer.className = 'diff-container';
        drawDiff(diffContainer, code);
        return diffContainer.outerHTML;
      }
      if (language && hljs.getLanguage(language)) {
        return `<pre class="hljs ${language}"><code>${hljs.highlight(code, { language }).value}</code></pre>`;
      }
      return `<pre class="hljs"><code>${hljs.highlightAuto(code).value}</code></pre>`;
    };

    // Set options for marked
    marked.setOptions({
      renderer: renderer, // Use the custom renderer
      highlight: function (code, language) {
        if (language && hljs.getLanguage(language)) {
          return hljs.highlight(code, { language }).value;
        }
        return hljs.highlightAuto(code).value;
      },
      langPrefix: 'language-',
      pedantic: false,
      gfm: true,
      breaks: true,
      smartypants: false,
      xhtml: false,
    });

    const messageInput = document.getElementById('messageInput');
    autosize(messageInput);
  }

  handleClick(event) {
    let targetElement = event.target;

    if (targetElement.tagName === 'I' && targetElement.parentElement && targetElement.parentElement.tagName === 'A') {
      targetElement = targetElement.parentElement;
    }

    if (targetElement.tagName === 'A' && targetElement.href.startsWith('http')) {
      event.preventDefault();
      shell.openExternal(targetElement.href);
    }
  }

  buildDropdown(elementId, options, selectedOption) {
    const select = document.getElementById(elementId);
    Object.entries(options).forEach(([optionValue, optionText]) => {
      const option = document.createElement('option');
      option.value = optionValue;
      option.innerText = optionText;
      if (optionValue === selectedOption) {
        option.selected = true;
      }
      select.appendChild(option);
    });
  }

  scrollToBottom() {
    const container = document.getElementById('search_result_container');

    if (container) {
      window.scrollTo({
        top: container.scrollHeight,
        behavior: 'smooth',
      });
    }
  }

  async copyCode(block, button) {
    const code = block.querySelector('code');
    const text = code.innerText;
    await navigator.clipboard.writeText(text);
    button.innerHTML = '<i class="bi bi-clipboard-check"></i>';

    setTimeout(() => {
      button.innerHTML = '<i class="bi bi-clipboard"></i>';
    }, 1000);
  }

  addCopyCodeButtons() {
    const blocks = document.querySelectorAll('pre');
    blocks.forEach((block) => {
      if (navigator.clipboard) {
        const button = document.createElement('button');
        button.classList.add('btn', 'btn-sm', 'position-absolute');
        button.style.top = '8px';
        button.style.right = '8px';
        button.innerHTML = '<i class="bi bi-clipboard"></i>';
        block.style.position = 'relative';
        block.appendChild(button);

        button.addEventListener('click', async () => {
          await this.copyCode(block, button);
        });
      }
    });
  }

  formatResponse(item) {
    const copyButton = `<button class="btn btn-sm" id=copyMessage${item.id} onclick="chatController.chat.copyFrontendMessage(${item.id})"><i class="bi bi-clipboard"></i></button>`;
    const deleteMessagesButton = `<button class="btn btn-sm" id=deleteMessage${item.id} onclick="chatController.chat.deleteMessagesAfterId(${item.id})"><i class="bi bi-trash"></i></button>`;
    const buttons = `<div class="col-auto pt-3">${deleteMessagesButton}${copyButton}</div>`;

    const roleSettings = {
      user: { icon: 'person', rowClass: 'bg-light-subtle rounded mt-3', rowPadding: '3' },
      command: { icon: 'terminal', rowClass: 'mt-3', rowPadding: '3' },
      function: { icon: null, rowClass: 'text-muted ms-1', rowPadding: '0' },
      error: { icon: 'exclamation-triangle text-warning', rowClass: 'mt-3', rowPadding: '3' },
      info: { icon: 'info-circle', rowClass: 'mt-3', rowPadding: '3' },
      file: { icon: 'paperclip', rowClass: 'mt-3', rowPadding: '3' },
      onboarding: { icon: 'info-circle', rowClass: 'mt-3', rowPadding: '3' },
      assistant: { icon: 'stars text-primary', rowClass: 'mt-3', rowPadding: '3' },
    };

    const roleSetting = roleSettings[item.role];
    return this.createMessageHTML(roleSetting, item.content, buttons);
  }

  createMessageHTML(roleSetting, content, buttons = '') {
    return `<div class="row ${roleSetting.rowClass} align-items-start">
              <div class="col-auto pt-${roleSetting.rowPadding}">
                ${roleSetting.icon ? `<i class="bi bi-${roleSetting.icon}"></i>` : '&nbsp;'}
              </div>
              <div class="col w-50 pt-${roleSetting.rowPadding}">
                ${content ? marked.parse(content) : ''}
              </div>
              ${buttons}
            </div>`;
  }

  updateProjectsWindow() {
    const chat = chatController.chat;
    if (chat.frontendMessages.length === 0 && chat.task === null) {
      viewController.showWelcomeContent();
    } else {
      document.getElementById('projectsCard').innerHTML = '';
    }
  }

  changeTheme(theme) {
    const htmlElement = document.querySelector('html');
    htmlElement.setAttribute('data-bs-theme', theme);
    localStorage.set('theme', theme);

    const stylesheet = document.querySelector('link[href^="node_modules/highlight.js/styles/"]');
    if (theme === 'light') {
      stylesheet.href = 'node_modules/highlight.js/styles/github.css';
    } else {
      stylesheet.href = 'node_modules/highlight.js/styles/github-dark-dimmed.css';
    }

    ipcRenderer.send('theme-change', theme);
  }

  updateFooterMessage(message) {
    let messageToShow = message || '';
    if (chatController.conversationTokens > 0 && message) {
      messageToShow += ' | ';
    }
    if (chatController.conversationTokens > 0) {
      messageToShow += `Tokens: Last - ${chatController.lastRequestTokens}, Total - ${chatController.conversationTokens}`;
    }
    if (messageToShow) {
      document.getElementById('footerMessage').innerText = messageToShow;
    }
  }

  updateLoadingIndicator(show, message = 'Loading...') {
    const loadingIndicator = document.getElementById('loadingIndicator');
    const loadingIndicatorMessage = document.getElementById('loadingMessage');
    if (show) {
      loadingIndicator.removeAttribute('hidden');
      loadingIndicatorMessage.innerText = message;
    } else {
      loadingIndicator.setAttribute('hidden', true);
      loadingIndicatorMessage.innerText = '';
    }
  }

  onShow() {
    messageInput.focus();
  }

  selectDirectory() {
    ipcRenderer.send('open-directory');
  }

  openFileDialogue() {
    ipcRenderer.send('open-file-dialog');
  }

  openFileInIDE(filePath) {
    const terminalCommand = `${chatController.settings.commandToOpenFile} "${filePath}"`;
    chatController.terminalSession.executeCommandWithoutOutput(terminalCommand);
  }

  showFeedbackModal() {
    feedbackModal.show();
  }

  submitFeedback() {
    const form = document.getElementById('feedbackForm');
    const formData = new FormData(form);
    fetch('https://submit-form.com/iStsJP8J', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams(formData).toString(),
    })
      .then((data) => {
        form.reset();
        feedbackModal.hide();
      })
      .catch((error) => {
        console.error('Error:', error);
      });
  }

  showWelcomeContent() {
    let recentProjectsContent = '';
    let currentProjectContent = '';
    const projectController = chatController.agent.projectController;
    const recentProjects = projectController.getProjects().slice(0, 10);

    recentProjects.forEach((project) => {
      const projectPath = JSON.stringify(project.path).slice(1, -1);
      recentProjectsContent += `
        <div class="row">
          <div class="col"><a href="#" class="card-link me-3 text-nowrap" onclick="event.preventDefault(); chatController.agent.projectController.openProject('${projectPath}');"><i class="bi bi-folder me-2"></i>${project.name}</a></div>
          <div class="col"><a href="#" class="card-link text-nowrap" onclick="event.preventDefault(); chatController.agent.projectController.showInstructionsModal('${projectPath}');"><i class="bi bi-pencil me-2"></i>Instructions</a></div>
          <div class="col-6 text-truncate text-secondary text-nowrap d-none d-md-block">${projectPath}</div>
        </div>`;
    });

    if (projectController.currentProject) {
      currentProjectContent = `
        <p><span class="me-3">${projectController.currentProject.name}</span><span class="text-truncate text-secondary text-nowrap d-none d-md-inline">${projectController.currentProject.path}</span></p>
      `;
    }

    const welcomeContent = `
      <div class="card mt-5">
        <div class="card-body">
          <h5 class="card-title">Projects</h5>
          <h6 class="card-subtitle mt-4 mb-2 text-body-secondary">Current</h6>
          ${currentProjectContent || '<p class="text-secondary">Please select a project directory to proceed</p>'}
          <h6 class="card-subtitle mt-4 mb-2 text-body-secondary">Open project</h6>
          <a href="#" class="card-link text-decoration-none" onclick="event.preventDefault(); viewController.selectDirectory();"><i class="bi bi-folder-plus me-2"></i>Open</a>
          <h6 class="card-subtitle mt-4 mb-2 text-body-secondary">Recent</h6>
          <div class="container-fluid">
            ${recentProjectsContent || '<p class="text-secondary">No recent projects</p>'}
          </div>
        </div>
      </div>
    `;
    document.getElementById('projectsCard').innerHTML = welcomeContent;
  }
}

module.exports = ViewController;
