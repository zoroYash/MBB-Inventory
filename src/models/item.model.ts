import mongoose, { Document, Schema } from 'mongoose';
import { ICategory } from './category.model';

export interface IItem extends Document {
  barcode: string;
  category: mongoose.Types.ObjectId | ICategory;
  status: 'available' | 'sold';
  soldAt?: Date;
  soldBy?: mongoose.Types.ObjectId;
  invoiceId?: mongoose.Types.ObjectId; 
}

const itemSchema = new Schema<IItem>(
  {
    barcode: { type: String, required: true, unique: true, index: true },
    category: { type: Schema.Types.ObjectId, ref: 'Category', required: true },
    status: { type: String, enum: ['available', 'sold'], default: 'available', index: true },
    soldAt: { type: Date },
    soldBy: { type: Schema.Types.ObjectId, ref: 'User' },
    invoiceId: { type: Schema.Types.ObjectId, ref: 'Invoice' },
  },
  { timestamps: true }
);

export const Item = mongoose.model<IItem>('Item', itemSchema);
