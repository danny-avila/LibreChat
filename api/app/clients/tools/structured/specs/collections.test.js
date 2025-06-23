// __tests__/collections.test.js
// Unit tests for the Collections tool

// IMPORTANT: Keep the jest.mock calls BEFORE requiring the module under test

// Mock the `pg` module so no real database connection is attempted
jest.mock('pg', () => {
  const queryMock = jest.fn().mockResolvedValue({ rows: [] });

  const clientMock = {
    query: queryMock,
    release: jest.fn(),
  };

  const poolMock = {
    connect: jest.fn().mockResolvedValue(clientMock),
    query: queryMock,
  };

  return { Pool: jest.fn(() => poolMock) };
});

// Mock axios used for embeddings so no external HTTP calls are made
jest.mock('axios', () => ({
  post: jest.fn().mockResolvedValue({ data: { embedding: new Array(1536).fill(0.1) } }),
}));

const Collections = require('../Collections');

// Sample objects reused across tests
const sampleCollection = {
  id: 'col1',
  user_id: 'user123',
  name: 'Test Collection',
  description: 'Testing description',
  parent_id: null,
  tags: ['tag1'],
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

const updatedCollection = {
  ...sampleCollection,
  name: 'Updated Collection',
  updated_at: new Date(Date.now() + 1000).toISOString(),
};

const sampleNote = {
  id: 'note1',
  collection_id: sampleCollection.id,
  title: 'Sample Note',
  content: 'Some content for the sample note',
  source_url: 'http://example.com',
  tags: ['tag1'],
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

describe('Collections Tool', () => {
  let tool;

  beforeAll(() => {
    tool = new Collections();
    // Provide user context expected by the tool
    tool.setUserId('user123');
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('create_collection action succeeds with required fields', async () => {
    jest.spyOn(tool, 'createCollection').mockResolvedValue(sampleCollection);

    const result = await tool.call({
      action: 'create_collection',
      collection_name: sampleCollection.name,
      collection_description: sampleCollection.description,
      collection_tags: sampleCollection.tags,
    });

    const parsed = JSON.parse(result);
    expect(parsed.success).toBe(true);
    expect(parsed.collection.id).toBe(sampleCollection.id);
    expect(parsed.collection.name).toBe(sampleCollection.name);
  });

  test('create_collection without collection_name returns error', async () => {
    const result = await tool.call({
      action: 'create_collection',
    });

    const parsed = JSON.parse(result);
    expect(parsed).toHaveProperty('error');
    expect(parsed.error).toMatch(/collection_name is required/);
  });

  test('update_collection succeeds and returns updated data', async () => {
    jest.spyOn(tool, 'updateCollection').mockResolvedValue(updatedCollection);

    const result = await tool.call({
      action: 'update_collection',
      collection_id: updatedCollection.id,
      collection_name: updatedCollection.name,
    });

    const parsed = JSON.parse(result);
    expect(parsed.success).toBe(true);
    expect(parsed.collection.name).toBe(updatedCollection.name);
    expect(parsed.collection.id).toBe(updatedCollection.id);
  });

  test('update_collection without collection_id returns error', async () => {
    const result = await tool.call({
      action: 'update_collection',
      collection_name: 'Should Fail',
    });

    const parsed = JSON.parse(result);
    expect(parsed).toHaveProperty('error');
    expect(parsed.error).toMatch(/collection_id is required/);
  });

  test('list_collections returns an array of collections', async () => {
    jest.spyOn(tool, 'listCollections').mockResolvedValue([sampleCollection]);

    const result = await tool.call({
      action: 'list_collections',
      limit: 10,
    });

    const parsed = JSON.parse(result);
    expect(parsed.success).toBe(true);
    expect(Array.isArray(parsed.collections)).toBe(true);
    expect(parsed.collections.length).toBe(1);
    expect(parsed.collections[0].id).toBe(sampleCollection.id);
  });

  test('search_collections without search_query returns error', async () => {
    const result = await tool.call({
      action: 'search_collections',
    });

    const parsed = JSON.parse(result);
    expect(parsed).toHaveProperty('error');
    expect(parsed.error).toMatch(/search_query is required/);
  });

  test('add_note action succeeds and returns note data', async () => {
    jest.spyOn(tool, 'addNote').mockResolvedValue(sampleNote);

    const result = await tool.call({
      action: 'add_note',
      collection_id: sampleCollection.id,
      note_title: sampleNote.title,
      note_content: sampleNote.content,
      note_source_url: sampleNote.source_url,
      note_tags: sampleNote.tags,
    });

    const parsed = JSON.parse(result);
    expect(parsed.success).toBe(true);
    expect(parsed.note.id).toBe(sampleNote.id);
    expect(parsed.note.title).toBe(sampleNote.title);
  });

  test('add_note without required fields returns error', async () => {
    const result = await tool.call({
      action: 'add_note',
      collection_id: sampleCollection.id,
    });

    const parsed = JSON.parse(result);
    expect(parsed).toHaveProperty('error');
    expect(parsed.error).toMatch(/collection_id, note_title, and note_content are required/);
  });

  test('search_notes without search_query returns error', async () => {
    const result = await tool.call({
      action: 'search_notes',
      search_mode: 'keyword',
    });

    const parsed = JSON.parse(result);
    expect(parsed).toHaveProperty('error');
    expect(parsed.error).toMatch(/search_query is required/);
  });

  test('delete_note succeeds and returns confirmation', async () => {
    jest.spyOn(tool, 'deleteNote').mockResolvedValue(sampleNote);

    const result = await tool.call({
      action: 'delete_note',
      note_id: sampleNote.id,
    });

    const parsed = JSON.parse(result);
    expect(parsed.success).toBe(true);
    expect(parsed.deleted_note_id).toBe(sampleNote.id);
  });

  test('unknown action returns error message', async () => {
    const result = await tool.call({
      action: 'non_existent_action',
    });

    const parsed = JSON.parse(result);
    expect(parsed).toHaveProperty('error');
    expect(parsed.error).toMatch(/Unknown action/);
  });
}); 