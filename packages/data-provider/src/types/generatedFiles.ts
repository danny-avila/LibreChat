export enum FileGenSource {
  document_generator = 'document_generator',
  image_generation = 'image_generation',
}

export enum FileGenType {
  pdf = 'pdf',
  markdown = 'markdown',
  image = 'image',
}

export type TGeneratedFile = {
  _id?: string;
  user: string;
  conversationId?: string;
  messageId?: string;
  filename: string;
  filepath: string;
  mimeType: string;
  size: number;
  type: FileGenType;
  source: FileGenSource;
  title?: string;
  createdAt?: string;
  updatedAt?: string;
};
