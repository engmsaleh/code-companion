class SmartContext {
  constructor() {
    this.chat = null;
    this.lastShortenedAssistantMessageId = 0;
  }

  async updateContext(chat) {
    this.chat = chat;
    if (this.chat.backendMessages.length < 7) {
      return;
    }
    this.reduceContextPerFileGroup();
    this.reduceContextOfShellCommands();
    this.reduceCodeSearchResults();
    this.reduceGoogleSearchResults();
  }

  reduceCodeSearchResults() {
    const searchMessages = this.chat.backendMessages.slice(0, -5).filter((message) => message.role === 'function' && message.name === 'search_code');
    searchMessages.forEach((message) => {
      try {
        let content = JSON.parse(message.content);
        content.pop();
        message.content = JSON.stringify(content);
      } catch (e) {
        // do nothing, not so important
      }
    });
  }

  reduceGoogleSearchResults() {
    const searchMessages = this.chat.backendMessages.slice(0, -5).filter((message) => message.role === 'function' && (message.name === 'search_google' || message.name === 'search_url'));
    searchMessages.forEach((message) => {
      message.content = '-';
    });
  }

  reduceContextOfShellCommands() {
    const shellCommands = this.chat.backendMessages.filter((message) => message.role === 'assistant' && message.function_call && message.function_call.name === 'run_shell_command').slice(0, -5);
    shellCommands.forEach((message, index) => {
      const nextMessageIndex = this.getNextMessageIndex(message.id);
      if (nextMessageIndex > -1 && this.chat.backendMessages[nextMessageIndex].role === 'function') {
        this.reduceFunctionResponseMessage(nextMessageIndex, message.function_call.arguments);
      }
    });
  }

  reduceContextPerFileGroup() {
    const fileGroups = this.getFileGroups();
    for (const file in fileGroups) {
      const groupIdArray = fileGroups[file];

      groupIdArray.forEach((id, index) => {
        const nextMessageIndex = this.getNextMessageIndex(id);
        if (index < groupIdArray.length - 1 && nextMessageIndex > -1 && this.chat.backendMessages[nextMessageIndex].role === 'function') {
          if (isDevelopment) {
            console.log(`reduceContextPerFileGroup: Dropping file ${file} from context.` + JSON.stringify(fileGroups));
          }
          this.setMessageFunctionArgumentsToBlank(id);
          this.reduceFunctionResponseMessage(this.getNextMessageIndex(id), file);
        }
      });
    }
  }

  reduceFunctionResponseMessage(nextMessageIndex, targetFile) {
    if (this.chat.backendMessages[nextMessageIndex].name === 'read_files') {
      const parsedContent = JSON.parse(this.chat.backendMessages[nextMessageIndex].content);
      const filteredContent = parsedContent.filter((content) => content.targetFile !== targetFile);
      if (filteredContent.length > 0) {
        this.chat.backendMessages[nextMessageIndex].content = JSON.stringify(filteredContent);
        return;
      }
    }

    this.chat.backendMessages.splice(nextMessageIndex, 1);
  }

  setMessageFunctionArgumentsToBlank(id) {
    const message = this.getMessageById(id);
    message.function_call.arguments = '-';

    const messageIndex = this.chat.backendMessages.findIndex((m) => m.id === message.id);
    if (messageIndex > -1) {
      this.chat.backendMessages[messageIndex] = message;
    }
  }

  getMessageById(id) {
    return this.chat.backendMessages.find((message) => message.id === id);
  }

  getNextMessageIndex(id) {
    const currentMessageIndex = this.chat.backendMessages.findIndex((message) => message.id === id);
    return currentMessageIndex + 1;
  }

  getFileGroups() {
    const fileGroups = {};
    this.chat.backendMessages.forEach((message) => {
      if (
        message.role === 'assistant' &&
        message.function_call &&
        ['create_or_overwrite_file', 'replace_string_in_file', 'read_files'].includes(message.function_call.name) &&
        message.function_call.arguments !== '-'
      ) {
        const { targetFile, targetFiles } = JSON.parse(message.function_call.arguments);
        const targetFilesArray = [targetFile, ...(targetFiles || [])].filter(Boolean);
        targetFilesArray.forEach((targetFile) => {
          if (!fileGroups[targetFile]) {
            fileGroups[targetFile] = [];
          }
          fileGroups[targetFile].push(message.id);
        });
      }
    });
    return fileGroups;
  }
}

module.exports = SmartContext;
