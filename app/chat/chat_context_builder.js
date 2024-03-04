const {
  PLAN_PROMPT_TEMPLATE,
  TASK_EXECUTION_PROMPT_TEMPLATE,
  FINISH_TASK_PROMPT_TEMPLATE,
} = require('../static/prompts');
const { withErrorHandling, getSystemInfo } = require('../utils');
const { getFilePath } = require('../tools/tools');

const MAX_SUMMARY_TOKENS = 2000;

class ChatContextBuilder {
  constructor(chat) {
    this.chat = chat;
    this.lastSummarizedMessageID = -1;
    this.pastSummarizedMessages = '';
  }

  async buildMessages(userMessage) {
    this.backendMessages = this.chat.backendMessages.map((message) => _.omit(message, ['id']));

    return [
      await this.addSystemMessage(),
      this.addTaskMessage(),
      await this.addSummaryOfMessages(),
      await this.addRelevantSourceCodeMessage(),
      this.addLastUserMessage(userMessage),
    ].filter((message) => message !== null);
  }

  async addSystemMessage() {
    let systemMessage;

    if (this.chat.isEmpty() && (await this.isTaskNeedsPlan())) {
      systemMessage = PLAN_PROMPT_TEMPLATE;
    } else {
      systemMessage = TASK_EXECUTION_PROMPT_TEMPLATE;
    }

    if (this.chat.backendMessages.length > 7) {
      systemMessage += `\n\n${FINISH_TASK_PROMPT_TEMPLATE}`;
    }

    systemMessage += this.addProjectCustomInstructionsMessage();
    systemMessage = this.fromTemplate(systemMessage, '{osName}', getSystemInfo());
    systemMessage = this.fromTemplate(systemMessage, '{shellType}', chatController.terminalSession.shellType);

    return {
      role: 'system',
      content: systemMessage,
    };
  }

  async isTaskNeedsPlan() {
    const prompt = `
    Task:
    "${this.chat.task}"\n
    Is this user task will need to be brainstormed and planned before execution? Respond false, if this is a simple task that involves only a few commands or one file manipulation.
    Respond with boolean value:  "true" or "false"`;

    const result = await chatController.backgroundTask.run({
      prompt,
      format: false,
      model: chatController.settings.selectedModel,
    });

    return result;
  }

  addTaskMessage() {
    return {
      role: 'user',
      content: `Task:\n\n${this.chat.task}`,
    };
  }

  addProjectCustomInstructionsMessage() {
    const projectCustomInstructions = chatController.agent.projectController.getCustomInstructions();
    if (!projectCustomInstructions) {
      return '';
    } else {
      return `\n\n${projectCustomInstructions}`;
    }
  }

  async addSummaryOfMessages() {
    let allMessages = '';
    const nonEmptyMessages = this.chat.backendMessages.filter((message) => message.content);
    const messagesToSummarize = nonEmptyMessages.slice(0, -1);
    const notSummarizedMessages = messagesToSummarize
      .filter((message) => message.id > this.lastSummarizedMessageID)
      .reduce((acc, message) => {
        if (message.content) {
          let content = message.content;
          if (message.role == 'tool' && message.name == 'read_file') {
            content = `File read successfully.`;
          }
          acc += `\n${message.role == 'tool' ? '"assistant" ran a tool' : message.role}:\n${content}\n`;
        }
        return acc;
      }, '')
      .trim();

    allMessages = this.pastSummarizedMessages + notSummarizedMessages;

    if (this.chat.countTokens(allMessages) > MAX_SUMMARY_TOKENS) {
      this.pastSummarizedMessages = await this.summarizeMessages(allMessages);
      // Update last summarized message ID to the second last message if messages were summarized
      this.lastSummarizedMessageID =
        messagesToSummarize.length > 0
          ? messagesToSummarize[messagesToSummarize.length - 1].id
          : this.lastSummarizedMessageID;
      allMessages = this.pastSummarizedMessages;
    }

    const lastMessage = nonEmptyMessages[nonEmptyMessages.length - 1];
    if (lastMessage && lastMessage.id > this.lastSummarizedMessageID) {
      let lastMessageContent = lastMessage.content;
      if (lastMessage.role == 'tool' && lastMessage.name == 'read_file') {
        lastMessageContent = `File read successfully.`;
      }
      allMessages +=
        `\n${lastMessage.role == 'tool' ? '"assistant" ran a tool' : lastMessage.role}:\n${lastMessageContent}\n`.trim();
    }

    return allMessages
      ? {
          role: 'system',
          content: `Summary of conversation and what was done:\n\n ${allMessages}`,
        }
      : null;
  }

