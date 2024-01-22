const path = require('path');
const fs = require('graceful-fs');
const GoogleSearch = require('./google_search');
const { contextualCompress } = require('./contextual_compressor');
const axios = require('axios');
const { Readability } = require('@mozilla/readability');
const { JSDOM } = require('jsdom');

function respondTargetFileNotProvided() {
  return {
    frontendMessage: 'File name was not provided.',
    backendMessage: 'Please provide a target file name in a correct format.',
  };
}

async function createFile({ targetFile, createText }) {
  if (!targetFile) {
    return respondTargetFileNotProvided();
  }

  const filePath = await getFilePath(targetFile);
  if (!fs.existsSync(filePath)) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
  }
  fs.writeFileSync(filePath, createText);
  return {
    frontendMessage: `File ${await openFileLink(filePath)} created successfully`,
    backendMessage: `File '${targetFile}' created successfully`,
  };
}

async function replaceInFile({ targetFile, items }) {
  if (!targetFile) {
    return respondTargetFileNotProvided();
  }

  const filePath = await getFilePath(targetFile);
  let result = {};
  if (!fs.existsSync(filePath)) {
    result = {
      targetFile,
      content: `Update failed. '${targetFile}' (absolute path is '${filePath}') is not a valid file path. Please use a valid file path.`,
    };
    return {
      frontendMessage: `Unable to update file '${targetFile}'. File does not exist!`,
      backendMessage: JSON.stringify(result),
    };
  }

  let content = fs.readFileSync(filePath, 'utf8');
  let error = false;
  let totalMatches = 0;
  let frontendMessage = '';
  const itemResults = [];

  for (const item of items) {
    const { findString, replaceWith, replaceAll } = item;
    const matches = (content.split(findString) || []).length - 1;

    if (matches === 0) {
      error = true;
      itemResults.push({
        item: findString,
        result: "findString is not present in the 'content' field above. Use a different findString strictly present in the file",
      });
    } else {
      totalMatches += matches;
      if (replaceAll) {
        content = content.split(findString).join(replaceWith);
        itemResults.push({
          item: findString,
          result: `${matches} matches replaced`,
        });
      } else {
        content = content.replace(findString, replaceWith);
        itemResults.push({
          item: findString,
          result: 'First match replaced',
        });
      }
    }
  }
  fs.writeFileSync(filePath, content);

  if (error) {
    frontendMessage = `The following content was not found in the file: ${itemResults
      .filter((item) => item.result.includes('not present'))
      .map((item) => `<pre class="hljs mb-3"><code>${item.item}</code></pre>`)
      .join('<br /><br />')}`;
  } else {
    frontendMessage = `File ${await openFileLink(filePath)} updated successfully. ${totalMatches} matches replaced`;
  }

  return {
    frontendMessage,
    backendMessage: JSON.stringify({
      targetFile,
      content,
      itemResults,
    }),
  };
}

async function readFile({ targetFiles }) {
  if (!targetFiles || targetFiles.length === 0) {
    return respondTargetFileNotProvided();
  }

  const result = [];
  const readFiles = [];
  const unreadFiles = [];
  let tokensRead = 0;

  for (let i = 0; i < targetFiles.length; i++) {
    const filePath = await getFilePath(targetFiles[i]);
    if (!fs.existsSync(filePath)) {
      unreadFiles.push(targetFiles[i]);
      result.push({
        targetFile: targetFiles[i],
        content: 'File does not exist',
      });
      continue;
    }
    readFiles.push(filePath);
    const fileContent = fs.readFileSync(filePath, 'utf8');
    tokensRead += chatController.chat.countTokens(fileContent);
    result.push({
      targetFile: targetFiles[i],
      content: fileContent,
    });
  }

  let frontendMessage = '';
  if (readFiles.length > 0) {
    frontendMessage += `Read ${readFiles.length} file(s): ${await Promise.all(readFiles.map(async (filePath) => await openFileLink(filePath))).then((fileLinks) =>
      fileLinks.join(', '),
    )} (total tokens: ${tokensRead})`;
  }
  if (unreadFiles.length > 0) {
    frontendMessage += `<br>Could not read ${unreadFiles.length} file(s): ${unreadFiles.join(', ')}`;
  }
  return {
    frontendMessage,
    backendMessage: JSON.stringify(result),
  };
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
  commandResult = `Command that was executed in terminal: '${command}'\nTerminal command output was:\n'${commandResult}'`;
  viewController.updateLoadingIndicator(false);

  return {
    frontendMessage: '',
    backendMessage: commandResult,
  };
}

async function searchCode({ query, rerank = true, count = 20 }) {
  let results = await chatController.agent.projectController.searchEmbeddings({ query, count, rerank });
  let frontendMessage = '';
  let backendMessage = '';
  let uniqueFiles = [];
  if (results && results.length > 0) {
    const files = results.map((result) => result.filePath);
    uniqueFiles = [...new Set(files)];
    frontendMessage = `Checked ${uniqueFiles.length} files:<br>${await Promise.all(uniqueFiles.map(async (filePath) => await openFileLink(filePath))).then((fileLinks) => fileLinks.join('<br>'))}`;
    backendMessage = JSON.stringify(results);
  }

  return {
    frontendMessage: frontendMessage || 'No results found',
    backendMessage: backendMessage || 'No results found',
    uniqueFiles,
  };
}

async function googleSearch({ queries }) {
  const searchAPI = new GoogleSearch();
  const googleSearchResults = await searchAPI.search(queries);

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
    compressedResult = await contextualCompress(queries[0], [result.content], [{ link: result.link }]);
    if (!firstCompressedResult) firstCompressedResult = compressedResult;

    if (await checkIfAnswersQuery(queries[0], compressedResult)) {
      return {
        frontendMessage: `Checked websites:<br>${results.map((result) => `<a href="${result.link}" class="text-truncate ms-2">${result.link}</a>`).join('<br>')}`,
        backendMessage: JSON.stringify(compressedResult),
      };
    }
  }

  // Return first compressed result if no result meets the condition
  return {
    frontendMessage: `Checked websites:<br>${results.map((result) => `<a href="${result.link}" class="text-truncate ms-2">${result.link}</a>`).join('<br>')}`,
    backendMessage: JSON.stringify(firstCompressedResult),
  };
}

async function getFilePath(targetFile) {
  targetFile = path.normalize(targetFile);
  if (path.isAbsolute(targetFile)) {
    return targetFile;
  }
  await chatController.terminalSession.getCurrentDirectory();
  return path.join(chatController.agent.currentWorkingDir, targetFile);
}

async function openFileLink(filepath) {
  try {
    let absolutePath = path.normalize(filepath);

    if (!path.isAbsolute(absolutePath)) {
      if (chatController.agent.projectController.currentProject) {
        absolutePath = path.join(chatController.agent.projectController.currentProject.path, absolutePath);
      } else {
        absolutePath = await getFilePath(absolutePath);
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
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537',
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
  const format = true;
  const prompt = `
I am searching web for this query: '${query}'
Search result is:

${JSON.stringify(searchResult)}

Does this result answer search query question?`;
  const result = await chatController.backgroundTask.run({ prompt, format });

  return result !== false;
}

module.exports = {
  createFile,
  replaceInFile,
  readFile,
  shell,
  searchCode,
  googleSearch,
  searchURL,
};
