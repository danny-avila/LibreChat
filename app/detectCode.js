const { ModelOperations } = require('@vscode/vscode-languagedetection');
const codeRegex = /(```[\s\S]*?```)/g;
const languageMatch = /```(\w+)/;

const detectCode = async (text) => {
  try {
    if (!text.match(codeRegex)) {
      // console.log('disqualified for non-code match')
      return text;
    }

    if (text.match(languageMatch)) {
      // console.log('disqualified for language match')
      return text;
    }

    // console.log('qualified for code match');
    const modelOperations = new ModelOperations();
    const regexSplit = (await import('../src/utils/regexSplit.mjs')).default;
    const parts = regexSplit(text, codeRegex);

    const output = parts.map(async (part, i) => {
      if (part.match(codeRegex)) {
        const code = part.slice(3, -3);
        const language = await modelOperations.runModel(code);
        return part.replace(/^```/, `\`\`\`${language[0].languageId}`);
      } else {
        // return i > 0 ? '\n' + part : part;
        return part;
      }
    });

    return (await Promise.all(output)).join('');
  } catch (e) {
    console.log('Error in detectCode function\n', e);
    return text;
  }
};

const example3 = {
  text: "By default, the function generates an 8-character password with uppercase and lowercase letters and digits, but no special characters.\n\nTo use this function, simply call it with the desired arguments. For example:\n\n```\n>>> generate_password()\n'wE5pUxV7'\n>>> generate_password(length=12, special_chars=True)\n'M4v&^gJ*8#qH'\n>>> generate_password(uppercase=False, digits=False)\n'zajyprxr'\n``` \n\nNote that the randomness is used to select characters from the available character sets, but the resulting password is always deterministic given the same inputs. This makes the function useful for generating secure passwords that meet specific requirements."
};

const example4 = {
  text: 'here\'s a cool function:\n```\nimport random\nimport string\n\ndef generate_password(length=8, uppercase=True, lowercase=True, digits=True, special_chars=False):\n    """Generate a random password with specified requirements.\n\n    Args:\n        length (int): The length of the password. Default is 8.\n        uppercase (bool): Whether to include uppercase letters. Default is True.\n        lowercase (bool): Whether to include lowercase letters. Default is True.\n        digits (bool): Whether to include digits. Default is True.\n        special_chars (bool): Whether to include special characters. Default is False.\n\n    Returns:\n        str: A random password with the specified requirements.\n    """\n    # Define character sets to use in password generation\n    chars = ""\n    if uppercase:\n        chars += string.ascii_uppercase\n    if lowercase:\n        chars += string.ascii_lowercase\n    if digits:\n        chars += string.digits\n    if special_chars:\n        chars += string.punctuation\n\n    # Generate the password\n    password = "".join(random.choice(chars) for _ in range(length))\n    return password\n```\n\nThis function takes several arguments'
};

// write an immediately invoked function to test this
// (async () => {
//   const result = await detectCode(example3.text);
//   console.log(result);
// })();

module.exports = detectCode;
