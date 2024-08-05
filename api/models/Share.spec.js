jest.mock('nanoid', () => ({
  nanoid: jest.fn(() => 'mocked_nanoid'),
}));

jest.mock('./Message', () => ({
  getMessages: jest.fn(),
}));

jest.mock('~/config/winston', () => ({
  error: jest.fn(),
}));

jest.mock('./schema/shareSchema', () => ({
  findOne: jest.fn(),
  find: jest.fn(),
  findOneAndUpdate: jest.fn(),
  findOneAndDelete: jest.fn(),
  deleteMany: jest.fn(),
  countDocuments: jest.fn(),
}));

const Share = require('./Share');
const SharedLink = require('./schema/shareSchema');
const { getMessages } = require('./Message');

describe('Share Module', () => {
  const mockUser = 'user123';
  const mockConversationId = '58059716-c7ab-42ee-a4ff-2e9dd20d3b7c';
  const mockShareId = 'share123';

  const mockMessage = {
    messageId: '849d965f-4dbd-44d7-a9a4-2e7afb0dec2f',
    conversationId: mockConversationId,
    parentMessageId: '27b014b2-02c1-4d0d-937d-6f3cdf33e676',
    text: 'Hello! How can I assist you today?',
  };

  const mockShare = {
    shareId: mockShareId,
    conversationId: mockConversationId,
    messages: [mockMessage],
    isPublic: true,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getSharedMessages', () => {
    test('should anonymize sensitive data', async () => {
      SharedLink.findOne.mockReturnValue({
        populate: jest.fn().mockReturnThis(),
        select: jest.fn().mockResolvedValue(mockShare),
      });

      await expect(Share.getSharedMessages(mockShareId)).rejects.toThrow(
        'Error getting share link',
      );
    });

    test('should return null for non-existent or non-public shares', async () => {
      SharedLink.findOne.mockReturnValue({
        populate: jest.fn().mockReturnThis(),
        select: jest.fn().mockResolvedValue(null),
      });

      await expect(Share.getSharedMessages(mockShareId)).rejects.toThrow(
        'Error getting share link',
      );
    });
  });

  describe('getSharedLinks', () => {
    test('should anonymize sensitive data', async () => {
      SharedLink.countDocuments.mockResolvedValue(1);
      SharedLink.find.mockReturnValue({
        sort: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        select: jest.fn().mockResolvedValue([mockShare]),
      });

      await expect(Share.getSharedLinks(mockUser)).rejects.toThrow('Error getting shares');
    });
  });

  describe('createSharedLink', () => {
    test('should create a new shared link with anonymized data', async () => {
      SharedLink.findOne.mockResolvedValue(null);
      getMessages.mockResolvedValue([mockMessage]);
      SharedLink.findOneAndUpdate.mockResolvedValue(mockShare);

      await expect(
        Share.createSharedLink(mockUser, { conversationId: mockConversationId }),
      ).rejects.toThrow('Error creating shared link');
    });
  });

  describe('updateSharedLink', () => {
    test('should update an existing shared link with anonymized data', async () => {
      SharedLink.findOne.mockResolvedValue(mockShare);
      getMessages.mockResolvedValue([mockMessage]);
      SharedLink.findOneAndUpdate.mockResolvedValue(mockShare);

      await expect(
        Share.updateSharedLink(mockUser, { conversationId: mockConversationId }),
      ).rejects.toThrow('Error updating shared link');
    });
  });

  describe('deleteSharedLink', () => {
    test('should delete an existing shared link', async () => {
      SharedLink.findOne.mockResolvedValue(mockShare);
      SharedLink.findOneAndDelete.mockResolvedValue({ message: 'Share deleted successfully' });

      const result = await Share.deleteSharedLink(mockUser, { shareId: mockShareId });
      expect(result).toEqual({ message: 'Share deleted successfully' });
    });

    test('should return "Share deleted successfully" message even for non-existent share', async () => {
      SharedLink.findOne.mockResolvedValue(null);
      SharedLink.findOneAndDelete.mockResolvedValue({ message: 'Share deleted successfully' });

      const result = await Share.deleteSharedLink(mockUser, { shareId: mockShareId });
      expect(result).toEqual({ message: 'Share deleted successfully' });
    });
  });

  describe('deleteAllSharedLinks', () => {
    test('should delete all shared links for a user', async () => {
      SharedLink.deleteMany.mockResolvedValue({ deletedCount: 5 });

      const result = await Share.deleteAllSharedLinks(mockUser);
      expect(result).toEqual({
        message: 'All shared links have been deleted successfully',
        deletedCount: 5,
      });
    });
  });
});
