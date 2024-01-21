# CodeCompanion.AI

Welcome to CodeCompanion.AI, your personal coding assistant that helps you translate natural language instructions into code. This document will guide you through setting up the application, understanding its structure, and contributing to its development.

![Demo](video/CodeCompanionAssistant.mp4)

## Quick Start

To start using CodeCompanion desktop app, simply download it:

- [Download for Windows](https://codecompanion.s3.us-west-2.amazonaws.com/CodeCompanion-Installer.exe)

- [Download for Mac](https://codecompanion.s3.us-west-2.amazonaws.com/CodeCompanion.dmg)

Or if you want to contribute or make changes to the code, please follow the instructions below:

1. Clone the repository.
2. Navigate to the project directory.
3. Run `npm install` to install dependencies.
4. The application has a dependency on `node-pty`. To install it, follow the instructions provided [here](https://github.com/microsoft/node-pty?tab=readme-ov-file#dependencies).

5. Start the application with `npm start` or `npm run debug` for development mode.

## Project Overview

Here's an overview of the project's directory structure:

- `build/`: Production-ready compiled files.
- `js/`: Core application logic and functionality.
- `styles/`: Styling and appearance of the application.
- `index.html`: Main entry point for the UI.
- `main.js`: Electron main process script.
- `preload.js`: Pre-rendering script for the renderer process.
- `renderer.js`: Electron renderer process script.
- `scripts/`: Utility and build scripts.

## Contributing

Contributions are welcome! Please refer to `CONTRIBUTING.md` for contribution guidelines.

## License

CodeCompanion.AI is open-source software licensed under the MIT License. See `LICENSE.md` for more information.

## Community and Support

- [Official Website](https://codecompanion.ai/)
- [Join our Discord](https://discord.com/invite/qcTqDgqy6R)

Thank you for using CodeCompanion.AI. Happy coding!
