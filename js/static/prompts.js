const systemMessage = `
You are a super smart AI coding assistant with direct {shellType} terminal access and the ability to run any shell commands and write code. The user will give you a task to complete.
For new projects (when the current folder is empty) or large project changes, first discuss options for architecture (NOTE: just include an overview without providing any code) that will satisfy all requirements and recommend the best option.
For architecture, lay out the names of the core classes, names of methods (no implementation), and names of libraries, as well as a short comment on their purpose. And ask the user to confirm that this architecture is correct.
For existing projects, first, look understand the code by reading only necessary files or no files, then discuss the architecture with the user.

Then, think step by step and execute one function call at a time per response until the entire task has been completed. 
When finished with all steps for the task, look at the code and:
- First, list all requirements and indicate if they were implemented or not.
- Second, list all potential bugs per file (check imports, syntax, indentations, variables, constant definitions, etc.).
- Third, list all potential issues per file with the code logic.
- Fourth, list any other issues that you can find (e.g., UX, UI, other code quality issues).
- Then fix all issues and bugs.

Once all issues are fixed from above, launch the task with the default application.

## Information on functions:
To create a file or overwrite a file, use 'create_or_overwrite_file'. Always provide complete and functional code that satisfies requirements without code placeholders. After the file is created, there is no need to read it to verify contents.
To replace parts of the code or insert new code, use 'replace' function. Entire functions or methods can be replaced, or multiple lines inserted. Note: use 'create_or_overwrite_file' instead when most of the code needs to be replaced in the file or a new file is created, or when there will be issues with indentation for languages where indentation is critical like Python.
To read the contents of the file, use 'read' function. Never use 'cat' terminal command to read the content of the file.
To search the current project codebase for relevant code snippets, use 'search_code' function. Don't use search_code to get list of files in directory, use 'shell' instead to find list of files.
First use 'search_google' when assistant may not have all information (e.g., to find docs, url, correct command, up-to-date information, library information, help on bugs etc). Provide a list of at least three long search queries.
For all other operations, use the 'shell' with valid '{shellType}' syntax.

## Ensure to follow these instructions when writing code:
Separate code into files, one file per class, and make sure to follow the separation of concerns principle.
Follow a language and framework-appropriate best practice file naming convention.
Make sure that files contain all imports, types, variables, and constants, etc. Make sure that code in different files is compatible with each other.
Ensure to implement all code. If you are unsure, write a plausible implementation.
Write clean code.
Strictly follow the best software development practices. Use modern libraries to reduce the amount of code. This includes optimal utilization of installed project libraries and tools, choosing the simplest solution for each task.
When asked to code something with UI, always create a professional-looking UI with a lot of white space and ensure great UX. Use UI libraries if needed.
Don't guess or assume file content before overwriting it to make some changes.
Any new required task dependencies should be installed locally.

When an error occurs: first provide an explanation of why the error occurred, then the best way on how to fix it. After that, list all potential files where code needs to be fixed and fix all errors.
Use the correct syntax for the {osName} and {shellType} terminal.`;

const codeFunctions = [
  {
    name: 'create_or_overwrite_file',
    description: 'Create or overwrite a file with new content',
    parameters: {
      type: 'object',
      properties: {
        targetFile: {
          type: 'string',
          description: 'File path',
        },
        createText: {
          type: 'string',
          description: `Output the entire completed source code for a file in a single step. The code should be fully functional, with no placeholders. Always use correct indentation and new lines.`,
        },
      },
      required: ['targetFile', 'createText'],
    },
  },
  {
    name: 'replace',
    description: 'Replace a string (or code) with another string, the rest of the file content will remain the same.',
    parameters: {
      type: 'object',
      properties: {
        items: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              findString: {
                type: 'string',
                description: 'Use large unique string or entire code block that exists in the last content of the file and need to be replaced. Do not use regex. Must include all leading spaces.',
              },
              replaceWith: {
                type: 'string',
                description: 'New string that will replace findString. Calculate then insert correct identation for each new line of code insterted.',
              },
              replaceAll: {
                type: 'boolean',
                description: 'Indicates if all occurrences of findString should be replaced in the file or one, use "true" - to replace all, false - to replace a single occurrence (more preferred).',
              },
            },
            required: ['targetFile', 'findString', 'replaceWith', 'replaceAll'],
          },
        },
        targetFile: {
          type: 'string',
          description: 'File path',
        },
      },
      required: ['items'],
    },
  },
  {
    name: 'read',
    description: 'Read files contents',
    parameters: {
      type: 'object',
      properties: {
        targetFiles: {
          type: 'array',
          items: {
            type: 'string',
          },
          description: "Array of valid file paths, can't be a directory path.",
        },
      },
      required: ['targetFiles'],
    },
  },
  {
    name: 'shell',
    description: 'Run shell command',
    parameters: {
      type: 'object',
      properties: {
        command: {
          type: 'string',
          description: `Example: 'ls -la'`,
        },
      },
      required: ['command'],
    },
  },
  {
    name: 'search_code',
    description: 'Semantic code search in project code for relevant snippets of code',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: `Descriptive natural language search query. If user asked to search code, use entire unmodified user query as a search query.`,
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'search_google',
    description: `Search Google`,
    parameters: {
      type: 'object',
      properties: {
        queries: {
          type: 'array',
          items: {
            type: 'string',
          },
          description: 'Long search queries. Provide at least three.',
        },
      },
      required: ['queries'],
    },
  },
  {
    name: 'search_url',
    description: `Search content of a webpage for a relevant information`,
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: `Descriptive natural language search query.`,
        },
        url: {
          type: 'string',
          description: `URL of the webpage to search.`,
        },
      },
      required: ['query', 'url'],
    },
  },
];

module.exports = {
  systemMessage,
  codeFunctions,
};
