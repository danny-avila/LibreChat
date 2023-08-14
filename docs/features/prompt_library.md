## LibreChat Prompt Library

If you want to share prompts between users, the prompt library is the best way to do this. 

This is different to "presets" which are similar but are only for a single user.

## How to use

Add all the prompts you to the `/prompts/` folder in the project root. These files will be excluded from version control, making it safe to add files as needed without creating merge issues later.

We recommend using separate git repositories to manage your prompts. This allows you to either share them with the public or keep them private in your own private repo. It also allows for greater collaboration as your friends/coworkers can make PRs with new prompts.

## Shared Prompt Library

To get you started, we have a huge library of prompts available at: https://github.com/ClaraLeigh/PromptLibrary

This library will be maintained and updated with new prompts as we find them. To update your local version, simply `cd` into the folder to manage it like any git project. For more information, please [see the project's README file](https://github.com/ClaraLeigh/PromptLibrary).

Example installation:

```shell
cd ~/Sites/LibreChat # This is where your LibreChat project is located
git clone git@github.com:ClaraLeigh/PromptLibrary.git prompts/General-Library
```

## Tagging Prompts

There are three ways that prompts get tagged:
1. The folder name is added as a tag, if one exists
2. If the filename has a dash, everything before the dash is added as a tag. Example: `example-Prompt_name.json` will have the tag `example`
3. You can add a `tags` key to the json file and add an array of tags to it.

## File Structure

We have intentionally used the same file structure that you would use for presets. This is to make it easier to switch between the two. See the [Shared Prompt Library](#shared-prompt-library) for examples 

## Future Versions

Future versions of this prompt library will be changed and improved. Starting with better search functionality. There is also plans to allow you to save a whole conversation as a prompt, as this can help with priming responses.