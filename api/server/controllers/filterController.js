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
const path = require('path');

// Replace the file paths with the actual paths to your files
const sensitiveWordsFilePath = path.resolve(__dirname, '/Users/phe/WebstormProjects/aitok/LibreChat/api/server/controllers/sensitive-text/sw.txt');
const stopWordsFilePath = path.resolve(__dirname, '/Users/phe/WebstormProjects/aitok/LibreChat/api/server/controllers/sensitive-text/stw.txt');

function initializeTrieFromFile(file) {
  const lexiconData = fs.readFileSync(file, 'utf-8');
  const lexiconWords = lexiconData.split('\n').map(word => word.trim());

  const trie = new Trie();
  for (const word of lexiconWords) {
    trie.insert(word);
  }

  return trie;
}

let gSensitiveWordsTrie = null;
let gStopWordsTrie = null;

function isIncludeSensitiveWords(text) {
  console.log('filterController --- isInclude', text);
  if (!gSensitiveWordsTrie || !gStopWordsTrie) {
    const sensitiveWordsTrie = initializeTrieFromFile(sensitiveWordsFilePath);
    const stopWordsTrie = initializeTrieFromFile(stopWordsFilePath);

    gSensitiveWordsTrie = sensitiveWordsTrie;
    gStopWordsTrie = stopWordsTrie;
  }

  const words = splitWords(text, gStopWordsTrie);
  for (const word of words) {
    if (gSensitiveWordsTrie.search(word)) {
      console.log(`敏感词: ${word}`);
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