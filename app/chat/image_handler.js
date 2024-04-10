const fs = require('fs');

class ImageHandler {
  constructor() {}

  async imageToText(filePath) {
    const base64Image = await this.getBase64Image(filePath);
    return base64Image;
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
}

module.exports = ImageHandler;
