# Guide to Using the "Presets" Feature

The "presets" feature in our app is a powerful tool that allows users to save and load predefined settings for their conversations. Users can import and export these presets as JSON files, set a default preset, and share them with others on Discord.

## Parameters Explained:

- **Preset Name:**
  - This is where you name your preset for easy identification.

- **Endpoint:**
  - Choose the endpoint, such as openAI, that you want to use for processing the conversation.

- **Model:**
  - Select the model like `gpt-3.5-turbo` that will be used for generating responses.

- **Custom Name:**
  - Optionally provide a custom name for your preset. This is the name that will be shown in the UI when using it.

- **Prompt Prefix:**
  - Define instructions or guidelines that will be displayed before each prompt to guide the user in providing input.

- **Temperature:**
  - Adjust this parameter to control the randomness of the model's output. A higher value makes the output more random, while a lower value makes it more focused and deterministic.

- **Top P:**
  - Control the nucleus sampling parameter to influence the diversity of generated text. Lower values make text more focused while higher values increase diversity.

- **Frequency Penalty:**
  - Use this setting to penalize frequently occurring tokens and promote diversity in responses.

- **Presence Penalty:**
   - Adjust this parameter to penalize new tokens that are introduced into responses, controlling repetition and promoting consistency.

## Importing/Exporting Presets

You can easily import or export presets as JSON files by clicking on either 'Import' or 'Export' buttons respectively. This allows you to share your customized settings with others or switch between different configurations quickly.

## Setting Default Preset

Choose a preset as default so it loads automatically whenever you start a new conversation. This saves time if you often use specific settings.

## Sharing on Discord

Join us on [discord](https://discord.librechat.ai) and see our **[#presets ](https://discord.com/channels/1086345563026489514/1093249324797935746)** channel where thousands of presets are shared by users worldwide. Check out pinned posts for popular configurations!