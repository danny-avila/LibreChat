const { processImageFile, processFileUpload } = require('~/server/services/Files/process');
const { getStrategyFunctions } = require('~/server/services/Files/strategies');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const { File } = require('~/db/models');

jest.mock('~/server/services/Files/strategies', () => {
  return { getStrategyFunctions: jest.fn() };
});

describe('File Process', () => {
  let mongoServer;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    const mongoUri = mongoServer.getUri();
    await mongoose.connect(mongoUri);
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  test('processImageFile() handles temporary files', async () => {
    const now = new Date();

    const mockHandleImageUpload = jest.fn().mockReturnValue({
      filepath: 'ignore',
      bytes: 1,
      width: 1,
      height: 1,
    });
    getStrategyFunctions.mockImplementation(() => {
      return { handleImageUpload: mockHandleImageUpload };
    });

    // Fake an image file upload request
    const file = { originalname: 'test.txt' };
    const file_id = new mongoose.Types.ObjectId();
    const endpoint = 'the_endpoint';
    const temporary = true;
    const req = {
      file,
      config: {},
      user: { id: new mongoose.Types.ObjectId() },
    };
    const res = { status: jest.fn().mockReturnValue({ json: jest.fn() }) };
    const metadata = {
      file_id,
      temp_file_id: new mongoose.Types.ObjectId(),
      endpoint,
      temporary,
    };

    await processImageFile({ req, res, metadata });

    // Verify that handleImageUpload() called w/ temporary metadata
    expect(mockHandleImageUpload).toHaveBeenCalledWith({
      req,
      file,
      file_id,
      endpoint,
      temporary,
    });

    // Verify that MongoDB File has expiresAt set (and is after now)
    const dbFile = await File.findOne({ file_id });
    expect(dbFile.expiresAt).not.toBeNull();
    expect(dbFile.expiresAt - now).toBeGreaterThan(0);
  });

  test('processFileUpload() handles temporary files', async () => {
    const now = new Date();

    const mockHandleFileUpload = jest.fn().mockReturnValue({
      filepath: 'ignore',
      bytes: 1,
    });
    getStrategyFunctions.mockImplementation(() => {
      return { handleFileUpload: mockHandleFileUpload };
    });

    // Fake a file upload request
    const file = { originalname: 'test.txt' };
    const file_id = new mongoose.Types.ObjectId();
    const temporary = true;
    const req = {
      file,
      config: {},
      user: { id: new mongoose.Types.ObjectId() },
    };
    const res = { status: jest.fn().mockReturnValue({ json: jest.fn() }) };
    const metadata = {
      file_id,
      temp_file_id: new mongoose.Types.ObjectId(),
      temporary,
    };

    await processFileUpload({ req, res, metadata });

    // Verify that handleFileUpload() called w/ temporary metadata
    expect(mockHandleFileUpload).toHaveBeenCalledWith({
      req,
      file,
      file_id,
      openai: undefined,
      temporary,
    });

    // Verify that MongoDB File has expiresAt set (and is after now)
    const dbFile = await File.findOne({ file_id });
    expect(dbFile.expiresAt).not.toBeNull();
    expect(dbFile.expiresAt - now).toBeGreaterThan(0);
  });
});
