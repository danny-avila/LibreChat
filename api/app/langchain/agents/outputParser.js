const { ZeroShotAgentOutputParser } = require('langchain/agents');

class CustomOutputParser extends ZeroShotAgentOutputParser {
  constructor(fields) {
    super(fields);
    this.tools = fields.tools;
    this.longestToolName = '';
    for (const tool of this.tools) {
      if (tool.name.length > this.longestToolName.length) {
        this.longestToolName = tool.name;
      }
    }
    this.finishToolNameRegex = /(?:the\s+)?final\s+answer[:\s]*\s*/i;
  }

  async parse(text) {
    const finalMatch = text.match(this.finishToolNameRegex);
    // if (text.includes(this.finishToolName)) {
    //   const parts = text.split(this.finishToolName);
    //   const output = parts[parts.length - 1].trim();
    //   return {
    //     returnValues: { output },
    //     log: text
    //   };
    // }

    if (finalMatch) {
      const output = text.substring(finalMatch.index + finalMatch[0].length).trim();
      return {
        returnValues: { output },
        log: text
      };
    }
    // const match = /Action: (.*)\nAction Input: (.*)/s.exec(text); // old
    // const match = /Action: ([\s\S]*?)(?:\nAction Input: ([\s\S]*?))?$/.exec(text); //old
    const match = /(?:Action(?: 1)?:) ([\s\S]*?)(?:\n(?:Action Input(?: 1)?:) ([\s\S]*?))?$/.exec(text); //new
    if (!match || (match && match[1].trim() === 'N/A') || (match && !match[2])) {
      console.log('\n\n<----------------------HIT PARSING ERROR---------------------->\n\n');
      const thought = text
        .replace(/[tT]hought:/, '')
        .split('\n')[0]
        .trim();
      return {
        tool: 'self-reflection',
        toolInput: thought + "\nI should finalize my reply as soon as I have satisfied the user's query.",
        log: ''
      };
    }

    if (match && match[1].trim().length > this.longestToolName.length) {
      console.log('\n\n<----------------------HIT PARSING ERROR---------------------->\n\n');

      let action, input, thought;
      let firstIndex = Infinity;

      for (const tool of this.tools) {
        const { name } = tool;
        const toolIndex = text.indexOf(name);
        if (toolIndex !== -1 && toolIndex < firstIndex) {
          firstIndex = toolIndex;
          action = name;
        }
      }

      if (action) {
        const actionEndIndex = text.indexOf('Action:', firstIndex + action.length);
        const inputText = text
          .slice(firstIndex + action.length, actionEndIndex !== -1 ? actionEndIndex : undefined)
          .trim();
        const inputLines = inputText.split('\n');
        input = inputLines[0];
        if (inputLines.length > 1) {
          thought = inputLines.slice(1).join('\n');
        }
        return {
          tool: action,
          toolInput: input,
          log: thought || inputText
        };
      } else {
        console.log('No valid tool mentioned.', this.tools, text);
        return {
          tool: 'self-reflection',
          toolInput: 'Hypothetical actions: \n"' + text + '"\n',
          log: 'Thought: I need to look at my hypothetical actions and try one'
        };
      }

      // if (action && input) {
      //   console.log('Action:', action);
      //   console.log('Input:', input);
      // }
    }

    return {
      tool: match[1].trim(),
      toolInput: match[2].trim().replace(/^"+|"+$/g, '') ?? '',
      log: text
    };
  }
}

class Gpt4OutputParser extends ZeroShotAgentOutputParser {
  constructor(fields) {
    super(fields);
    this.tools = fields.tools;
    this.longestToolName = '';
    for (const tool of this.tools) {
      if (tool.name.length > this.longestToolName.length) {
        this.longestToolName = tool.name;
      }
    }
    this.finishToolNameRegex = /(?:the\s+)?final\s+answer[:\s]*\s*/i;
    this.actionInputRegex = /(?:Action Input(?: 1)?:) ([\s\S]*?)(?:\n(?:Action Input(?: 1)?:) ([\s\S]*?))?$/;
  }

  async parse(text) {
    const finalMatch = text.match(this.finishToolNameRegex);
    // if (text.includes(this.finishToolName)) {
    //   const parts = text.split(this.finishToolName);
    //   const output = parts[parts.length - 1].trim();
    //   return {
    //     returnValues: { output },
    //     log: text
    //   };
    // }

    if (finalMatch) {
      const output = text.substring(finalMatch.index + finalMatch[0].length).trim();
      return {
        returnValues: { output },
        log: text
      };
    }

    const match = /(?:Action(?: 1)?:) ([\s\S]*?)(?:\n(?:Action Input(?: 1)?:) ([\s\S]*?))?$/.exec(text); //new
    if (match && match[1].trim() === 'N/A') {
      console.log('\n\n<----------------------HIT N/A PARSING ERROR---------------------->\n\n', match);
      return {
        tool: 'self-reflection',
        toolInput: match[2].trim().replace(/^"+|"+$/g, '') ?? '',
        log: text
      };
    }
    if (!match || (match && !match[2])) {
      console.log(
        '\n\n<----------------------HIT NO ACTION INPUT PARSING ERROR---------------------->\n\n',
        match
      );
      const thoughts = text.replace(/[tT]hought:/, '').split('\n');
      return {
        tool: 'self-reflection',
        toolInput: thoughts[0],
        log: thoughts.slice(1).join('\n')
      };
    }

    if (match && match[1].trim().length > this.longestToolName.length) {
      console.log('\n\n<----------------------HIT LONG PARSING ERROR---------------------->\n\n');

      let action, input, thought;
      let firstIndex = Infinity;

      for (const tool of this.tools) {
        const { name } = tool;
        const toolIndex = text.indexOf(name);
        if (toolIndex !== -1 && toolIndex < firstIndex) {
          firstIndex = toolIndex;
          action = name;
        }
      }

      if (action) {
        const actionEndIndex = text.indexOf('Action:', firstIndex + action.length);
        const inputText = text
          .slice(firstIndex + action.length, actionEndIndex !== -1 ? actionEndIndex : undefined)
          .trim();
        const inputLines = inputText.split('\n');
        input = inputLines[0];
        if (inputLines.length > 1) {
          thought = inputLines.slice(1).join('\n');
        }
        const returnValues = {
          tool: action,
          toolInput: input,
          log: thought || inputText
        };

        const inputMatch = this.actionInputRegex.exec(returnValues.log); //new
        if (inputMatch) {
          console.log('inputMatch');
          console.dir(inputMatch, { depth: null });
          returnValues.toolInput = inputMatch[1].replaceAll('"', '').trim();
          returnValues.log = returnValues.log.replace(this.actionInputRegex, '');
        }

        return returnValues;
      } else {
        console.log('No valid tool mentioned.', this.tools, text);
        return {
          tool: 'self-reflection',
          toolInput: 'Hypothetical actions: \n"' + text + '"\n',
          log: 'Thought: I need to look at my hypothetical actions and try one'
        };
      }

      // if (action && input) {
      //   console.log('Action:', action);
      //   console.log('Input:', input);
      // }
    }

    return {
      tool: match[1].trim(),
      toolInput: match[2].trim().replace(/^"+|"+$/g, '') ?? '',
      log: text
    };
  }
}

module.exports = { CustomOutputParser, Gpt4OutputParser };
