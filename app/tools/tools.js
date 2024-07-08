const path = require('path');
const fs = require('graceful-fs');
const GoogleSearch = require('./google_search');
const { contextualCompress } = require('./contextual_compressor');
const axios = require('axios');
const { Readability } = require('@mozilla/readability');
const { JSDOM } = require('jsdom');
const { normalizedFilePath } = require('../utils');

const toolDefinitions = [
  {
    name: 'create_or_overwrite_file',
    description: 'Create or overwrite a file with new content',
    parameters: {
      type: 'object',
      properties: {
        targetFile: {
          type: 'string',
          description: 'File path',
        },
        createText: {
          type: 'string',
          description: `Output the entire completed source code for a file in a single step. Always use correct indentation and new lines.`,
        },
      },
    },
    executeFunction: createFile,
    enabled: true,
    approvalRequired: true,
  },
  {
    name: 'replace_code',
    description: 'Replace a portion of a file with new content using line numbers.',
    parameters: {
      type: 'object',
      properties: {
        targetFile: {
          type: 'string',
          description: 'Path to the file to be modified.',
        },
        startLineNumber: {
          type: 'integer',
          description: 'The line number where the replacement should start (inclusive).',
        },
        endLineNumber: {
          type: 'integer',
          description: 'The line number where the replacement should end (inclusive).',
        },
        replaceWith: {
          type: 'string',
          description:
            'New content to replace the specified lines. Ensure correct indentation for each new line of code inserted.',
        },
      },
      required: ['targetFile', 'startLineNumber', 'endLineNumber', 'replaceWith'],
    },
    executeFunction: replaceInFile,
    enabled: true,
    approvalRequired: true,
  },
  {
    name: 'read_file',
    description: 'Read file',
    parameters: {
      type: 'object',
      properties: {
        targetFile: {
          type: 'string',
        },
      },
    },
    executeFunction: readFile,
    enabled: true,
    approvalRequired: false,
  },
  {
    name: 'run_shell_command',
    description: 'Run shell command',
    parameters: {
      type: 'object',
      properties: {
        command: {
          type: 'string',
        },
      },
    },
    executeFunction: shell,
    enabled: true,
    approvalRequired: true,
  },
  {
    name: 'search',
    description: 'Semantic search that can perform codebase search or Google search',
    parameters: {
      type: 'object',
      properties: {
        type: {
          type: 'string',
          enum: ['codebase', 'google'],
          description:
            'Type of search to perform. Use codebase to search existing code in project with many files. Use Google only to find latest information or when asked by user. Do not use Google to search for best practices, code examples, libraries, etc.',
        },
        query: {
          type: 'string',
          description: `Long, descriptive natural language search query`,
        },
      },
    },
    executeFunction: unifiedSearch,
    enabled: true,
    requiresApproval: false,
  },
  {
    name: 'task_planning_done',
    description: 'Indicate that task planning is done and ready to start implementation',
    parameters: {
      type: 'object',
      properties: {},
    },
    executeFunction: taskPlanningDone,
    enabled: false,
    requiresApproval: false,
  },
];

async function previewMessageMapping(functionName, args) {
  let codeToReplace = '';
  if (functionName === 'replace_code') {
    codeToReplace = await getCodeToReplace(args);
  }

  const mapping = {
    create_or_overwrite_file: {
      message: `Creating a file ${args.targetFile}`,
      code: `\`\`\`\n${args.createText}\n\`\`\``,
    },
    read_file: {
      message: `Reading a file ${args.targetFile ? args.targetFile : 'No files specified'}`,
      code: '',
    },
    replace_code: {
      message: `Updating ${args.targetFile}\n\n`,
      code: `Replacing code:\n\`\`\`\n${codeToReplace}\n\`\`\`\n\nWith:\n\`\`\`\n${args.replaceWith}\n\`\`\``,
    },
    run_shell_command: {
      message: 'Executing shell command:',
      code: `\n\n\`\`\`console\n${args.command}\n\`\`\``,
    },
    search: {
      message: `Searching ${args.type} for '${args.query}'`,
      code: '',
    },
    task_planning_done: {
      message: 'Task planning is done.',
      code: '',
    },
  };
  return mapping[functionName];
}

function taskPlanningDone() {
  chatController.chat.chatContextBuilder.taskNeedsPlan = false;
  return 'Task planning is done.';
}

async function createFile({ targetFile, createText }) {
  if (!targetFile) {
    return respondTargetFileNotProvided();
  }

  const filePath = await normalizedFilePath(targetFile);
  if (!fs.existsSync(filePath)) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
  }
  fs.writeFileSync(filePath, createText);
  chatController.chat.addFrontendMessage('function', `File ${await openFileLink(filePath)} created successfully`);

  return `File '${targetFile}' created successfully`;
}

