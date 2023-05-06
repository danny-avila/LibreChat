const CustomZeroShotAgent = require('./customZeroShotAgent');
const CustomGpt4Agent = require('./customGpt4Agent');
const { CustomOutputParser, Gpt4OutputParser } = require('./outputParser');

module.exports = {
  CustomZeroShotAgent,
  CustomGpt4Agent,
  CustomOutputParser,
  Gpt4OutputParser
};