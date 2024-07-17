const Anthropic = require('@anthropic-ai/sdk');
const { log } = require('../utils');

const MAX_RETRIES = 3;
const MAX_TOKENS = 4096;

class AnthropicModel {
  constructor({ model, apiKey, baseUrl, abortController, streamCallback }) {
    this.model = model;
    this.abortController = abortController;
    const config = {
      apiKey: apiKey,
      maxRetries: MAX_RETRIES,
    };
    if (baseUrl) {
      config.baseURL = baseUrl;
    }
    this.client = new Anthropic(config);
    this.streamCallback = streamCallback;
  }

  async call({ messages, model, tool = null, tools = null, temperature = 0.0 }) {
    let response;
    const system = messages.find((message) => message.role === 'system');
    const callParams = {
      model: model || this.model,
      system: system ? system.content : null,
      messages: messages.filter((message) => message.role !== 'system'),
      temperature,
      max_tokens: MAX_TOKENS,
    };
    if (tool !== null) {
      response = await this.toolUse(callParams, tool);
    } else {
      callParams.tools = tools.map((tool) => this.anthropicToolFormat(tool));
      response = await this.stream(callParams);
    }
    return response;
  }

  async stream(callParams) {
    log('Calling model API:', callParams);
    let message = '';
    const stream = this.client.messages
      .stream(callParams, {
        signal: this.abortController.signal,
      })
      .on('text', (text) => {
        message += text;
        this.streamCallback(message);
      });

    const finalMessage = await stream.finalMessage();
    log('Raw response', finalMessage);
    return {
      content: finalMessage.content.find((item) => item.type === 'text')?.text || '',
      tool_calls: this.formattedToolCalls(finalMessage.content),
      usage: {
        input_tokens: finalMessage.usage.input_tokens,
        output_tokens: finalMessage.usage.output_tokens,
      },
    };
  }

  async toolUse(callParams, tool) {
    callParams.tools = [this.anthropicToolFormat(tool)];
    callParams.tool_choice = { type: 'tool', name: tool.name };

    log('Calling model API:', callParams);
    const response = await this.client.messages.create(callParams, {
      signal: this.abortController.signal,
    });
    log('Raw response', response);
    const { result } = response.content.filter((item) => item.type === 'tool_use')[0].input;
    return {
      content: result,
      usage: {
        input_tokens: response.usage.input_tokens,
        output_tokens: response.usage.output_tokens,
      },
    };
  }

  formattedToolCalls(content) {
    return content
      .filter((item) => item.type === 'tool_use')
      .map((item) => {
        return {
          function: {
            name: item.name,
            arguments: item.input,
          },
        };
      });
  }

  anthropicToolFormat(tool) {
    const { parameters, ...rest } = tool;
    return {
      ...rest,
      input_schema: parameters,
    };
  }

  abort() {
    this.abortController.abort();
    this.abortController = new AbortController();
  }
}

module.exports = AnthropicModel;
