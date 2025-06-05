const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const Group = require('./Group');

let mongoServer;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  const mongoUri = mongoServer.getUri();
  await mongoose.connect(mongoUri);
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

beforeEach(async () => {
  await mongoose.connection.dropDatabase();
  await Group.ensureIndexes();
});

describe('Group Model Tests', () => {
  test('should create a new group with valid data', async () => {
    const groupData = {
      name: 'Test Group',
      source: 'local'
    };
    
    const group = await Group.create(groupData);
    
    expect(group).toBeDefined();
    expect(group._id).toBeDefined();
    expect(group.name).toBe(groupData.name);
    expect(group.source).toBe(groupData.source);
    expect(group.memberIds).toEqual([]);
  });

  test('should create a group with members', async () => {
    const userId1 = new mongoose.Types.ObjectId();
    const userId2 = new mongoose.Types.ObjectId();
    
    const groupData = {
      name: 'Test Group with Members',
      source: 'local',
      memberIds: [userId1, userId2]
    };
    
    const group = await Group.create(groupData);
    
    expect(group).toBeDefined();
    expect(group.memberIds).toHaveLength(2);
    expect(group.memberIds[0].toString()).toBe(userId1.toString());
    expect(group.memberIds[1].toString()).toBe(userId2.toString());
  });

  test('should create an Entra ID group', async () => {
    const groupData = {
      name: 'Entra Group',
      source: 'entra',
      idOnTheSource: 'entra-id-12345'
    };
    
    const group = await Group.create(groupData);
    
    expect(group).toBeDefined();
    expect(group.source).toBe('entra');
    expect(group.idOnTheSource).toBe(groupData.idOnTheSource);
  });

  test('should fail when creating an Entra group without idOnTheSource', async () => {
    const groupData = {
      name: 'Invalid Entra Group',
      source: 'entra'
      // Missing idOnTheSource
    };
    
    await expect(Group.create(groupData)).rejects.toThrow();
  });

  test('should fail when creating a group with an invalid source', async () => {
    const groupData = {
      name: 'Invalid Source Group',
      source: 'invalid_source'
    };
    
    await expect(Group.create(groupData)).rejects.toThrow();
  });

  test('should fail when creating a group without a name', async () => {
    const groupData = {
      source: 'local'
      // Missing name
    };
    
    await expect(Group.create(groupData)).rejects.toThrow();
  });

  test('should enforce unique idOnTheSource for same source', async () => {
    const groupData1 = {
      name: 'First Entra Group',
      source: 'entra',
      idOnTheSource: 'duplicate-id'
    };
    
    const groupData2 = {
      name: 'Second Entra Group',
      source: 'entra',
      idOnTheSource: 'duplicate-id' // Same as above
    };
    
    await Group.create(groupData1);
    await expect(Group.create(groupData2)).rejects.toThrow();
  });

  test('should not enforce unique idOnTheSource across different sources', async () => {
    // This test is hypothetical as we currently only have 'local' and 'entra' sources,
    // and 'local' doesn't require idOnTheSource
    const groupData1 = {
      name: 'Entra Group',
      source: 'entra',
      idOnTheSource: 'test-id'
    };
    
    // Simulate a future source type
    
    const groupData2 = {
      name: 'Other Source Group',
      source: 'local',
      idOnTheSource: 'test-id' // Same as above but different source
    };
    
    await Group.create(groupData1);
    
    // This should succeed because the uniqueness constraint includes both idOnTheSource and source
    const group2 = await Group.create(groupData2);
    expect(group2).toBeDefined();
    expect(group2.source).toBe('local');
    expect(group2.idOnTheSource).toBe(groupData2.idOnTheSource);
  });
});