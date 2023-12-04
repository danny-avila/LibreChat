module.exports = (req) => req?.ip?.replace(/:\d+[^:]*$/, '');
