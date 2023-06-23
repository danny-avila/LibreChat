# Making your own Plugin

Creating custom plugins for this project involves extending the `Tool` class from the `langchain/tools` module. 

**Note:** I will use the word plugin interchangeably with tool, as the latter is specific to langchain, and we are mainly conforming to the library in this implementation.

You are essentially creating DynamicTools in Langchain speak. See the [langchainjs docs](https://js.langchain.com/docs/modules/agents/tools/dynamic) for more info.

This guide will walk you through the process of creating your own custom plugins, using the `StableDiffusionAPI` and `WolframAlphaAPI` tools as examples.

The most common implementation is to make an API call based on the natural language input from the AI.

---


## Key Takeaways

Here are the key takeaways for creating your own plugin:

**1.** [**Import Required Modules:**](make_your_own.md#step-1-import-required-modules) Import the necessary modules for your plugin, including the `Tool` class from `langchain/tools` and any other modules your plugin might need.

**2.** [**Define Your Plugin Class:**](make_your_own.md#step-2-define-your-tool-class) Define a class for your plugin that extends the `Tool` class. Set the `name` and `description` properties in the constructor. If your plugin requires credentials or other variables, set them from the fields parameter or from a method that retrieves them from your process environment.

**3.** [**Define Helper Methods:**](make_your_own.md#step-3-define-helper-methods) Define helper methods within your class to handle specific tasks if needed.

**4.** [**Implement the `_call` Method:**](make_your_own.md#step-4-implement-the-_call-method) Implement the `_call` method where the main functionality of your plugin is defined. This method is called when the language model decides to use your plugin. It should take an `input` parameter and return a result. If an error occurs, the function should return a string representing an error, rather than throwing an error.

**5.** [**Export Your Plugin and Import into handleTools.js:**](make_your_own.md#step-5-export-your-plugin-and-import-into-handletoolsjs) Export your plugin and import it into `handleTools.js`. Add your plugin to the `toolConstructors` object in the `loadTools` function. If your plugin requires more advanced initialization, add it to the `customConstructors` object.

**6.** [**Add Your Plugin to manifest.json:**](make_your_own.md#step-6-add-your-plugin-to-manifestjson) Add your plugin to `manifest.json`. Follow the strict format for each of the fields of the "plugin" object. If your plugin requires authentication, add those details under `authConfig` as an array. The `pluginKey` should match the class `name` of the Tool class you made, and the `authField` prop must match the process.env variable name.

Remember, the key to creating a custom plugin is to extend the `Tool` class and implement the `_call` method. The `_call` method is where you define what your plugin does. You can also define helper methods and properties in your class to support the functionality of your plugin.

**Note: You can find all the files mentioned in this guide in the `.\api\app\langchain\tools` folder.**

---

## Step 1: Import Required Modules

Start by importing the necessary modules. This will include the `Tool` class from `langchain/tools` and any other modules your tool might need. For example:

```javascript
const { Tool } = require('langchain/tools');
// ... whatever else you need
```

## Step 2: Define Your Tool Class

Next, define a class for your plugin that extends the `Tool` class. The class should have a constructor that calls the `super()` method and sets the `name` and `description` properties. These properties will be used by the language model to determine when to call your tool and with what parameters.

**Important:** you should set credentials/necessary variables from the fields parameter, or alternatively from a method that gets it from your process environment
```javascript
class StableDiffusionAPI extends Tool {
  constructor(fields) {
    super();
    this.name = 'stable-diffusion';
    this.url = fields.SD_WEBUI_URL || this.getServerURL(); // <--- important!
    this.description = `You can generate images with 'stable-diffusion'. This tool is exclusively for visual content...`;
  }
  ...
}
```

Note that we're getting the necessary variable from the process env with this method if it isn't passed in the fields object.

A distinction has to be made. The credentials are passed through `fields` when the user provides it from the frontend; otherwise, the admin can "authorize" the plugin through environment variables.

```js
  getServerURL() {
    const url = process.env.SD_WEBUI_URL || '';
    if (!url) {
      throw new Error('Missing SD_WEBUI_URL environment variable.');
    }
    return url;
  }
```


## Step 3: Define Helper Methods

You can define helper methods within your class to handle specific tasks if needed. For example, the `StableDiffusionAPI` class includes methods like `replaceNewLinesWithSpaces`, `getMarkdownImageUrl`, and `getServerURL` to handle various tasks.

```javascript
class StableDiffusionAPI extends Tool {
  ...
  replaceNewLinesWithSpaces(inputString) {
    return inputString.replace(/\r\n|\r|\n/g, ' ');
  }
  ...
}
```

## Step 4: Implement the `_call` Method

The `_call` method is where the main functionality of your plugin is implemented. This method is called when the language model decides to use your plugin. It should take an `input` parameter and return a result.

```javascript
class StableDiffusionAPI extends Tool {
  ...
  async _call(input) {
    // Your tool's functionality goes here
    ...
    return this.result;
  }
}
```

**Important:** The _call function is what will the agent will actually call. When an error occurs, the function should, when possible, return a string representing an error, rather than throwing an error. This allows the error to be passed to the LLM and the LLM can decide how to handle it. If an error is thrown, then execution of the agent will stop.

## Step 5: Export Your Plugin and import into handleTools.js


**This process will be somewhat automated in the future, as long as you have your plugin/tool in api\app\langchain\tools**

```javascript
// Export
module.exports = StableDiffusionAPI;
```

```js
/* api\app\langchain\tools\handleTools.js */
const StableDiffusionAPI = require('./StableDiffusion');
...
```

In handleTools.js, find the beginning of the `loadTools` function and add your plugin/tool to the toolConstructors object.
```js
const loadTools = async ({ user, model, tools = [], options = {} }) => {
  const toolConstructors = {
    calculator: Calculator,
    google: GoogleSearchAPI,
    wolfram: WolframAlphaAPI,
    'dall-e': OpenAICreateImage,
    'stable-diffusion': StableDiffusionAPI // <----- Newly Added. Note: the key is the 'name' provided in the class. 
    // We will now refer to this name as the `pluginKey`
  };
  ```
  
If your Tool class requires more advanced initialization, you would add it to the customConstructors object.

The default initialization can be seen in the `loadToolWithAuth` function, and most custom plugins should be initialized this way.

Here are a few customConstructors, which have varying initializations
```javascript
  const customConstructors = {
    browser: async () => {
      let openAIApiKey = process.env.OPENAI_API_KEY;
      if (!openAIApiKey) {
        openAIApiKey = await getUserPluginAuthValue(user, 'OPENAI_API_KEY');
      }
      return new WebBrowser({ model, embeddings: new OpenAIEmbeddings({ openAIApiKey }) });
    },
  // ...
    plugins: async () => {
      return [
        new HttpRequestTool(),
        await AIPluginTool.fromPluginUrl(
          "https://www.klarna.com/.well-known/ai-plugin.json", new ChatOpenAI({ openAIApiKey: options.openAIApiKey, temperature: 0 })
        ),
      ]
    }
  };
  ```
  
## Step 6: Add your Plugin to manifest.json

**This process will be somehwat automated in the future along with step 5, as long as you have your plugin/tool in api\app\langchain\tools, and your plugin can be initialized with the default method**

```json
  {
    "name": "Calculator",
    "pluginKey": "calculator",
    "description": "Perform simple and complex mathematical calculations.",
    "icon": "https://i.imgur.com/RHsSG5h.png",
    "isAuthRequired": "false",
    "authConfig": []
  },
  {
    "name": "Stable Diffusion",
    "pluginKey": "stable-diffusion",
    "description": "Generate photo-realistic images given any text input.",
    "icon": "https://i.imgur.com/Yr466dp.png",
    "authConfig": [
      {
        "authField": "SD_WEBUI_URL",
        "label": "Your Stable Diffusion WebUI API URL",
        "description": "You need to provide the URL of your Stable Diffusion WebUI API. For instructions on how to obtain this, see <a href='url'>Our Docs</a>."
      }
    ]
  },
  ```
  
  Each of the fields of the "plugin" object are important. Follow this format strictly. If your plugin requires authentication, you will add those details under `authConfig` as an array since there could be multiple authentication variables. See the Calculator plugin for an example of one that doesn't require authentication, where the authConfig is an empty array (an array is always required).
  
  **Note:** as mentioned earlier, the `pluginKey` matches the class `name` of the Tool class you made.
  **Note:** the `authField` prop must match the process.env variable name
  
  Here is an example of a plugin with more than one credential variable
  ```json
  [
  {
    "name": "Google",
    "pluginKey": "google",
    "description": "Use Google Search to find information about the weather, news, sports, and more.",
    "icon": "https://i.imgur.com/SMmVkNB.png",
    "authConfig": [
      {
        "authField": "GOOGLE_CSE_ID",
        "label": "Google CSE ID",
        "description": "This is your Google Custom Search Engine ID. For instructions on how to obtain this, see <a href='https://github.com/danny-avila/LibreChat/blob/main/docs/features/plugins/google_search.md'>Our Docs</a>."
      },
      {
        "authField": "GOOGLE_API_KEY",
        "label": "Google API Key",
        "description": "This is your Google Custom Search API Key. For instructions on how to obtain this, see <a href='https://github.com/danny-avila/LibreChat/blob/main/docs/features/plugins/google_search.md'>Our Docs</a>."
      }
    ]
  },
  ```

## Example: WolframAlphaAPI Tool

Here's another example of a custom tool, the `WolframAlphaAPI` tool. This tool uses the `axios` module to make HTTP requests to the Wolfram Alpha API.

```javascript
const axios = require('axios');
const { Tool } = require('langchain/tools');

class WolframAlphaAPI extends Tool {
  constructor(fields) {
    super();
    this.name = 'wolfram';
    this.apiKey = fields.WOLFRAM_APP_ID || this.getAppId();
    this.description = `Access computation, math, curated knowledge & real-time data through wolframAlpha...`;
  }

  async fetchRawText(url) {
    try {
      const response = await axios.get(url, { responseType: 'text' });
      return response.data;
    } catch (error) {
      console.error(`Error fetching raw text: ${error}`);
      throw error

    }
  }

  getAppId() {
    const appId = process.env.WOLFRAM_APP_ID || '';
    if (!appId) {
      throw new Error('Missing WOLFRAM_APP_ID environment variable.');
    }
    return appId;
  }

  createWolframAlphaURL(query) {
    const formattedQuery = query.replaceAll(/`/g, '').replaceAll(/\n/g, ' ');
    const baseURL = 'https://www.wolframalpha.com/api/v1/llm-api';
    const encodedQuery = encodeURIComponent(formattedQuery);
    const appId = this.apiKey || this.getAppId();
    const url = `${baseURL}?input=${encodedQuery}&appid=${appId}`;
    return url;
  }

  async _call(input) {
    try {
      const url = this.createWolframAlphaURL(input);
      const response = await this.fetchRawText(url);
      return response;
    } catch (error) {
      if (error.response && error.response.data) {
        console.log('Error data:', error.response.data);
        return error.response.data;
      } else {
        console.log(`Error querying Wolfram Alpha`, error.message);
        return 'There was an error querying Wolfram Alpha.';
      }
    }
  }
}

module.exports = WolframAlphaAPI;
```

In this example, the `WolframAlphaAPI` class has helper methods like `fetchRawText`, `getAppId`, and `createWolframAlphaURL` to handle specific tasks. The `_call` method makes an HTTP request to the Wolfram Alpha API and returns the response.

---

## [Go Back to ReadMe](../../../README.md)
