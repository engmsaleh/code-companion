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
    try {
      console.log('Starting call method');
      let formattedMessages = this.formatMessages(messages);
      const toolConfig = this.formatToolConfig(tools || this.tools);
      let response;
      let continueCoding = true;
      let chatOutput = '';

      while (continueCoding) {
        console.log('Entering while loop');
        response = await this.makeConverseCall(formattedMessages, model, toolConfig, temperature);
        console.log('Raw response from makeConverseCall:', JSON.stringify(response, null, 2));

        const formattedResponse = this.formatResponse(response);

        if (formattedResponse.tool_calls && formattedResponse.tool_calls.length > 0) {
          console.log('Tool use detected');
          for (const toolCall of formattedResponse.tool_calls) {
            try {
              const toolResult = await this.handleToolUse(toolCall.function);
              chatOutput += this.formatToolOutput(toolResult);
              formattedMessages.push({
                role: 'assistant',
                content: [{ type: 'text', text: JSON.stringify(toolResult) }]
              });
            } catch (error) {
              console.error('Error handling tool use:', error);
              chatOutput += `Error executing tool: ${error.message}\n\n`;
              formattedMessages.push({
                role: 'assistant',
                content: [{ type: 'text', text: `Error executing tool: ${error.message}` }]
              });
            }
          }
          formattedMessages.push({
            role: 'user',
            content: [{ type: 'text', text: 'The tool has been executed. Please continue based on the tool result.' }]
          });
        } else {
          console.log('Processing non-tool response');
          chatOutput += formattedResponse.content + '\n\n';
          formattedMessages.push({
            role: 'assistant',
            content: [{ type: 'text', text: formattedResponse.content }]
          });

          continueCoding = !this.isCodeComplete(response);

          if (continueCoding) {
            formattedMessages.push({
              role: 'user',
              content: [{ type: 'text', text: 'Please continue the implementation. If you need to create, edit, or run any code, please use the appropriate tools.' }]
            });
          } else {
            return { ...formattedResponse, content: chatOutput };
          }
        }

        // Return the current chatOutput after each iteration
        return { ...formattedResponse, content: chatOutput };
      }

      console.log('Exiting call method');
      return { ...this.formatResponse(response), content: chatOutput };
    } catch (error) {
      console.error('Error in call method:', error);
      return {
        content: 'An error occurred while processing your request.',
        tool_calls: [],
        usage: { input_tokens: 0, output_tokens: 0 },
      };
    }
  }

  // Add this method to check if the coding is complete
  isCodeComplete(response) {
    // Implement your logic to determine if the coding is complete
    // For example, you could check for a specific phrase in the response
    const content = response.content.find(item => item.type === 'text')?.text || '';
    return content.toLowerCase().includes('coding complete') || content.toLowerCase().includes('implementation finished');
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
    console.log('Handling tool use:', JSON.stringify(toolUse, null, 2));
    
    if (!toolUse || typeof toolUse !== 'object') {
      console.error('Invalid toolUse object:', toolUse);
      throw new Error('Invalid toolUse object');
    }

    const { name, arguments: argsString } = toolUse;
    
    if (!name) {
      console.error('Tool name is missing');
      throw new Error('Tool name is missing');
    }

    const tool = this.tools.find((t) => t.name === name);
    if (!tool) {
      console.error(`Tool not found: ${name}`);
      throw new Error(`Tool not found: ${name}`);
    }

    let args;
    try {
      args = JSON.parse(argsString);
    } catch (error) {
      console.error('Failed to parse tool arguments:', argsString);
      throw new Error('Failed to parse tool arguments');
    }

    console.log('Executing tool:', name);
    console.log('Tool arguments:', JSON.stringify(args, null, 2));

    try {
      const result = await tool.func(args);
      return {
        tool_name: name,
        tool_input: args,
        tool_output: result
      };
    } catch (error) {
      console.error('Error executing tool:', error);
      return {
        tool_name: name,
        tool_input: args,
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

  formatToolOutput(toolResult) {
    let output = `### 🛠️ Tool Used: ${toolResult.tool_name}\n\n`;

    if (toolResult.tool_name === 'run_shell_command') {
      const commandOutput = toolResult.tool_output.replace(/^\s*'|'\s*$/g, '');
      const lines = commandOutput.split('\n');
      const command = lines[0].replace('Command executed: ', '').trim();
      output += `**Command:**\n\`\`\`bash\n${command}\n\`\`\`\n`;

      // Filter and format the command output
      const relevantOutput = lines.slice(1)
        .filter(line => !line.startsWith('➜') && !line.startsWith('Progress:') && !line.includes('WARN'))
        .join('\n')
        .trim();

      if (relevantOutput) {
        output += "**Output:**\n```\n" + relevantOutput + "\n```\n";
      } else {
        output += "✅ Command executed successfully.\n";
      }
    } else if (toolResult.tool_name === 'create_or_overwrite_file') {
      const { targetFile, createText } = toolResult.tool_input;
      output += `**File:** \`${targetFile}\`\n\n`;
      output += "**Content:**\n```typescript\n" + createText + "\n```\n";
    } else {
      output += `**Result:**\n\`\`\`json\n${JSON.stringify(toolResult.tool_output, null, 2)}\n\`\`\`\n`;
    }

    return output + '\n---\n\n';
  }

  abort() {
    this.chatController.abortController.abort();
    this.chatController.abortController = new AbortController();
  }
}

module.exports = AWSBedrockModel;

async function processConversation(messages) {
  let allResponses = '';
  let isComplete = false;

  while (!isComplete) {
    const response = await awsBedrockModel.call({ messages });
    allResponses += response.content;
    
    // Output the current response to the chat window
    outputToChat(response.content);

    // Check if the conversation is complete
    isComplete = awsBedrockModel.isCodeComplete(response);

    if (!isComplete) {
      // Add the model's response and a new user message to continue the conversation
      messages.push({ role: 'assistant', content: response.content });
      messages.push({ role: 'user', content: 'Please continue the implementation.' });
    }
  }

  return allResponses;
}

function outputToChat(content) {
  // Implement this function to update your chat window with the new content
  console.log(content);  // For example, logging to console
}