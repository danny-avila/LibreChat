# How to add a language to LibreChat

## Minimum Requirements:

1. Good knowledge of the language (some terms may undergo significant changes during translation)
2. An editor, which can be Notepad or (**recommended**: [VSCode](https://code.visualstudio.com/download))

## Language translation


1. Fork the LibreChat repository and download it using git clone https://github.com/danny-avila/LibreChat
2. Navigate to the client\src\localization folder and open the "Translation.tsx" file
3. At the beginning of the code, add your language below all the others in this format:

`import Language-name from './languages/** ';`

For example, let's take English as an example:

Note: Replace "LanguageName" with the name of your language (capitalized) and "**" with the ISO 3166 Alpha-2 code of your country (the initial of the nation). 
If you don't know the ISO 3166 code for your language, check it [here](https://en.wikipedia.org/wiki/List_of_ISO_3166_country_codes) and also use it with an initial capital)

4. Further down in the code, add the following

`if (langCode === '**') return Language-name;` 

Replace "**" with the ISO 3166 Alpha-2 code of your language (in lowercase). Here's an example: `if (langCode === 'en') return English;`)

7.Go into the "languages" folder and create a file named as follows: **.tsx

For example: En.tsx

9. Copy all the content from En.tsx into your file and modify it as follows:

```
// your-language-name phrases

export default {
  com_ui_examples: 'Examples',
  // Add more translations here
```

Rename only the part after the colon ":" to the corresponding translation in your language. For example:

```
// my-language phrases

export default {
  com_ui_examples: 'WORD_THAT_I_TRANSLATE_IN_TO_MY_LANGUAGE',
  // Add more translations here
};
```

⚠️DO NOT CHANGE com_... ⚠️

10. Commit your changes using git add *, git commit -m "Language translation: your-language translation" and git push.
11. Open your repository in a browser and click on "Contribute"

![image](https://github.com/Berry-13/LibreChat/assets/81851188/ab91cf4b-1830-4419-9d0c-68fcb2fd5f5e)

13. Answer all the questions, and in the "Type of Change" section, add `- [x] Translation support`
14. Create a pull request 🎉
