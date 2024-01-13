const { OpenAI } = require('openai');

const SYSTEM_PROMPT = 'Respond with JSON in the specified format below: ';
const DEFAULT_MODEL = 'gpt-3.5-turbo-1106';

class BackgroundTask {
  constructor() {
    this.messages = [];
    this.client = null;
    this.initialize();
  }

  initialize() {
    const apiKey = settings.get('apiKey');
    if (apiKey) {
      this.client = new OpenAI({ apiKey: apiKey, dangerouslyAllowBrowser: true });
    }
  }

  async run({ prompt, format, model = DEFAULT_MODEL, temperature = 1.0 }) {
    if (!this.client) {
      this.initialize();
    }

    try {
      const messages = this.buildMessages(format, prompt);
      const chatCompletion = await this.client.chat.completions.create({
        messages: messages,
        model: model,
        response_format: { type: 'json_object' },
        temperature: temperature,
      });
      const response = JSON.parse(chatCompletion.choices[0].message.content).result;
      this.log(messages, response);
      return response;
    } catch (error) {
      console.error(error);
    }
  }

  buildMessages(format, prompt) {
    return [
      {
        role: 'system',
        content: `${SYSTEM_PROMPT}\n${JSON.stringify({ result: format })}`,
      },
      {
        role: 'user',
        content: prompt,
      },
    ];
  }

  log(messages, response) {
    if (isDevelopment) console.log('BackgroundTask: ' + JSON.stringify(messages) + ' ' + JSON.stringify(response));
  }
}

module.exports = BackgroundTask;
