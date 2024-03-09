---
title: 🌍 Contribute a Translation
description: How to add a new language to LibreChat.
weight: -8
---
# How to add a new language to LibreChat 🌍

## Minimum Requirements:

1. Good knowledge of the language (some terms may undergo significant changes during translation)
2. A text editor is required. While options like Notepad or Notepad++ are available, it is recommended to use **[VSCode](https://code.visualstudio.com/download)** as it is more suitable for this task..

## Language Translation

### Preparation
Fork the [LibreChat repository](https://github.librechat.ai) and download it using git clone 

### Add your language to `Translation.tsx`:
- Navigate to the `client\src\localization` folder and open the `Translation.tsx` file

- At the beginning of the code, add your language below all the others in this format:

  `import Language-name from './languages/** ';`

  Example (English):`import English from './languages/Eng';`

- Further down in the code, add in the language mapping, the following:

  `'**-**': LanguageName,` 

> Replace `**-**` with the local identifier of your language (ask ChatGPT or search it on Google). 

> Replace `LanguageName` with the name of your language. 

Example (English): `'en-US': English,`

### Create your new language file
- Go into the `client\src\localization\languages` folder and create a file named as follows: `**.tsx`

  Example: `Eng.tsx`

- Copy all the content from `Eng.tsx` into your file and modify it as follows:

  ```js
  // your-language-name phrases

  export default {
    com_ui_examples: 'Examples',
    // more translations here...
  ```

  __Translate only the part after the `:`.__ 
  Example:

  ```js
  // my-language phrases

  export default {
    com_ui_examples: 'This is a translated example',
    // Add more translations here
  };
  ```

  ⚠️ Do not modify the `com_...` part ⚠️

### Delete the Language list after `com_nav_setting_general: 'General',` near the bottom of the file (You do not need to translate the individual language names), except for `com_nav_setting_data: 'Data controls'` (you need to translate it)


### Add your language to `Eng.tsx`
Open `Eng.tsx` and add your language to the language list in the bottom of the document.

### Add your language to the menu
To add your language to the menu, open the file `client\src\components\Nav\SettingsTabs\General.tsx`. 
Add your language to the `LangSelector` variable in the following way:

```js
export const LangSelector = ({
  //other code
        <option value="en-US">{localize(lang, 'com_nav_lang_english')}</option>
        //other languages...
        <option value="**">{localize(lang, 'com_nav_lang_your-language-name')}</option>
      </select>
    </div>
  );
};
```

Where `**-**` is the local identifier of your language and `com_nav_lang_your-language-name` stands for the name of your language. 
Example: `com_nav_lang_english` or `com_nav_lang_italian`

**You should only need to add one line of code:**
```js
<option value="**-**">{localize(lang, 'com_nav_lang_your-language-name')}</option>
```

### Summary
If you followed everything you should have __one__ new file and __3__ files with modifications:

```bash
        new file:   client/src/localization/languages/**.tsx            <-----new language
        modified:   client/src/components/Nav/SettingsTabs/General.tsx
        modified:   client/src/localization/Translation.tsx
        modified:   client/src/localization/languages/Eng.tsx
```

You can confirm this by using the following command: `git status`

### Commit and create a new PR
- Commit your changes using:
    - `git add *` 
    - `git commit -m "Language translation: your-language translation"`
    - `git push`

- Open your repository in a browser and click on "Contribute"

![image](https://github.com/Berry-13/LibreChat/assets/81851188/ab91cf4b-1830-4419-9d0c-68fcb2fd5f5e)

- Answer all the questions, and in the "Type of Change" section, add `- [x] Translation support`
- Delete irrelevant comments from the template
- Create a pull request 🎉
