const { ZeroShotAgent } = require('langchain/agents');

class CustomZeroShotAgent extends ZeroShotAgent {
  constructor(input) {
    super(input);
  }

  _stop() {
    return [`\n${this.observationPrefix()}`,`\nObservation 1:`, `\nObservation:`];
  }
}

module.exports = CustomZeroShotAgent;