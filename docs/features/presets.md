# Guide to Using the "Presets" Feature

The "presets" feature in our app is a powerful tool that allows users to save and load predefined settings for their conversations. Users can import and export these presets as JSON files, set a default preset, and share them with others on Discord.

![image](https://github.com/danny-avila/LibreChat/assets/32828263/8c39ad89-71ae-42c6-a792-3db52d539fcd)

## Create a Preset:

- Go in the model settings
![image](https://github.com/danny-avila/LibreChat/assets/32828263/069a42d3-dfd1-4a61-b051-e15b43cb3a5a)

- Choose the model, give it a name, some custom instructions, and adjust the parameters if needed

![image](https://github.com/danny-avila/LibreChat/assets/32828263/090dc065-f9ea-4a43-9380-e6d504e64992)

- Test it

![image](https://github.com/danny-avila/LibreChat/assets/32828263/8a383495-0d5e-4ab7-93a7-eca5388c3f6f)

- Go back in the model advanced settings, and tweak it if needed. When you're happy with the result, click on `Save As Preset` (from the model advanced settings)

![image](https://github.com/danny-avila/LibreChat/assets/32828263/96fd88ec-b4b6-4de0-a7d7-f156fdace354)

- Give it a proper name, and click save

![image](https://github.com/danny-avila/LibreChat/assets/32828263/76ad8db4-a949-4633-8a5f-f9e8358d57f3)

- Now you can select it from the preset menu! 

![image](https://github.com/danny-avila/LibreChat/assets/32828263/81271990-2739-4f5c-b1a5-7d7deeaa385c)

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

![image](https://github.com/danny-avila/LibreChat/assets/32828263/b9ef56e2-393e-45eb-b72b-8d568a13a015)

To export a preset, first go in the preset menu, then click on the button to edit the selected preset, then in the bottom of the preset settings you'll have the option to export it.

![image](https://github.com/danny-avila/LibreChat/assets/32828263/c48b8808-cf7a-414b-8ec5-c631848e6488)

## Setting Default Preset

Choose a preset as default so it loads automatically whenever you start a new conversation. This saves time if you often use specific settings.

![image](https://github.com/danny-avila/LibreChat/assets/32828263/f0f289e6-f6dc-423d-aa00-d9854a8cf004)
![image](https://github.com/danny-avila/LibreChat/assets/32828263/dd5bebad-d96d-4356-83a3-11ee6f101a90)

## Sharing on Discord

Join us on [discord](https://discord.librechat.ai) and see our **[#presets ](https://discord.com/channels/1086345563026489514/1093249324797935746)** channel where thousands of presets are shared by users worldwide. Check out pinned posts for popular presets!