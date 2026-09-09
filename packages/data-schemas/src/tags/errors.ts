export class ConversationTagUpdateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConversationTagUpdateError';
  }
}

export class ConversationTagNotFoundError extends Error {
  constructor() {
    super('Tag not found');
    this.name = 'ConversationTagNotFoundError';
  }
}

export class ConversationNotFoundError extends Error {
  constructor() {
    super('Conversation not found');
    this.name = 'ConversationNotFoundError';
  }
}
