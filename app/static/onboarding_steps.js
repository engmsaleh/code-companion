module.exports = [
  {
    id: 'missing_api_key',
    condition: () => !document.getElementById('apiKey').value && !document.getElementById('anthropicApiKey').value,
    description: `
      Welcome to CodeCompanion. To get started: <br /><br />
      <ul class="lh-lg">
        <li>First, add your API key in the <a href="#" onclick="document.getElementById(\'settingsToggle\').click(); return false;">Settings</a> (<i class="bi bi-gear border-0"></i>).</li>
        <li>
          By using this app you agree to
          <a href="https://www.codecompanion.ai/terms">Terms</a><br />
          You acknowledge the potential risks of using an AI assistant such
          as CodeCompanion. This may include, but is not limited to, the
          execution of shell commands that could delete or overwrite files, destroy data. <br />
          Excessive use may result in high API charges. Monitor your use and set a budget to avoid unexpected costs.
        </li>
      </ul>
      <br />
      Happy coding!
    `,
  },
];