async function replaceInFile({ targetFile, startLineNumber, endLineNumber, replaceWith }) {
  if (!targetFile) {
    return respondTargetFileNotProvided();
  }

  const filePath = await normalizedFilePath(targetFile);
  if (!fs.existsSync(filePath)) {
    const doesntExistMessage = `File with filepath '${targetFile}' does not exist`;
    chatController.chat.addFrontendMessage('function', doesntExistMessage);
    return doesntExistMessage;
  }

  let content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');

  if (startLineNumber < 1 || endLineNumber > lines.length || startLineNumber > endLineNumber) {
    const invalidRangeMessage = `Invalid line range: ${startLineNumber}-${endLineNumber}`;
    chatController.chat.addFrontendMessage('function', invalidRangeMessage);
    return invalidRangeMessage;
  }

  const beforeLines = lines.slice(0, startLineNumber - 1);
  const afterLines = lines.slice(endLineNumber);
  const newContent = [...beforeLines, replaceWith, ...afterLines].join('\n');

  fs.writeFileSync(filePath, newContent);

  const successMessage = `File ${await openFileLink(filePath)} updated successfully.`;
  chatController.chat.addFrontendMessage('function', successMessage);

  return `File ${filePath} updated successfully.`;
}

async function getCodeToReplace({ targetFile, startLineNumber, endLineNumber }) {
  const filePath = await normalizedFilePath(targetFile);
  if (!fs.existsSync(filePath)) {
    const doesntExistMessage = `File with filepath '${targetFile}' does not exist`;
    chatController.chat.addFrontendMessage('function', doesntExistMessage);
    return doesntExistMessage;
  }
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');
  return lines.slice(startLineNumber - 1, endLineNumber).join('\n');
}

async function readFile({ targetFile }) {
  if (!targetFile) {
    return respondTargetFileNotProvided();
  }

  const filePath = await normalizedFilePath(targetFile);
  if (!fs.existsSync(filePath)) {
    const doesntExistMessage = `File with filepath '${targetFile}' does not exist`;
    chatController.chat.addFrontendMessage('function', doesntExistMessage);
    return doesntExistMessage;
  }

  chatController.chat.addFrontendMessage('function', `Read ${await openFileLink(filePath)} file`);

  return `File "${filePath}" was read.`;
}

async function shell({ command }) {
  viewController.updateLoadingIndicator(true, 'Executing shell command ...  (click Stop to cancel or use Ctrl+C)');
  let commandResult = await chatController.terminalSession.executeShellCommand(command);
  // Preserve first 5 lines and last 95 lines if more than 100 lines
  const lines = commandResult.split('\n');
  if (lines.length > 100) {
    const firstFive = lines.slice(0, 5);
    const lastNinetyFive = lines.slice(-95);
    commandResult = [...firstFive, '(some command output omitted)...', ...lastNinetyFive].join('\n');
  }
  if (commandResult.length > 5000) {
    commandResult = commandResult.substring(commandResult.length - 5000);
    commandResult = `(some command output omitted)...\n${commandResult}`;
  }
  commandResult = commandResult.replace(command, '');
  commandResult = `Command executed: '${command}'\nOutput:\n'${commandResult ? commandResult : 'command executed successfully. Terminal command output was empty.'}'`;
  viewController.updateLoadingIndicator(false);

  return commandResult;
}

async function searchCode({ query, rerank = true, count = 10 }) {
  let frontendMessage = '';
  let backendMessage = '';
  let uniqueFiles = [];

  let results = await chatController.agent.projectController.searchEmbeddings({ query, count, rerank });

  if (results && results.length > 0) {
    const files = results.map((result) => result.filePath);
    uniqueFiles = [...new Set(files)];
    frontendMessage = `Checked ${uniqueFiles.length} files:<br>${await Promise.all(uniqueFiles.map(async (filePath) => await openFileLink(filePath))).then((fileLinks) => fileLinks.join('<br>'))}`;
    backendMessage = JSON.stringify(results);
    chatController.chat.addFrontendMessage('function', frontendMessage);
    return backendMessage;
  }

  const noResultsMessage = `No results found`;
  chatController.chat.addFrontendMessage('function', noResultsMessage);
  return noResultsMessage;
}

