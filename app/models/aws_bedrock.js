const { BedrockRuntimeClient, InvokeModelCommand } = require("@aws-sdk/client-bedrock-runtime");

class AWSBedrockModel {
  constructor({ model, accessKeyId, secretAccessKey, region, streamCallback, chatController }) {
    this.model = model;
    this.chatController = chatController;
    this.streamCallback = streamCallback;

    console.log('AWS Credentials:', { accessKeyId, secretAccessKey, region });

    this.client = new BedrockRuntimeClient({
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
      region,
    });
  }

  async call({ messages, model, temperature = 0.0 }) {
    const formattedMessages = this.formatMessages(messages);
    const params = {
      modelId: model || this.model,
      contentType: 'application/json',
      accept: 'application/json',
      body: JSON.stringify({
        anthropic_version: "bedrock-2023-05-31",
        max_tokens: 2000,
        messages: formattedMessages,
        temperature,
      }),
    };

    try {
      console.log('Formatted messages:', JSON.stringify(formattedMessages, null, 2));
      console.log('Sending request to AWS Bedrock:', JSON.stringify(params, null, 2));
      const command = new InvokeModelCommand(params);
      const response = await this.client.send(command);
      const responseBody = JSON.parse(new TextDecoder().decode(response.body));
      console.log('Received response from AWS Bedrock:', JSON.stringify(responseBody, null, 2));
      return {
        content: responseBody.content[0].text,
        usage: {
          input_tokens: responseBody.usage.input_tokens,
          output_tokens: responseBody.usage.output_tokens,
        },
      };
    } catch (error) {
      console.error('Error calling Claude via AWS Bedrock:', error);
      console.error('Error details:', error.message);
      if (error.$metadata) {
        console.error('Error metadata:', JSON.stringify(error.$metadata, null, 2));
      }
      throw error;
    }
  }

  formatMessages(messages) {
    let formattedMessages = [];
    
    // Find the last user message
    let lastUserMessage = messages[messages.length - 1];
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'user') {
        lastUserMessage = messages[i];
        break;
      }
    }

    // Add system message if present
    const systemMessage = messages.find(m => m.role === 'system');
    if (systemMessage) {
      formattedMessages.push({
        role: 'user',
        content: systemMessage.content
      });
      formattedMessages.push({
        role: 'assistant',
        content: 'Understood. I will follow these instructions.'
      });
    }

    // Add the last user message
    formattedMessages.push({
      role: 'user',
      content: lastUserMessage.content
    });

    return formattedMessages;
  }

  estimateTokenCount(text) {
    // This is a very rough estimate. You might want to use a more accurate tokenizer.
    return Math.ceil(text.length / 4);
  }

  abort() {
    this.chatController.abortController.abort();
    this.chatController.abortController = new AbortController();
  }
}

module.exports = AWSBedrockModel;