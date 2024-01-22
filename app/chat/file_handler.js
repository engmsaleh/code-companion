const fileType = require('file-type').fromBuffer;
const readChunkSync = require('read-chunk').sync;
const reader = require('any-text');
const pdfjsLib = require('pdfjs-dist/build/pdf');
const { isTextFile } = require('../utils');

async function readPDFFile(filePath) {
  pdfjsLib.GlobalWorkerOptions.workerSrc = path.resolve(__dirname, '../node_modules/pdfjs-dist/build/pdf.worker.js');

  const data = new Uint8Array(fs.readFileSync(filePath));
  const doc = await pdfjsLib.getDocument({ data }).promise;
  const pageTexts = Array.from({ length: doc.numPages }, async (v, i) => (await (await doc.getPage(i + 1)).getTextContent()).items.map((token) => token.str).join(''));
  return (await Promise.all(pageTexts)).join('\n');
}

async function readFile(filepath) {
  try {
    const basename = path.basename(filepath);
    const buffer = readChunkSync(filepath, 0, 4100);
    const type = await fileType(buffer);
    if (type && ['docx', 'doc', 'xlsx', 'xls', 'txt', 'csv', 'json'].includes(type.ext)) {
      return await reader.getText(filepath);
    }
    if (type && type.ext === 'pdf') {
      return readPDFFile(filepath);
    }
    // This is not a known binary file type
    if (isTextFile(buffer)) {
      return await readTextFile(filepath);
    }
    chatController.chat.addFrontendMessage('error', `Binary files are not supported (${basename})<br>ChatGPT can only understand text based files like .txt, .docx, .pdf, .csv, .json, .js, .py etc.`);
  } catch (err) {
    chatController.chat.addFrontendMessage('error', `An error occurred reading the file: ${err.message}`);
    console.error(err);
  }
}

async function processFile(filepath) {
  const basename = path.basename(filepath);
  const fileTextContent = await readFile(filepath);
  if (!fileTextContent) return;

  const formattedData = `Content of the file ${basename}:\n\n${fileTextContent}\n\nUse content above of the file ${basename} to answer questions from user below`;
  const tokens = chatController.chat.countTokens(fileTextContent);

  chatController.chat.addBackendMessage('user', formattedData);
  chatController.chat.addFrontendMessage('file', `${basename} uploaded (${tokens} tokens)`);
}

function readTextFile(filePath) {
  onboardingController.showSpecificTips(['on_file_upload']);

  return new Promise((resolve, reject) => {
    fs.readFile(filePath, 'utf8', (err, data) => {
      if (err) {
        alert(`An error occurred reading the file: ${err.message}`);
        reject(err);
      } else {
        resolve(data);
      }
    });
  });
}

async function handleDrop(event) {
  viewController.updateLoadingIndicator(true);
  event.preventDefault();
  const { files } = event.dataTransfer;
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    processFile(file.path);
  }
  viewController.updateLoadingIndicator(false);
}

module.exports = {
  processFile,
  handleDrop,
};
