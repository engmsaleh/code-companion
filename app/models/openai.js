const { OpenAI } = require('openai');
const { log, getTokenCount } = require('../utils');

const MAX_RETRIES = 5;

class OpenAIModel {
  constructor({ model, apiKey, baseUrl, streamCallback, chatController, defaultHeaders }) {
    this.model = model;
    this.chatController = chatController;
    const config = {
      apiKey: apiKey,
      dangerouslyAllowBrowser: true,
      maxRetries: MAX_RETRIES,
    };
    if (baseUrl) {
      config.baseURL = baseUrl;
    }
    if (defaultHeaders) {
      config.defaultHeaders = defaultHeaders;
    }
    this.client = new OpenAI(config);
    this.streamCallback = streamCallback;
  }

  async call({ messages, model, tool = null, tools = null, temperature = 0.0 }) {
    let response;
    const callParams = {
      model: model || this.model,
      messages,
      temperature,
    };
    if (tool !== null) {
      response = await this.toolUse(callParams, tool);
    } else {
      callParams.tools = tools.map((tool) => this.openAiToolFormat(tool));
      response = await this.stream(callParams);
    }
    return response;
  }

  async stream(callParams) {
    callParams.stream = true;
    log('Calling model API:', callParams);
    const stream = await this.client.chat.completions.create(callParams, {
      signal: this.chatController.abortController.signal,
    });

    let fullContent = '';
    let toolCalls = [];

    for await (const part of stream) {
      if (part.choices[0]?.delta?.content) {
        fullContent += part.choices[0].delta.content;
        this.streamCallback(fullContent);
      }
      if (part.choices[0]?.delta?.tool_calls) {
        toolCalls = this.accumulateToolCalls(toolCalls, part.choices[0].delta.tool_calls);
      }
    }
    log('Raw response', fullContent, toolCalls);

    return {
      content: fullContent,
      tool_calls: this.formattedToolCalls(toolCalls),
      usage: {
        input_tokens: getTokenCount(callParams.messages),
        output_tokens: getTokenCount(fullContent),
      },
    };
  }

  accumulateToolCalls(existingCalls, newCalls) {
    newCalls.forEach((newCall, index) => {
      if (!existingCalls[index]) {
        existingCalls[index] = { function: { name: '', arguments: '' } };
      }
      if (newCall.function?.name) {
        existingCalls[index].function.name = newCall.function.name;
      }
      if (newCall.function?.arguments) {
        existingCalls[index].function.arguments += newCall.function.arguments;
      }
    });
    return existingCalls;
  }

  async toolUse(callParams, tool) {
    callParams.tools = [this.openAiToolFormat(tool)];
    callParams.tool_choice = { type: 'function', function: { name: tool.name } };
    log('Calling model API:', callParams);
    const chatCompletion = await this.client.chat.completions.create(callParams, {
      signal: this.chatController.abortController.signal,
    });
    log('Raw response', chatCompletion);
    const { result } = this.parseJSONSafely(chatCompletion.choices[0].message.tool_calls[0].function.arguments);
    return {
      content: result,
      usage: {
        input_tokens: chatCompletion.usage?.prompt_tokens,
        output_tokens: chatCompletion.usage?.completion_tokens,
      },
    };
  }

  formattedToolCalls(toolCalls) {
    if (!toolCalls) return null;

    let parsedToolCalls = [];
    for (const toolCall of toolCalls) {
      const functionName = toolCall.function.name;
      const args = this.parseJSONSafely(toolCall.function.arguments);
      parsedToolCalls.push({
        function: {
          name: functionName,
          arguments: args,
        },
      });
    }
    return parsedToolCalls;
  }

  parseJSONSafely(str) {
    if (typeof str === 'object' && str !== null) {
      return str; // Already a JSON object, return as is
    }

    try {
      return JSON.parse(str);
    } catch (e) {
      console.error('Failed to parse JSON:', str);
      throw new Error('Failed to parse response from model, invalid response format. Click Retry to try again.');
    }
  }

  openAiToolFormat(tool) {
    return {
      type: 'function',
      function: tool,
    };
  }

  abort() {
    this.chatController.abortController.abort();
    this.chatController.abortController = new AbortController();
  }
}

module.exports = OpenAIModel;