async function googleSearch({ query }) {
  const searchAPI = new GoogleSearch();
  const googleSearchResults = await searchAPI.singleSearch(query);

  const promises = googleSearchResults.map(async (result) => {
    const content = await fetchAndParseUrl(result.link);
    if (content) {
      result.content = JSON.stringify(content);
    }
    return result;
  });
  let results = await Promise.all(promises);
  results = results.filter((result) => result.content);
  let compressedResult;
  let firstCompressedResult;

  for (const result of results) {
    compressedResult = await contextualCompress(query, [result.content], [{ link: result.link }]);
    if (!firstCompressedResult) firstCompressedResult = compressedResult;

    // return first result if it meets the condition
    if (await checkIfAnswersQuery(query, compressedResult)) {
      chatController.chat.addFrontendMessage(
        'function',
        `Checked websites:<br>${results.map((result) => `<a href="${result.link}" class="text-truncate ms-2">${result.link}</a>`).join('<br>')}`,
      );
      return JSON.stringify(compressedResult);
    }
  }

  // Return first compressed result if no result meets the condition
  chatController.chat.addFrontendMessage(
    'function',
    `Checked websites:<br>${results.map((result) => `<a href="${result.link}" class="text-truncate ms-2">${result.link}</a>`).join('<br>')}`,
  );
  return JSON.stringify(firstCompressedResult);
}

async function openFileLink(filepath) {
  try {
    let absolutePath = path.normalize(filepath);

    if (!path.isAbsolute(absolutePath)) {
      if (chatController.agent.projectController.currentProject) {
        absolutePath = path.join(chatController.agent.projectController.currentProject.path, absolutePath);
      } else {
        absolutePath = await normalizedFilePath(absolutePath);
      }
    }

    let filename;
    if (chatController.agent.projectController.currentProject) {
      filename = path.relative(chatController.agent.projectController.currentProject.path, absolutePath);
    } else {
      filename = path.relative(chatController.agent.currentWorkingDir, absolutePath);
    }

    return `<a href="#" onclick="event.preventDefault(); viewController.openFileInIDE('${absolutePath}')">${filename}</a>`;
  } catch (error) {
    console.error(error);
    return filepath;
  }
}

async function fetchAndParseUrl(url) {
  try {
    const response = await axios.get(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537',
      },
      timeout: 5000,
    });
    const html = response.data;
    const doc = new JSDOM(html, { url: url }).window.document;
    const reader = new Readability(doc);
    const article = reader.parse();
    return article.textContent;
  } catch (error) {
    return;
  }
}

async function searchURL({ query, url }) {
  const content = await fetchAndParseUrl(url);
  if (!content) {
    return {
      frontendMessage: `Could not fetch content from ${url}`,
      backendMessage: `Could not fetch content from ${url}`,
    };
  }
  const compressedResult = await contextualCompress(query, [content], [{ link: url }]);
  return {
    frontendMessage: `Checked website:<br><a href="${url}" class="text-truncate ms-2">${url}</a>`,
    backendMessage: JSON.stringify(compressedResult),
  };
}

async function checkIfAnswersQuery(query, searchResult) {
  const format = {
    type: 'boolean',
    result: 'true or false',
  };
  const prompt = `
I am searching web for this query: '${query}'
Search result is:

${JSON.stringify(searchResult)}

Does this result answer search query question?
Respond with boolean value:  "true" or "false"`;
  const result = await chatController.backgroundTask.run({ prompt, format });

  return result !== false;
}

async function unifiedSearch({ type, query }) {
  switch (type) {
    case 'codebase':
      const codebaseResult = await searchCode({ query });
      return `Codebase search result for "${query}":\n${codebaseResult}`;
    case 'google':
      const result = await googleSearch({ query });
      return `Google search result for "${query}":\n${result}`;
    default:
      return 'Invalid search type specified.';
  }
}

function respondTargetFileNotProvided() {
  chatController.chat.addFrontendMessage('function', 'File name was not provided.');

  return 'Please provide a target file name in a correct format.';
}

function getEnabledTools(filterFn) {
  return toolDefinitions
    .filter(filterFn)
    .map(({ name, description, parameters }) => ({ name, description, parameters }));
}

function allEnabledTools() {
  return getEnabledTools((tool) => tool.enabled);
}

function planningTools() {
  const tools = getEnabledTools((tool) => tool.enabled && !tool.approvalRequired);
  const taskPlanningDoneTool = toolDefinitions.find((tool) => tool.name === 'task_planning_done');
  tools.push({
    name: taskPlanningDoneTool.name,
    description: taskPlanningDoneTool.description,
    parameters: taskPlanningDoneTool.parameters,
  });

  return tools;
}

module.exports = {
  allEnabledTools,
  planningTools,
  toolDefinitions,
  previewMessageMapping,
  getCodeToReplace,
};
