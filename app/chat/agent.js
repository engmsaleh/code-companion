const fs = require('graceful-fs');
const path = require('path');
const { withErrorHandling } = require('../utils');
const SmartContext = require('./smart_context');
const ProjectController = require('../project_controller');
const { toolDefinitions, previewMessageMapping } = require('../tools/tools');

class Agent {
  constructor() {
    this.currentWorkingDir = os.homedir();
    this.projectState = {};
    this.smartContext = new SmartContext();
    this.projectController = new ProjectController();
    this.userDecision = null;
  }

  async waitForDecision(functionName) {
    this.userDecision = null;
    if (chatController.settings.approvalRequired && toolDefinitions.find((tool) => tool.name === functionName).approvalRequired) {
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

  async runAgent(apiResponseMessage) {
    if (chatController.stopProcess || !apiResponseMessage) {
      return;
    }

    try {
      this.addResponseToChat(apiResponseMessage);
      if (apiResponseMessage.function_call) {
        const decision = await this.waitForDecision(apiResponseMessage.function_call.name);
        if (decision) {
          const functionCallResult = await this.callFunction(apiResponseMessage.function_call);
          if (functionCallResult) {
            chatController.chat.addBackendMessage('function', functionCallResult, null, apiResponseMessage.function_call.name);
            this.smartContext.updateContext(chatController.chat);
            await chatController.process('', false);
          } else {
            viewController.updateLoadingIndicator(false);
          }
        } else {
          chatController.chat.addFrontendMessage('error', 'Action was rejected');
          chatController.chat.addBackendMessage('user', 'User rejected function call');
        }
        this.userDecision = null;
      }
    } catch (error) {
      chatController.handleError(error);
    }
  }

  async callFunction(functionCall) {
    viewController.updateLoadingIndicator(true);
    const functionName = functionCall.name;
    const args = this.parseArguments(functionCall);
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

  parseArguments(functionCall) {
    try {
      return JSON.parse(functionCall.arguments);
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

  async getFolderStructure() {
    let files = [];
    try {
      files = await fs.promises.readdir(this.currentWorkingDir);
    } catch (error) {
      chatController.chat.addFrontendMessage(
        'error',
        `Error occurred while checking directory structure in ${this.currentWorkingDir}.
         <br>Please change directory where app can read/write files or update permissions for current directory.`,
      );
      return;
    }

    const folderStructure = [];
    for (const file of files) {
      const stats = await fs.promises.stat(path.join(this.currentWorkingDir, file));
      if (stats.isDirectory()) {
        folderStructure.push(`- ${file}/`);
      } else {
        folderStructure.push(`- ${file}`);
      }
    }

    if (folderStructure.length > 30) {
      folderStructure.splice(30);
      return `${folderStructure.join('\n')}\n... and more`;
    }

    if (folderStructure.length == 0) {
      return 'directory is empty';
    }

    return folderStructure.join('\n');
  }

  async updateProjectState() {
    this.projectState.currentWorkingDir = await chatController.terminalSession.getCurrentDirectory();
    const filesInFolder = await withErrorHandling(this.getFolderStructure.bind(this));
    this.projectState.folderStructure = filesInFolder;

    const projectStateText = await this.projectStateToText();
    chatController.chat.deleteMessagesThatStartWith('In case this information is helpfull. You are already located in the ');
    chatController.chat.addProjectStateMessage(projectStateText);
  }

  async projectStateToText() {
    const dirName = path.basename(this.currentWorkingDir);
    let projectStateText = '';
    projectStateText += `In case this information is helpfull. You are already located in the '${dirName}' directory (don't navigate to or add '${dirName}' to file path). The full path to this directory is '${this.currentWorkingDir}'.`;
    if (this.projectState.folderStructure) {
      projectStateText += `\nThe contents of this top-level directory: \n${this.projectState.folderStructure}`;
    }

    projectStateText +=
      '\n\nDo not provide created or updated code and do not include function call name that you will use in the message content, only in the function call arguments. Do not provide instructions how to complete the task to user, instead always call a function yourself. Do not stop until all requirements are completed and everything is fully functional.';
    projectStateText += this.projectController.getCustomInstructions();
    return projectStateText;
  }

  addResponseToChat(apiResponseMessage) {
    const messageContent = apiResponseMessage.content;
    const functionCall = apiResponseMessage.function_call;

    if (messageContent) {
      chatController.chat.addMessage('assistant', messageContent);
    }

    if (functionCall) {
      const args = this.parseArguments(functionCall);
      const preview = previewMessageMapping(args)[functionCall.name];
      chatController.chat.addFrontendMessage('assistant', `${messageContent ? messageContent : preview.message}\n${preview.code}`);
      chatController.chat.addBackendMessage('assistant', messageContent, functionCall);
    }
  }
}

module.exports = Agent;
