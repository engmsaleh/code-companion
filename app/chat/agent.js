const fs = require('graceful-fs');
const path = require('path');
const ProjectController = require('../project_controller');
const { toolDefinitions, previewMessageMapping } = require('../tools/tools');
const { isFileExists, normalizedFilePath } = require('../utils');

class Agent {
  constructor() {
    this.currentWorkingDir = os.homedir();
    this.projectState = {};
    this.projectController = new ProjectController();
    this.userDecision = null;
  }

  async runAgent(apiResponseMessage) {
    if (chatController.stopProcess || !apiResponseMessage) {
      return;
    }

    try {
      const toolCalls = apiResponseMessage.tool_calls;
      if (apiResponseMessage.content) {
        chatController.chat.addFrontendMessage('assistant', apiResponseMessage.content);
      }
      chatController.chat.addBackendMessage('assistant', apiResponseMessage.content, toolCalls);

      if (toolCalls) {
        const { decision, reflectMessage } = await this.runTools(toolCalls);
        this.userDecision = null;

        if (decision !== 'reject') {
          await chatController.process('', false, reflectMessage);
        }
      }
    } catch (error) {
      chatController.handleError(error);
    }
  }

  async runTools(toolCalls) {
    let isUserRejected = false;

    for (const toolCall of toolCalls) {
      const functionName = toolCall.function.name;
      const allowedToExecute = await this.isToolAllowedToExecute(toolCall);
      if (allowedToExecute === false) {
        continue;
      }

      this.showToolCallPreview(toolCall);
      const decision = await this.waitForDecision(functionName);

      if (decision === 'approve') {
        const functionCallResult = await this.callFunction(toolCall);
        if (functionCallResult) {
          chatController.chat.addBackendMessage('tool', functionCallResult, null, functionName, toolCall.id);
        } else {
          viewController.updateLoadingIndicator(false);
        }
      } else if (decision === 'reject') {
        isUserRejected = true;
        chatController.chat.addFrontendMessage('error', 'Action was rejected');
        chatController.chat.addBackendMessage(
          'tool',
          `User rejected tool call: \n ${JSON.stringify(toolCall, null, 2)}`,
          null,
          functionName,
          toolCall.id,
        );
        return { decision: 'reject', reflectMessage: null };
      } else if (decision === 'reflect') {
        return { decision: 'reflect', reflectMessage: toolCall };
      }
    }

    return { decision: 'approve', reflectMessage: null };
  }

  async isToolAllowedToExecute(toolCall) {
    // Don't allow code replacement or writing to files if file is not in chat context
    const toolsToCheck = ['create_or_overwrite_file', 'replace_string_in_file'];
    const toolName = toolCall.function.name;

    if (!toolsToCheck.includes(toolName)) {
      return true;
    }

    const args = this.parseArguments(toolCall.function.arguments);
    const filePath = await normalizedFilePath(args.targetFile);
    const fileExists = await isFileExists(filePath);

    // allow creating file if it doesn't exist
    if (toolName === 'create_or_overwrite_file' && !fileExists) {
      return true;
    }

    // check if file is in chat context
    const chatContextFiles = chatController.chat.chatContextBuilder.taskRelevantFiles;
    const fileInChatContext = chatContextFiles.includes(filePath);

    if (fileInChatContext === false) {
      console.error('Tool rejected', toolCall);
      console.log('taskRelevantFiles', chatController.chat.chatContextBuilder.taskRelevantFiles);
      chatController.chat.chatContextBuilder.taskRelevantFiles.push(filePath);
    }

    return fileInChatContext;
  }

  async waitForDecision(functionName) {
    this.userDecision = null;
    if (
      chatController.settings.approvalRequired &&
      toolDefinitions.find((tool) => tool.name === functionName).approvalRequired
    ) {
      document.getElementById('messageInput').disabled = true;
      document.getElementById('approval_buttons').removeAttribute('hidden');
      return new Promise((resolve) => {
        const checkDecision = setInterval(() => {
          if (this.userDecision !== null) {
            clearInterval(checkDecision);
            document.getElementById('approval_buttons').setAttribute('hidden', true);
            document.getElementById('messageInput').disabled = false;
            document.getElementById('messageInput').focus();
            resolve(this.userDecision);
            this.userDecision = null;
          }
        }, 200);
      });
    } else {
      return Promise.resolve('approve');
    }
  }

  async callFunction(toolCall) {
    viewController.updateLoadingIndicator(true);
    const functionName = toolCall.function.name;
    const args = this.parseArguments(toolCall.function.arguments);
    let result = '';

    try {
      const tool = toolDefinitions.find((tool) => tool.name === functionName);
      if (tool) {
        result = await tool.executeFunction(args);
      } else {
        throw new Error(`Tool with name ${functionName} not found.`);
      }
    } catch (error) {
      console.error(error);
      chatController.chat.addFrontendMessage('error', `Error occurred. ${error.message}`);
      result = `Error: ${error.message}`;
    } finally {
      viewController.updateLoadingIndicator(false);
      return result;
    }
  }

  parseArguments(args) {
    try {
      return JSON.parse(args);
    } catch (error) {
      if (functionCall.name === 'run_shell_command') {
        return {
          command: functionCall.arguments,
        };
      }
      console.error(error);
      throw error;
    }
  }

  showToolCallPreview(toolCall) {
    const functionName = toolCall.function.name;
    const args = this.parseArguments(toolCall.function.arguments);
    const preview = previewMessageMapping(args)[functionName];

    chatController.chat.addFrontendMessage('assistant', `${preview.message}\n${preview.code}`);
  }
}

module.exports = Agent;
