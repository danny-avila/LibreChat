class TrieNode {
  constructor() {
    this.children = {};
    this.isEndOfWord = false;
  }
}

class Trie {
  constructor() {
    this.root = new TrieNode();
  }

  insert(word) {
    let currentNode = this.root;

    for (let i = 0; i < word.length; i++) {
      const char = word[i];
      if (!currentNode.children[char]) {
        currentNode.children[char] = new TrieNode();
      }
      currentNode = currentNode.children[char];
    }

    currentNode.isEndOfWord = true;
  }

  search(word) {
    let currentNode = this.root;

    for (let i = 0; i < word.length; i++) {
      const char = word[i];
      if (!currentNode.children[char]) {
        return false;
      }
      currentNode = currentNode.children[char];
    }

    return currentNode.isEndOfWord;
  }
}

function splitWords(text, trie) {
  const tokens = [];
  let currentToken = '';
  let stopToken = '';
  let stopFlag = 'none';

  for (let i = 0; i < text.length; i++) {
    const char = text[i];

    if (trie.search(char)) {
      stopFlag = 'first';
      stopToken = char;
      if (currentToken !== '') {
        if (currentToken.length > 1) tokens.push(currentToken);
        currentToken = '';
      }
    } else {
      if (stopFlag !== 'none') {
        stopFlag = 'next';
        stopToken += char;
      }
      currentToken += char;
    }

    if (stopFlag === 'next') {
      if (trie.search(stopToken)) {
        if (currentToken !== '') {
          currentToken = '';
          stopToken = '';
          stopFlag = 'none';
        }
      } else {
        stopToken = char;
        stopFlag = 'none';
      }
    }
  }

  if (currentToken !== '') {
    tokens.push(currentToken);
  }

  return tokens;
}
const fs = require('fs');

const { Buffer } = require('buffer');

// Replace the file paths with the actual paths to your files
const sensitiveWordsFilePath = '/Users/phe/WebstormProjects/aitok/LibreChat/api/server/controllers/sensitive-text/sw.txt';
const stopWordsFilePath = '/Users/phe/WebstormProjects/aitok/LibreChat/api/server/controllers/sensitive-text/stw.txt';

function initializeTrieFromFile(file) {
  const lexiconData = fs.readFileSync(file, 'utf-8');
  const lexiconWords = lexiconData.split('\n').map(word => word.trim());

  const trie = new Trie();
  for (const word of lexiconWords) {
    const decodedWord = Buffer.from(word, 'base64').toString('utf-8');
    trie.insert(decodedWord);
  }

  return trie;
}

let gSensitiveWordsTrie = null;
let gStopWordsTrie = null;

function isIncludeSensitiveWords(text) {
  if (!gSensitiveWordsTrie || !gStopWordsTrie) {
    const sensitiveWordsTrie = initializeTrieFromFile(sensitiveWordsFilePath);
    const stopWordsTrie = initializeTrieFromFile(stopWordsFilePath);

    gSensitiveWordsTrie = sensitiveWordsTrie;
    gStopWordsTrie = stopWordsTrie;
  }

  const words = splitWords(text, gStopWordsTrie);
  for (const word of words) {
    if (gSensitiveWordsTrie.search(word)) {
      return true;
    }
  }

  return false;
}



module.exports = {
  Trie,
  splitWords,
  initializeTrieFromFile,
  isIncludeSensitiveWords
};