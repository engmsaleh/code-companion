class Browser {
  constructor() {
    this.currentUrl = '';
    this.webview = document.querySelector('webview');
    this.urlInput = document.getElementById('urlInput');
    this.initEventListeners();
  }

  initEventListeners() {
    this.urlInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        this.loadUrl(this.urlInput.value);
      }
    });

    this.webview.addEventListener('did-fail-load', (event) => {
      this.handleLoadError(event);
    });

    this.webview.addEventListener('did-start-loading', () => {
      document.getElementById('browserIcon').innerHTML =
        '<span class="spinner-border spinner-border-sm text-secondary me-2" role="status" aria-hidden="true"></span>';
    });

    this.webview.addEventListener('did-stop-loading', () => {
      this.updateUrlInput();
      document.getElementById('browserIcon').innerHTML = '<i class="bi bi-globe me-2"></i>';
    });

    this.webview.addEventListener('did-fail-load', (event) => {
      if (event.errorCode !== -3) {
        // Ignore harmless errors
        document.getElementById('browserIcon').innerHTML = '<i class="bi bi-exclamation-triangle text-warning"></i>';
      }
    });
  }

  updateUrlInput() {
    const url = this.getCurrentUrl();
    if (url !== 'about:blank') {
      this.currentUrl = url;
      this.urlInput.value = url;
    }
  }

  goBack() {
    this.webview.goBack();
  }

  goForward() {
    this.webview.goForward();
  }

  reload() {
    this.webview.reload();
  }

  getCurrentUrl() {
    return this.webview.getURL();
  }

  loadUrl(url, errorCallback = null) {
    if (!url.startsWith('http') && !url.startsWith('file') && !url.startsWith('about') && !url.startsWith('chrome')) {
      url = 'http://' + url;
    }
    this.webview.src = url;
    this.urlInput.value = url;
    this.currentUrl = url;
    this.handleLoadErrors(errorCallback);
  }

  handleLoadErrors(errorCallback) {
    let errors = [];
    const errorListener = (event) => {
      if (event.level === 2) {
        errors.push(event.message);
      }
    };
    this.webview.addEventListener('console-message', errorListener);
    this.webview.addEventListener(
      'did-stop-loading',
      () => {
        this.webview.removeEventListener('console-message', errorListener);
        this.indicateConsoleError(errors);
        if (errorCallback) {
          errorCallback(errors);
        }
      },
      { once: true },
    );
  }

  handleLoadError(event) {
    const { errorCode, errorDescription, validatedURL } = event;
    if (errorCode === -3) return;

    let userFriendlyMessage;
    switch (errorCode) {
      case -102:
        userFriendlyMessage = 'Connection refused. The server may be down or unreachable.';
        break;
      case -105:
        userFriendlyMessage = "Unable to resolve the server's DNS address.";
        break;
      case -106:
        userFriendlyMessage = 'Internet connection is offline.';
        break;
      case -501:
        userFriendlyMessage = "Insecure connection. The website's security certificate is not trusted.";
        break;
      default:
        userFriendlyMessage = `Failed to load the page: ${errorDescription}`;
    }
    this.showError(userFriendlyMessage);
  }

  showError(message) {
    document.getElementById('browserErrorMessage').innerHTML = message;
    const toast = new bootstrap.Toast(document.getElementById('browserToast'));
    toast.show();
  }

  indicateConsoleError(errors) {
    if (errors.length > 0) {
      document.getElementById('browserDevToolsIcon').innerHTML = `<i class="bi bi-bug text-danger ms-2"></i>`;
    } else {
      document.getElementById('browserDevToolsIcon').innerHTML = '<i class="bi bi-bug ms-2"></i>';
    }
  }

  openDevTools() {
    this.webview.openDevTools();
  }

  async handleSreenshot() {
    if (!this.currentUrl) {
      this.showError('No URL loaded to capture screenshot');
      return;
    }

    const base64Image = await this.getScreenshot();
    if (!base64Image) {
      this.showError('Failed to capture screenshot');
      return;
    }

    const content = [
      {
        type: 'text',
        text: `Attaching browser screenshot for ${this.currentUrl}`,
      },
      {
        type: 'image_url',
        image_url: {
          url: base64Image,
          media_type: 'image/png',
        },
      },
    ];

    chatController.chat.addBackendMessage('user', content);
    chatController.chat.addFrontendMessage(
      'file',
      `<div class="d-flex justify-content-center"><img src="${base64Image}" class="img-fluid m-3" alt="image preview" style="max-height: 250px;"></div>`,
    );
  }

  async getScreenshot() {
    if (!this.currentUrl) {
      return null;
    }

    try {
      const nativeImage = await this.webview.capturePage();
      const base64Image = nativeImage.toPNG().toString('base64');
      return `data:image/png;base64,${base64Image}`;
    } catch (error) {
      console.error('Error capturing screenshot:', error);
      return null;
    }
  }
}

module.exports = Browser;
