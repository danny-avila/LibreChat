import dotenv from 'dotenv';
dotenv.config({
  path: './',
});
import { OpenAIEmbeddings } from '@langchain/openai';
import { HNSWLib } from '@langchain/community/vectorstores/hnswlib';
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
import * as fs from 'fs';
import * as path from 'path';

export const storeEmbeddings = async (modulePath: string) => {
  try {
    const text = fs.readFileSync(modulePath, 'utf8');
    const textSplitter = new RecursiveCharacterTextSplitter({ chunkSize: 600 });
    const docs = await textSplitter.createDocuments([text]);
    const vectorStore = await HNSWLib.fromDocuments(docs, new OpenAIEmbeddings());
    const directory = `./config/translations/stores/${path.basename(modulePath)}`;

    if (!fs.existsSync(directory)) {
      fs.mkdirSync(directory, { recursive: true });
      console.log(`Directory created: ${directory}`);
    } else {
      console.log(`Directory already exists: ${directory}`);
      return;
    }

    await vectorStore.save(directory);
  } catch (error) {
    console.error('Error storing embeddings');
    console.error(error);
  }
};

export const loadEmbeddings = async (modulePath: string) => {
  try {
    const directory = `./config/translations/stores/${path.basename(modulePath)}`;
    const loadedVectorStore = await HNSWLib.load(directory, new OpenAIEmbeddings());
    return loadedVectorStore;
  } catch (error) {
    console.error('Error loading embeddings');
    console.error(error);
  }
};
