const { Tool } = require('langchain/tools');

class AIPluginTool extends Tool {
  get name() {
    return this._name;
  }

  get description() {
    return this._description;
  }

  constructor(params) {
    super();
    this._name = params.name;
    this._description = params.description;
    this.apiSpec = params.apiSpec;
  }

  /** @ignore */
  async _call(_input) {
    return this.apiSpec;
  }

  static async fromPluginUrl(url) {
    const aiPluginRes = await fetch(url);
    if (!aiPluginRes.ok) {
      throw new Error(
        `Failed to fetch plugin from ${url} with status ${aiPluginRes.status}`
      );
    }
    const aiPluginJson = await aiPluginRes.json();

    const apiUrlRes = await fetch(aiPluginJson.api.url);
    if (!apiUrlRes.ok) {
      throw new Error(
        `Failed to fetch API spec from ${aiPluginJson.api.url} with status ${apiUrlRes.status}`
      );
    }
    const apiUrlJson = await apiUrlRes.text();

    return new AIPluginTool({
      name: aiPluginJson.name_for_model,
      description: `Call this tool to get the OpenAPI spec (and usage guide) for interacting with the ${aiPluginJson.name_for_human} API. You should only call this ONCE! What is the ${aiPluginJson.name_for_human} API useful for? ${aiPluginJson.description_for_human}`,
      apiSpec: `Usage Guide: ${aiPluginJson.description_for_model}

OpenAPI Spec: ${apiUrlJson}`,
    });
  }
}

module.exports = AIPluginTool;