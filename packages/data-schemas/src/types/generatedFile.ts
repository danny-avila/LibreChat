import { Document, Types } from 'mongoose';

export interface IGeneratedFile extends Omit<Document, 'model'> {
  user: Types.ObjectId;
  conversationId?: string;
  messageId?: string;
  filename: string;
  filepath: string;
  mimeType: string;
  size: number;
  type: 'pdf' | 'markdown' | 'image';
  source: 'document_generator' | 'image_generation';
  title?: string;
  createdAt?: Date;
  updatedAt?: Date;
}
