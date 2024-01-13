module.exports = [
  {
    id: 'missing_api_key',
    condition: () => !document.getElementById('apiKey').value,
    description: `
      Hello! Welcome to CodeCompanion.AI. To get started: <br /><br />
      <ul class="lh-lg">
        <li>First, add your <a href="https://platform.openai.com/account/api-keys">OpenAI API key</a> in the settings menu (<i class="bi bi-gear border-0"></i>).</li>
        <li>
          By using this app you agree to
          <a href="https://www.codecompanion.ai/terms">Terms</a><br />
          You acknowledge the potential risks of using an AI assistant such
          as CodeCompanion.AI. This may include, but is not limited to, the
          execution of shell commands that could delete or overwrite files,
          destroy data, or harm your computer. <br />
          Excessive use may result in high OpenAI API charges. Monitor your use and set a budget to avoid unexpected costs.
        </li>
      </ul>
      <br />
      Happy coding!
    `,
  },
  {
    id: 'code_introduction',
    condition: () => true,
    description: `
      <i>Code</i> mode is your personal AI coding assistant that executes commands, writes and runs code and more.<br /><br />
      <ul class="lh-lg">
          <li>
            <b>Chat window:</b> Ask to perform a task, like creating a file or website or running a command.
          </li>
          <li>
            <b>Shell commands:</b> Ask to run any command like installing a dependency, running migration or deploy project with AWS CLI
            </li>
          <li>
            <b>File modifications:</b> You can instruct App to modify existing code or to write new code.
            <br />The app can read, write and modify any file, list files and explore the project.
            <br />There is no need to upload your code or copy/paste it into the app.
            <br />Simply ask: Refactor <i>folder/filname.js into smaller functions</i>
          </li>
          <li>
            <b>Integrated terminal:</b> You have the freedom to interact directly with the terminal.
            <br />App will keep track of your current directory and will use it as a current workspace. 
            <br />Simply <code>cd</code> into a new directory to change workspace.
            <br />You can also update your default workspace in the settings menu.
          </li>
      </ul>
      <p>Remember, with CodeCompanion.AI, the possibilities are endless.
      <br />The app can create new projects, run commands, deploy apps, write tests, review and refactor code, and even write apps from scratch based on your commands.</p>`,
  },
  {
    id: 'on_file_upload',
    condition: () => false,
    description: 'In most cases there is no need to upload files.<br />The AI can read files if you provide the file path in the message.',
  },
];
