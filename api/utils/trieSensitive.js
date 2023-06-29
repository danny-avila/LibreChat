// trie.js
class TrieNode {
  constructor() {
    this.children = {};
    this.isEndOfWord = false;
  }
}
  
class TrieSensitive {
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
  
  static splitWords(text, trie) {
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
  
  static async initializeFromFile(file) {
    if (!TrieSensitive.instanceFromFile) {
      const fs = require('fs').promises;
      const lexiconData = await fs.readFile(file, 'utf-8');
      const lexiconWords = lexiconData.split('\n').map(word => word);
      
      const trie = new TrieSensitive();
      for (const word of lexiconWords) {
        trie.insert(word);
      }
      
      TrieSensitive.instanceFromFile = trie;
    }
    
    return TrieSensitive.instanceFromFile;
  }
  
  static async initializeFromBase64File(file) {
    if (!TrieSensitive.instanceFromBase64File) {
      const fs = require('fs').promises;
      const lexiconData = await fs.readFile(file, 'utf-8');
      const lexiconWords = lexiconData.split('\n').map(word => Buffer.from(word, 'base64').toString('utf-8'));
      
      const trie = new TrieSensitive();
      for (const word of lexiconWords) {
        trie.insert(word);
      }
      
      TrieSensitive.instanceFromBase64File = trie;
    }
    
    return TrieSensitive.instanceFromBase64File;
  }
    
  static async checkSensitiveWords(text) {
    const path = require('path');
    const sensitiveWordsTrie = await TrieSensitive.initializeFromBase64File(path.resolve(__dirname, 'sw.txt'));
    const stopWordsTrie = await TrieSensitive.initializeFromFile(path.resolve(__dirname, 'stw.txt'));
    
    const words = TrieSensitive.splitWords(text, stopWordsTrie);
    for (const word of words) {
      if (sensitiveWordsTrie.search(word)) {
        console.log(`敏感词: ${word}`);
        return true;
      }
    }
    
    return false;
  }
}
  
module.exports = TrieSensitive;
  