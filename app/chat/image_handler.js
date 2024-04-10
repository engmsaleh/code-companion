const fs = require('fs');
const sharp = require('sharp');
const MAX_IMAGE_DIMENSION = 1024;

class ImageHandler {
  constructor() {}

  async imageToBase64(filePath) {
    const imageBuffer = await this.resizeImageIfNeeded(filePath);
    const base64Image = imageBuffer.toString('base64');
    return base64Image;
  }

  async resizeImageIfNeeded(filePath) {
    const image = sharp(filePath);
    const metadata = await image.metadata();

    if (metadata.width > MAX_IMAGE_DIMENSION || metadata.height > MAX_IMAGE_DIMENSION) {
      return image
        .resize(MAX_IMAGE_DIMENSION, MAX_IMAGE_DIMENSION, {
          fit: sharp.fit.inside,
          withoutEnlargement: true,
        })
        .toBuffer();
    } else {
      return image.toBuffer();
    }
  }
}

module.exports = ImageHandler;
