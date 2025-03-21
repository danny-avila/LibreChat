import { Schema, Document } from 'mongoose';

export interface ICategory extends Document {
  label: string;
  value: string;
}

const categoriesSchema = new Schema<ICategory>({
  label: {
    type: String,
    required: true,
    unique: true,
  },
  value: {
    type: String,
    required: true,
    unique: true,
  },
});

export default categoriesSchema;
