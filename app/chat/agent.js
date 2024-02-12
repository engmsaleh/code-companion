const fs = require('graceful-fs');
const path = require('path');
const ProjectController = require('../project_controller');
const { toolDefinitions, previewMessageMapping } = require('../tools/tools');

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
        const userRejected = await this.runTools(toolCalls);
        if (!userRejected) {
          await chatController.process('', false);
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
      this.showToolCallPreview(toolCall);
      const decision = await this.waitForDecision(functionName);

      if (decision) {
        const functionCallResult = await this.callFunction(toolCall);
        if (functionCallResult) {
          chatController.chat.addBackendMessage('tool', functionCallResult, null, functionName, toolCall.id);
        } else {
          viewController.updateLoadingIndicator(false);
        }
      } else {
        isUserRejected = true;
        chatController.chat.addFrontendMessage('error', 'Action was rejected');
        chatController.chat.addBackendMessage(
          'tool',
          'User rejected this function call',
          null,
          functionName,
          toolCall.id,
        );
      }
      this.userDecision = null;
    }

    return isUserRejected;
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
      return Promise.resolve(true);
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
