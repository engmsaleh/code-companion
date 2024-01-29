const { clipboard } = require('electron');
const { getEncoding } = require('js-tiktoken');
const ChatHistory = require('./chat_history');
const { debounce } = require('lodash');

class Chat {
  constructor() {
    this.frontendMessages = [];
    this.backendMessages = [];
    this.currentId = 1;
    this.lastBackendMessageId = 0;
    this.history = new ChatHistory();
    this.tokenizer = getEncoding('cl100k_base');
  }

  isEmpty() {
    return this.frontendMessages.length === 0;
  }

  getNextId() {
    this.currentId += 1;
    return this.currentId;
  }

  getLastUserMessage() {
    const userMessages = this.frontendMessages.filter((message) => message.role === 'user');
    return userMessages[userMessages.length - 1]?.content;
  }

  addFrontendMessage(role, content) {
    const message = {
      id: this.getNextId(),
      role,
      content,
      backendMessageId: this.lastBackendMessageId,
    };
    this.frontendMessages.push(message);
    this.updateUI();
    return message;
  }

  addBackendMessage(role, content, toolCalls = null, name = null, toolCallId = null) {
    this.lastBackendMessageId = this.getNextId();
    const message = {
      id: this.lastBackendMessageId,
      role,
      content,
    };
    if (toolCalls) {
      message.tool_calls = toolCalls;
    }
    if (name) {
      message.name = name;
    }
    if (toolCallId) {
      message.tool_call_id = toolCallId;
    }
    this.backendMessages.push(message);
    return message;
  }

  addProjectStateMessage(content) {
    const message = {
      id: 1,
      role: 'system',
      content,
    };
    // insert this message right before last assistant or user message
    const insertIndex = this.findLastIndex(this.backendMessages, (msg) => msg.role === 'assistant' || msg.role === 'user');
    this.backendMessages.splice(insertIndex, 0, message);
  }

  findLastIndex(arr, predicate) {
    let index = arr.length;
    while (index--) {
      if (predicate(arr[index])) return index;
    }
    return -1;
  }

  addMessage(role, content) {
    const backendMessage = this.addBackendMessage(role, content);
    this.addFrontendMessage(role, content, backendMessage.id);
  }

  copyFrontendMessage(id) {
    const message = this.frontendMessages.find((msg) => msg.id === id);
    if (message) {
      clipboard.writeText(message.content);
    }
  }

  deleteMessagesThatStartWith(pattern) {
    this.backendMessages = this.backendMessages.filter((msg) => !(typeof msg.content === 'string' && msg.content && msg.content.startsWith(pattern)));
  }

  deleteMessagesAfterId(frontendMessageId) {
    const messageIndex = this.frontendMessages.findIndex((msg) => msg.id === frontendMessageId);
    if (messageIndex !== -1) {
      const { backendMessageId } = this.frontendMessages[messageIndex];
      this.frontendMessages = this.frontendMessages.slice(0, messageIndex);
      const backendMessageIndex = this.backendMessages.findIndex((msg) => msg.id === backendMessageId);
      if (backendMessageIndex !== -1) {
        this.backendMessages = this.backendMessages.slice(0, backendMessageIndex);
      }
      this.updateUI();
    }
  }

  replaceSystemMessagePlaceholder(placeholder, value) {
    if (value) {
      const regex = new RegExp(placeholder, 'g');
      this.backendMessages[0].content = this.backendMessages[0].content.replace(regex, value);
    }
  }

  updateUI() {
    viewController.updateLoadingIndicator(false);
    document.getElementById('streaming_output').innerHTML = '';
    const formattedMessages = this.frontendMessages.map((msg) => viewController.formatResponse(msg)).join('');
    document.getElementById('output').innerHTML = formattedMessages;
    viewController.scrollToBottom();
    viewController.addCopyCodeButtons();
  }

  updateStreamingMessage(message) {
    const formattedMessage = viewController.formatResponse({ role: 'assistant', content: message });
    document.getElementById('streaming_output').innerHTML = formattedMessage;
    viewController.scrollToBottom();
  }

  countTokens(content) {
    return this.tokenizer.encode(JSON.stringify(content) || '').length;
  }
}

module.exports = Chat;
