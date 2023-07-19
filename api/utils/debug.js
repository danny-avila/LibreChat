const levels = {
  NONE: 0,
  LOW: 1,
  MEDIUM: 2,
  HIGH: 3,
};

let level = levels.HIGH;

module.exports = {
  levels,
  setLevel: (l) => (level = l),
  log: {
    parameters: (parameters) => {
      if (levels.HIGH > level) return;
      console.group();
      parameters.forEach((p) => console.log(`${p.name}:`, p.value));
      console.groupEnd();
    },
    functionName: (name) => {
      if (levels.MEDIUM > level) return;
      console.log(`\nEXECUTING: ${name}\n`);
    },
    flow: (flow) => {
      if (levels.LOW > level) return;
      console.log(`\n\n\nBEGIN FLOW: ${flow}\n\n\n`);
    },
    variable: ({ name, value }) => {
      if (levels.HIGH > level) return;
      console.group();
      console.group();
      console.log(`VARIABLE ${name}:`, value);
      console.groupEnd();
      console.groupEnd();
    },
    request: () => (req, res, next) => {
      if (levels.HIGH > level) return next();
      console.log('Hit URL', req.url, 'with following:');
      console.group();
      console.log('Query:', req.query);
      console.log('Body:', req.body);
      console.groupEnd();
      return next();
    },
  },
};