  async summarizeMessages(messages) {
    console.log('Summarizing messages:', messages);
    console.log(this.lastSummarizedMessageID);
    const prompt = `
    Task:
    ${this.chat.task}
    Messages:
    ${messages}\n
    Compress the messages above. Preserve the meaning, file names, results, order of actions, what was done and what is left.
    Also preserve any important information or code snippets.
    Leave user's messages and plan as is word for word. 
    `;
    const summary = await chatController.backgroundTask.run({
      prompt,
      format: 'text',
      model: chatController.settings.selectedModel,
    });

    if (summary) {
      console.log('Summary:', summary);
      return summary;
    } else {
      return messages;
    }
  }

  async addRelevantSourceCodeMessage() {
    const touchedFiles = this.getListOfTouchedFiles();
    console.log('touchedFiles:', touchedFiles);

    if (touchedFiles.length === 0) {
      return null;
    }

    const normalizedFilePaths = await Promise.all(touchedFiles.map((file) => getFilePath(file)));
    const existingFiles = normalizedFilePaths.filter((file) => fs.existsSync(file));

    if (existingFiles.length === 0) {
      return null;
    }

    const fileReadPromises = existingFiles.map((file) => this.readFile(file));
    const fileContents = await Promise.all(fileReadPromises);

    const projetState = await this.projectStateToText();
    const fileContentsWithNames = existingFiles
      .map((file, index) => `Content for "${file}":\n\n${fileContents[index]}`)
      .join('\n\n');

    return {
      role: 'system',
      content: `${projetState}\n\nCurrent file's content:\n${fileContentsWithNames}`,
    };
  }

  async readFile(filePath) {
    try {
      const content = await fs.promises.readFile(filePath, 'utf8');
      return content;
    } catch (error) {
      console.error(`Error reading file ${filePath}:`, error);
      return null;
    }
  }

  getListOfTouchedFiles() {
    const files = this.backendMessages
      .filter((message) => message.role === 'assistant' && message.tool_calls)
      .flatMap((message) =>
        message.tool_calls
          .map((toolCall) => {
            try {
              const parsedArguments = JSON.parse(toolCall.function.arguments);
              return parsedArguments.hasOwnProperty('targetFile') ? parsedArguments.targetFile : undefined;
            } catch {
              return undefined;
            }
          })
          .filter((file) => file !== undefined),
      );

    return [...new Set(files)];
  }

  addLastUserMessage(userMessage) {
    if (!userMessage) {
      return null;
    }

    return {
      role: 'user',
      content: userMessage,
    };
  }

  fromTemplate(content, placeholder, value) {
    const regex = new RegExp(placeholder, 'g');
    return content.replace(regex, value);
  }

  async projectStateToText() {
    const filesInFolder = await withErrorHandling(this.getFolderStructure.bind(this));
    const dirName = path.basename(await chatController.terminalSession.getCurrentDirectory());

    let projectStateText = '';
    projectStateText += `In case this information is helpfull. You are already located in the '${dirName}' directory (don't navigate to or add '${dirName}' to file path). The full path to this directory is '${chatController.agent.currentWorkingDir}'.`;
    if (filesInFolder) {
      projectStateText += `\nThe contents of this top-level directory: \n${filesInFolder}`;
    }

    return projectStateText;
  }

  async getFolderStructure() {
    let files = [];
    try {
      files = await fs.promises.readdir(chatController.agent.currentWorkingDir);
    } catch (error) {
      chatController.chat.addFrontendMessage(
        'error',
        `Error occurred while checking directory structure in ${chatController.agent.currentWorkingDir}.
         <br>Please change directory where app can read/write files or update permissions for current directory.`,
      );
      return;
    }

    const folderStructure = [];
    for (const file of files) {
      const stats = await fs.promises.stat(path.join(chatController.agent.currentWorkingDir, file));
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
}

module.exports = ChatContextBuilder;
