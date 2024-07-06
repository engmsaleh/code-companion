const { log } = require('./utils');

const SYSTEM_PROMPT = 'Provide result to user task in tool call in "result" property';

class BackgroundTask {
  //  format example:
  //   {
  //       "type": "string",
  //       "description": "The city and country, eg. San Francisco, USA"
  //   }

  constructor(chatController) {
    this.messages = [];
    this.client = chatController.model;
    this.chatController = chatController;
  }

  async run({ prompt, format, model = this.chatController.settings.selectedModel }) {
    try {
      const messages = this.buildMessages(prompt);
      const tool = this.buildTool(format);
      const response = await this.client.call({ messages, model, tool });
      return response.content;
    } catch (error) {
      console.error(error);
    }
  }

  buildMessages(prompt) {
    return [
      {
        role: 'system',
        content: SYSTEM_PROMPT,
      },
      {
        role: 'user',
        content: prompt,
      },
    ];
  }

  buildTool(format) {
    return {
      name: 'json_call',
      parameters: {
        type: 'object',
        properties: {
          result: format,
        },
      },
    };
  }
}

module.exports = BackgroundTask;
