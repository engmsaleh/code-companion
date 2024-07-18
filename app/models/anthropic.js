const Anthropic = require('@anthropic-ai/sdk');
const { log } = require('../utils');

const MAX_RETRIES = 3;

class AnthropicModel {
  constructor({ model, apiKey, baseUrl, abortController, streamCallback }) {
    this.model = model;
    this.abortController = abortController;
    const config = {
      apiKey: apiKey,
      maxRetries: MAX_RETRIES,
    };
    this.options = {
      signal: this.abortController.signal,
    };
    this.maxTokens = 4096;
    if (model === 'claude-3-5-sonnet-20240620') {
      this.maxTokens = 8192;
      this.options.headers = { 'anthropic-beta': 'max-tokens-3-5-sonnet-2024-07-15' };
    }
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
      max_tokens: this.maxTokens,
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
    const stream = this.client.messages.stream(callParams, this.options).on('text', (text) => {
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
    const response = await this.client.messages.create(callParams, this.options);
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
    const toolCalls = content.filter((item) => item.type === 'tool_use');
    if (!toolCalls) return null;

    let parsedToolCalls = [];
    for (const toolCall of toolCalls) {
      const functionName = toolCall.name;
      const args = toolCall.input;
      const firstArgKey = Object.keys(args)[0];
      if (
        args[firstArgKey] &&
        Array.isArray(args[firstArgKey]) &&
        args[firstArgKey].every((item) => typeof item === 'object' && item !== null)
      ) {
        for (const item of args[firstArgKey]) {
          parsedToolCalls.push({
            function: {
              name: functionName,
              arguments: item,
            },
          });
        }
      } else {
        parsedToolCalls.push({
          function: {
            name: functionName,
            arguments: args,
          },
        });
      }
    }
    return parsedToolCalls;
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
