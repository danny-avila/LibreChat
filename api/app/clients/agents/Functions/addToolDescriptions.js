const addToolDescriptions = (prefix, tools) => {
  const text = tools.reduce((acc, tool) => {
    const { name, description_for_model } = tool;
    if (!description_for_model) {
      return acc;
    }
    return acc + `${name}\n${description_for_model}\n`;
  }, '# Tools:\n');

  return `${prefix}\n${text}`;
};

module.exports = addToolDescriptions;
