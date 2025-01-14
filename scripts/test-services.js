const { MongoClient } = require('mongodb');
const axios = require('axios');
const { Client } = require('pg');

async function testMongoDB() {
  try {
    const client = await MongoClient.connect('mongodb://localhost:27017');
    await client.connect();
    console.log('✅ MongoDB is accessible');
    await client.close();
  } catch (error) {
    console.error('❌ MongoDB connection failed:', error.message);
  }
}

async function testMeilisearch() {
  try {
    const response = await axios.get('http://localhost:7700/health');
    if (response.status === 200) {
      console.log('✅ Meilisearch is accessible');
    }
  } catch (error) {
    console.error('❌ Meilisearch health check failed:', error.message);
  }
}

async function testVectorDB() {
  const client = new Client({
    host: 'localhost',
    port: 5432,
    user: 'myuser',
    password: 'mypassword',
    database: 'mydatabase'
  });

  try {
    await client.connect();
    console.log('✅ VectorDB (PostgreSQL) is accessible');
    await client.end();
  } catch (error) {
    console.error('❌ VectorDB connection failed:', error.message);
  }
}

async function testRAGAPI() {
  try {
    const response = await axios.get('http://localhost:8000/health');
    if (response.status === 200) {
      console.log('✅ RAG API is accessible');
    }
  } catch (error) {
    console.error('❌ RAG API health check failed:', error.message);
  }
}

async function main() {
  console.log('Testing service accessibility...\n');
  await testMongoDB();
  await testMeilisearch();
  await testVectorDB();
  await testRAGAPI();
}

main().catch(console.error);
