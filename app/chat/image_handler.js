VISION_MODEL = 'gpt-4-vision-preview';
MAX_TOKENS = 4096;

const fs = require('fs');
const { OpenAI } = require('openai');

const { VISION_MODEL_PROMPT } = require('../static/prompts');

class ImageHandler {
  constructor() {
    this.openai = new OpenAI({
      apiKey: chatController.settings.apiKey,
      dangerouslyAllowBrowser: true,
      max_tokens: MAX_TOKENS,
    });
  }

  async imageToText(filePath) {
    const base64Image = await this.getBase64Image(filePath);
    return await this.callAPI(base64Image);
  }

  getBase64Image(filePath) {
    return new Promise((resolve, reject) => {
      fs.readFile(filePath, { encoding: 'base64' }, (err, data) => {
        if (err) {
          reject(err);
        } else {
          resolve(data);
        }
      });
    });
  }

  async callAPI(base64Image) {
    const response = await this.openai.chat.completions.create({
      model: VISION_MODEL,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: VISION_MODEL_PROMPT },
            {
              type: 'image_url',
              image_url: {
                url: `data:image/jpeg;base64,${base64Image}`,
              },
            },
          ],
        },
      ],
    });

    return response.choices[0].message.content;
  }
}

module.exports = ImageHandler;
