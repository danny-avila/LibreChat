// Progressive chip state manager: tracks make/model/deck/rake/year collection status
// Usage: const { ChipStateManager } = require('./extensions/progressiveChipState');
// Standalone; no UI framework coupling.

class ChipStateManager {
  constructor({ make, model, deck, rake, year } = {}) {
    this.state = {
      make: { value: make || null, status: make ? 'valid' : 'pending' },
      model: { value: model || null, status: model ? 'valid' : 'pending' },
      deck: { value: deck || null, status: deck ? 'valid' : 'pending' },
      rake: { value: rake || null, status: rake ? 'valid' : 'pending' },
      year: { value: year || null, status: year ? 'valid' : 'optional' },
    };
  }

  update(field, value, status = 'valid') {
    if (!this.state[field]) return;
    this.state[field] = { value: value || null, status: value ? status : 'pending' };
  }

  isComplete() {
    const required = ['make', 'model', 'rake'];
    return required.every((f) => this.state[f]?.status === 'valid');
  }

  getNextMissing() {
    const order = ['make', 'model', 'rake', 'deck'];
    for (const f of order) {
      if (this.state[f]?.status === 'pending') return f;
    }
    return null;
  }

  toJSON() {
    return { ...this.state };
  }

  serialize() {
    return Object.entries(this.state)
      .filter(([_, v]) => v.value)
      .map(([k, v]) => `${k}:${v.value}`)
      .join('|');
  }

  static fromSerialized(str) {
    const parts = (str || '').split('|').filter(Boolean);
    const init = {};
    parts.forEach((p) => {
      const [k, v] = p.split(':');
      if (k && v) init[k] = v;
    });
    return new ChipStateManager(init);
  }
}

module.exports = { ChipStateManager };
