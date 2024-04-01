const ignore = require('ignore');

const {
  PLAN_PROMPT_TEMPLATE,
  TASK_EXECUTION_PROMPT_TEMPLATE,
  FINISH_TASK_PROMPT_TEMPLATE,
} = require('../static/prompts');
const { withErrorHandling, getSystemInfo } = require('../utils');
const { getFilePath } = require('../tools/tools');
const ignorePatterns = require('../static/embeddings_ignore_patterns');

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
    const projetState = await this.projectStateToText();
    const relevantFilesContents = await this.getRelevantFilesContents();

    return {
      role: 'system',
      content: `${projetState}${relevantFilesContents}`,
    };
  }

  async getRelevantFilesContents() {
    const touchedFiles = await this.getListOfTouchedFiles();
    if (touchedFiles.length === 0) {
      return '';
    }

    const fileReadPromises = touchedFiles.map((file) => this.readFile(file));
    const fileContents = await Promise.all(fileReadPromises);

    const fileContentsWithNames = touchedFiles
      .map((file, index) => `Content for "${file}":\n\n${fileContents[index]}`)
      .join('\n\n');

    return fileContentsWithNames
      ? `\n\nExisting files (recently modified by assistant or user):\n\n${fileContentsWithNames}`
      : '';
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

  async getListOfTouchedFiles() {
    const chatFiles = this.backendMessages
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

    const normalizedFilePaths = await Promise.all(chatFiles.map((file) => getFilePath(file)));
    const existingFiles = normalizedFilePaths.filter((file) => fs.existsSync(file)).reverse();

    const editedFiles = chatController.agent.projectController.getRecentModifiedFiles();
    const combinedFiles = [...new Set([...editedFiles, ...existingFiles])].slice(0, 10);

    return combinedFiles;
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
    const dirName = path.basename(await chatController.terminalSession.getCurrentDirectory());

    let projectStateText = '';
    projectStateText += `In case this information is helpfull. You are already located in the '${dirName}' directory (don't navigate to or add '${dirName}' to file path). The full path to this directory is '${chatController.agent.currentWorkingDir}'.`;

    if (chatController.agent.projectController.currentProject) {
      const filesInFolder = await withErrorHandling(this.getFolderStructure.bind(this));
      if (filesInFolder) {
        projectStateText += `\nThe contents of this project directory (excluding files from gitignore): \n${filesInFolder}`;
      }
    }

    return projectStateText;
  }

  async getFolderStructure() {
    const ig = ignore().add(ignorePatterns);
    const rootDir = chatController.agent.currentWorkingDir;

    // Recursive function to list files
    const listFiles = async (dir, allFiles = [], currentPath = '') => {
      const entries = await fs.promises.readdir(dir, { withFileTypes: true });
      for (let entry of entries) {
        const entryPath = path.join(dir, entry.name);
        const relativePath = path.join(currentPath, entry.name);
        if (ig.ignores(relativePath)) continue; // Skip ignored files/dirs

        if (entry.isDirectory()) {
          await listFiles(entryPath, allFiles, relativePath);
        } else {
          allFiles.push(relativePath);
        }
      }
      return allFiles;
    };

    try {
      const allFiles = await listFiles(rootDir);
      if (allFiles.length === 0) {
        // If directory is empty
        return 'The directory is empty.';
      } else if (allFiles.length <= 30) {
        // If 30 or fewer files, list them all
        return allFiles.map((file) => `- ${file}`).join('\n');
      } else {
        // If more than 30 files, only show top-level directories and files
        const topLevelEntries = await fs.promises.readdir(rootDir, { withFileTypes: true });
        const filteredTopLevelEntries = topLevelEntries.filter((entry) => !ig.ignores(entry.name));
        const folderStructure = filteredTopLevelEntries
          .map((entry) => `- ${entry.name}${entry.isDirectory() ? '/' : ''}`)
          .join('\n');
        return folderStructure;
      }
    } catch (error) {
      chatController.chat.addFrontendMessage(
        'error',
        `Error occurred while checking directory structure in ${rootDir}.
       <br>Please change directory where app can read/write files or update permissions for current directory.`,
      );
      return;
    }
  }
}

module.exports = ChatContextBuilder;
