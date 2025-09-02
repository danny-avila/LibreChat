const addToolDescriptions = (prefix, tools) => {
  const text = tools.reduce((acc, tool) => {
    const { name, description_for_model, lc_kwargs } = tool;
    const description = description_for_model ?? lc_kwargs?.description_for_model;
    if (!description) {
      return acc;
    }
    return acc + `## ${name}\n${description}\n`;
  }, '# Tools:\n');

  return `${prefix}\n${text}`;
};

module.exports = addToolDescriptions;
