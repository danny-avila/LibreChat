import { Schema, Document } from 'mongoose';

export interface IBanner extends Document {
  bannerId: string;
  message: string;
  displayFrom: Date;
  displayTo?: Date;
  type: 'banner' | 'popup';
  isPublic: boolean;
  persistable: boolean;
  /** BKL: 공지 팝업 제목 (type='popup' 용) */
  title?: string;
}

const bannerSchema = new Schema<IBanner>(
  {
    bannerId: {
      type: String,
      required: true,
    },
    message: {
      type: String,
      required: true,
    },
    displayFrom: {
      type: Date,
      required: true,
      default: Date.now,
    },
    displayTo: {
      type: Date,
    },
    type: {
      type: String,
      enum: ['banner', 'popup'],
      default: 'banner',
    },
    isPublic: {
      type: Boolean,
      default: false,
    },
    persistable: {
      type: Boolean,
      default: false,
    },
    /** BKL: 공지 팝업 제목 */
    title: {
      type: String,
    },
  },
  { timestamps: true },
);

export default bannerSchema;
