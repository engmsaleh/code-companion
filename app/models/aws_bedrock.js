const { BedrockRuntimeClient, InvokeModelCommand } = require("@aws-sdk/client-bedrock-runtime");
const { log } = require('../utils');

class AWSBedrockModel {
  constructor({ model, accessKeyId, secretAccessKey, region, streamCallback, chatController }) {
    this.model = model;
    this.chatController = chatController;
    this.streamCallback = streamCallback;
    this.tools = chatController.tools || []; // Store tools directly in the model

    this.client = new BedrockRuntimeClient({
      credentials: { accessKeyId, secretAccessKey },
      region,
    });

    this.maxTokens = 4000;
  }

  async call({ messages, model, tools = null, temperature = 0.0 }) {
    console.log('Input messages:', JSON.stringify(messages, null, 2));
    const formattedMessages = this.formatMessages(messages);
    console.log('Formatted messages:', JSON.stringify(formattedMessages, null, 2));

    const toolConfig = this.formatToolConfig(tools || this.tools);
    let response = await this.makeConverseCall(formattedMessages, model, toolConfig, temperature);

    console.log('Raw response from makeConverseCall:', JSON.stringify(response, null, 2));

    while (response.stop_reason === 'tool_use') {
      const toolUse = response.content.find(item => item.type === 'tool_use');
      if (!toolUse) {
        console.error('Tool use requested but no tool_use content found');
        break;
      }
      const toolResult = await this.handleToolUse(toolUse);
      formattedMessages.push({
        role: 'assistant',
        content: [{ type: 'text', text: JSON.stringify(toolResult) }]
      });
      formattedMessages.push({
        role: 'user',
        content: [{ type: 'text', text: 'Please continue based on the tool result.' }]
      });
      response = await this.makeConverseCall(formattedMessages, model, toolConfig, temperature);
    }

    return this.formatResponse(response);
  }

  async makeConverseCall(messages, model, toolConfig, temperature) {
    const callParams = {
      modelId: model || this.model,
      contentType: 'application/json',
      accept: 'application/json',
      body: JSON.stringify({
        anthropic_version: "bedrock-2023-05-31",
        max_tokens: this.maxTokens,
        messages,
        temperature,
        tools: toolConfig,
      }),
    };

    try {
      log('Sending request to AWS Bedrock:', JSON.stringify(callParams, null, 2));
      const command = new InvokeModelCommand(callParams);
      const response = await this.client.send(command);
      const responseBody = JSON.parse(new TextDecoder().decode(response.body));
      log('Received response from AWS Bedrock:', JSON.stringify(responseBody, null, 2));
      return responseBody;
    } catch (error) {
      console.error('Error calling Claude via AWS Bedrock:', error);
      throw error;
    }
  }

  formatToolConfig(tools) {
    if (!tools) return undefined;
    return tools.map(tool => ({
      name: tool.name,
      description: tool.description,
      input_schema: {
        type: "object",
        properties: tool.parameters.properties,
        required: tool.parameters.required
      }
    }));
  }

  async handleToolUse(toolUse) {
    const tool = this.tools.find((t) => t.name === toolUse.name);
    if (!tool) {
      console.error(`Tool not found: ${toolUse.name}`);
      throw new Error(`Tool not found: ${toolUse.name}`);
    }

    try {
      const result = await tool.func(toolUse.input);
      return {
        tool_name: toolUse.name,
        tool_input: toolUse.input,
        tool_output: result
      };
    } catch (error) {
      console.error('Error executing tool:', error);
      return {
        tool_name: toolUse.name,
        tool_input: toolUse.input,
        tool_output: `Error: ${error.message}`,
        status: 'error'
      };
    }
  }

  formatResponse(response) {
    console.log('Raw response from AWS Bedrock:', JSON.stringify(response, null, 2));

    if (!response || !response.content) {
      console.error('Unexpected response structure from AWS Bedrock');
      return {
        content: '',
        tool_calls: [],
        usage: { input_tokens: 0, output_tokens: 0 },
      };
    }

    const content = response.content.find(item => item.type === 'text')?.text || '';
    const toolCalls = response.content
      .filter(item => item.type === 'tool_use')
      .map(item => ({
        type: 'function',
        function: {
          name: item.name,
          arguments: JSON.stringify(item.input)
        }
      }));

    return {
      content,
      tool_calls: toolCalls,
      usage: {
        input_tokens: response.usage?.input_tokens || 0,
        output_tokens: response.usage?.output_tokens || 0,
      },
    };
  }

  formatMessages(messages) {
    let formattedMessages = [];
    let systemMessage = '';
    let lastRole = null;

    messages.forEach((message, index) => {
      if (message.role === 'system') {
        systemMessage += message.content + '\n\n';
      } else {
        const role = message.role === 'user' ? 'user' : 'assistant';
        const content = role === 'user' && index === 0 ? systemMessage + message.content : message.content;
        
        if (lastRole === role) {
          // Append to the last message of the same role
          formattedMessages[formattedMessages.length - 1].content[0].text += '\n' + content;
        } else {
          // Add a new message
          formattedMessages.push({
            role: role,
            content: [{ type: 'text', text: content }]
          });
          lastRole = role;
        }
      }
    });

    // Ensure the conversation starts with a user message
    if (formattedMessages.length === 0 || formattedMessages[0].role !== 'user') {
      formattedMessages.unshift({ 
        role: 'user', 
        content: [{ type: 'text', text: systemMessage + 'Hello' }] 
      });
    }

    return formattedMessages;
  }

  abort() {
    this.chatController.abortController.abort();
    this.chatController.abortController = new AbortController();
  }
}

module.exports = AWSBedrockModel;