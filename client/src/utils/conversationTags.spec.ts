import type { TConversationTagsResponse } from 'librechat-data-provider';
import { updateConversationTag } from './conversationTags';

describe('ConversationTag Utilities', () => {
  let conversations: TConversationTagsResponse;

  beforeEach(() => {
    conversations = [
      {
        title: 'saved',
        count: 1,
        position: 0,
        description: 'description1',
        updatedAt: '2023-04-01T12:00:00Z',
        createdAt: '2023-04-01T12:00:00Z',
        user: 'user1',
      },
      {
        title: 'title1',
        count: 1,
        position: 1,
        description: 'description1',
        updatedAt: '2023-04-01T12:00:00Z',
        createdAt: '2023-04-01T12:00:00Z',
        user: 'user1',
      },
      {
        title: 'title2',
        count: 20,
        position: 2,
        description: 'description2',
        updatedAt: new Date().toISOString(),
        createdAt: '2023-04-01T12:00:00Z',
        user: 'user1',
      },
      {
        title: 'title3',
        count: 30,
        position: 3,
        description: 'description3',
        updatedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        user: 'user1',
      },
      {
        title: 'title4',
        count: 40,
        position: 4,
        description: 'description4',
        updatedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        user: 'user1',
      },
      {
        title: 'title5',
        count: 50,
        position: 5,
        description: 'description5',
        updatedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        user: 'user1',
      },
    ];
  });

  describe('updateConversationTag', () => {
    it('updates the first tag correctly', () => {
      const updated = updateConversationTag(
        conversations,
        { title: 'title1-new', description: 'description1-new' },
        {
          ...conversations[1],
          title: 'title1-new',
          description: 'description1-new',
        },
        'title1',
      );

      expect(updated[0].title).toBe('saved');
      expect(updated[0].position).toBe(0);
      expect(updated[1].title).toBe('title1-new');
      expect(updated[1].description).toBe('description1-new');
      expect(updated[1].position).toBe(1);
      expect(updated[2].title).toBe('title2');
      expect(updated[2].position).toBe(2);
      expect(updated[3].title).toBe('title3');
      expect(updated[3].position).toBe(3);
      expect(updated[4].title).toBe('title4');
      expect(updated[4].position).toBe(4);
      expect(updated[5].title).toBe('title5');
      expect(updated[5].position).toBe(5);
    });
  });
  it('updates the third tag correctly', () => {
    const updated = updateConversationTag(
      conversations,
      { title: 'title3-new', description: 'description3-new' },
      {
        ...conversations[3],
        title: 'title3-new',
        description: 'description3-new',
      },
      'title3',
    );

    expect(updated[0].title).toBe('saved');
    expect(updated[0].position).toBe(0);
    expect(updated[1].title).toBe('title1');
    expect(updated[1].position).toBe(1);
    expect(updated[2].title).toBe('title2');
    expect(updated[2].position).toBe(2);
    expect(updated[3].title).toBe('title3-new');
    expect(updated[3].description).toBe('description3-new');
    expect(updated[3].position).toBe(3);
    expect(updated[4].title).toBe('title4');
    expect(updated[4].position).toBe(4);
    expect(updated[5].title).toBe('title5');
    expect(updated[5].position).toBe(5);
  });

  it('updates the order of other tags if the order of the tags is moving up', () => {
    const updated = updateConversationTag(
      conversations,
      // move title3 to the second position
      { position: 2 },
      {
        ...conversations[3],
        position: 2,
      },
      'title3',
    );

    expect(updated[0].title).toBe('saved');
    expect(updated[0].position).toBe(0);
    expect(updated[1].title).toBe('title1');
    expect(updated[1].position).toBe(1);
    expect(updated[2].title).toBe('title3');
    expect(updated[2].position).toBe(2);
    expect(updated[3].title).toBe('title2');
    expect(updated[3].position).toBe(3);
    expect(updated[4].title).toBe('title4');
    expect(updated[4].position).toBe(4);
    expect(updated[5].title).toBe('title5');
    expect(updated[5].position).toBe(5);
  });

  it('updates the order of other tags if the order of the tags is moving down', () => {
    const updated = updateConversationTag(
      conversations,
      // move title3 to the last position
      { position: 5 },
      {
        ...conversations[3],
        position: 5,
      },
      'title3',
    );

    expect(updated[0].title).toBe('saved');
    expect(updated[0].position).toBe(0);
    expect(updated[1].title).toBe('title1');
    expect(updated[1].position).toBe(1);
    expect(updated[2].title).toBe('title2');
    expect(updated[2].position).toBe(2);
    expect(updated[3].title).toBe('title4');
    expect(updated[3].position).toBe(3);
    expect(updated[4].title).toBe('title5');
    expect(updated[4].position).toBe(4);
    expect(updated[5].title).toBe('title3');
    expect(updated[5].position).toBe(5);
  });

  it('updates the order of other tags if new tag is added', () => {
    const updated = updateConversationTag(
      conversations,
      { title: 'newTitle', description: 'newDescription' },
      {
        title: 'newTitle',
        description: 'newDescription',
        position: 1,
        updatedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        user: 'user1',
        count: 30,
      },
      // no tag title specified
    );

    expect(updated[0].title).toBe('saved');
    expect(updated[0].position).toBe(0);
    expect(updated[1].title).toBe('newTitle');
    expect(updated[1].description).toBe('newDescription');
    expect(updated[1].position).toBe(1);
    expect(updated[2].title).toBe('title1');
    expect(updated[2].position).toBe(2);
    expect(updated[3].title).toBe('title2');
    expect(updated[3].position).toBe(3);
    expect(updated[4].title).toBe('title3');
    expect(updated[4].position).toBe(4);
    expect(updated[5].title).toBe('title4');
    expect(updated[5].position).toBe(5);
    expect(updated[6].title).toBe('title5');
    expect(updated[6].position).toBe(6);
  });

  it('returns a new array for new tag if no tags exist', () => {
    const updated = updateConversationTag(
      [],
      { title: 'newTitle', description: 'newDescription' },
      {
        title: 'saved',
        description: 'newDescription',
        position: 1,
        updatedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        user: 'user1',
        count: 30,
      },
      // no tag title specified
    );

    expect(updated[0].title).toBe('saved');
    expect(updated[0].position).toBe(0);
  });
});
