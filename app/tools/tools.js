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
    name: 'replace_string_in_file',
    description: 'Replace a string with another string, the rest of the file content will remain the same.',
    parameters: {
      type: 'object',
      properties: {
        targetFile: {
          type: 'string',
        },
        findString: {
          type: 'string',
          description:
            'String or entire code block that exists exactly in the content of the file and need to be replaced. Do not use regex. Must include all leading spaces and match exaclty.',
        },
        replaceWith: {
          type: 'string',
          description:
            'New string that will replace findString. Calculate then insert correct identation for each new line of code insterted.',
        },
        replaceAll: {
          type: 'boolean',
          description:
            'Indicates if all occurrences of findString should be replaced in the file or one, use "true" - to replace all, false - to replace a single occurrence (more preferred).',
        },
      },
      required: ['targetFile', 'findString', 'replaceWith', 'replaceAll'],
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
    description: 'Semantic search that can perform codebase search or google search',
    parameters: {
      type: 'object',
      properties: {
        type: {
          type: 'string',
          enum: ['codebase', 'google'],
          description: 'Type of search to perform',
        },
        query: {
          type: 'string',
          description: `Descriptive natural language search query`,
        },
      },
    },
    executeFunction: unifiedSearch,
    enabled: true,
    requiresApproval: false,
  },
];

const previewMessageMapping = (args) => ({
  create_or_overwrite_file: {
    message: `Creating a file ${args.targetFile}`,
    code: `\`\`\`\n${args.createText}\n\`\`\``,
  },
  read_file: {
    message: `Reading a file ${args.targetFile ? args.targetFile : 'No files specified'}`,
    code: '',
  },
  replace_string_in_file: {
    message: `Updating ${args.targetFile}\n\n`,
    code: `Replacing:\n\`\`\`\n${args.findString}\n\`\`\`` + `\n\nWith:\n\`\`\`\n${args.replaceWith}\n\`\`\``,
  },
  run_shell_command: {
    message: 'Executing shell command:',
    code: `\n\n\`\`\`console\n${args.command}\n\`\`\``,
  },
  search: {
    message: `Searching ${args.type} for '${args.query}'`,
    code: '',
  },
});

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

async function replaceInFile({ targetFile, findString, replaceWith, replaceAll }) {
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
  const matches = (content.split(findString) || []).length - 1;
  if (matches === 0) {
    const findStringNotPresentMessage = `This string '${findString}' is not present in the file`;
    chatController.chat.addFrontendMessage('function', findStringNotPresentMessage);

    return findStringNotPresentMessage;
  }

  if (replaceAll) {
    const find = new RegExp(escapeRegExp(findString), 'g');
    content = content.replace(find, replaceWith);
  } else {
    content = content.replace(findString, replaceWith);
  }
  fs.writeFileSync(filePath, content);

  const successMessage = `File ${await openFileLink(filePath)} updated successfully.`;
  chatController.chat.addFrontendMessage('function', successMessage);

  return `File ${filePath} updated successfully.`;
}

function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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
  // get last 20 lines of the terminal output to reduce token usage
  const lines = commandResult.split('\n');
  if (lines.length > 100 || commandResult.length > 5000) {
    commandResult = lines.slice(-100).join('\n');
    commandResult = commandResult.substring(commandResult.length - 5000);
    commandResult = `(some command output ommitted)...\n${commandResult}`;
  }
  commandResult = commandResult.replace(command, '');
  commandResult = `Command executed: '${command}'\nOutput:\n'${commandResult ? commandResult : 'Done.'}'`;
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
  const format = false;
  const prompt = `
I am searching web for this query: '${query}'
Search result is:

${JSON.stringify(searchResult)}

Does this result answer search query question?
Respond with boolean value:  "true" or "false"`;
  const result = await chatController.backgroundTask.run({
    prompt,
    format,
    // model: chatController.settings.selectedModel,
  });

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

function formattedTools() {
  const enabledTools = toolDefinitions.filter((tool) => tool.enabled);

  return enabledTools.map(({ name, description, parameters }) => ({
    name,
    description,
    parameters,
  }));
}

module.exports = {
  toolDefinitions,
  formattedTools,
  previewMessageMapping,
};
