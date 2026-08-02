import mongoose, { Document, Schema } from 'mongoose';

export interface ICategory extends Document {
  name: string;
  price: number; // MRP / Default selling price
  profitMargin?: number; // In rupees
  imageUrl?: string;
  quantity: number;
  isActive: boolean; 
}

const categorySchema = new Schema<ICategory>(
  {
    name: { type: String, required: true, unique: true, trim: true },
    price: { type: Number, required: true, min: 0 },
    profitMargin: { type: Number, default: 0, min: 0 },
    imageUrl: { type: String, default: null },
    quantity: { type: Number, default: 0, min: 0 },
    isActive: { type: Boolean, default: true, index: true },
  },
  { timestamps: true }
);

// Index for text search optimization
categorySchema.index({ name: 'text' });

export const Category = mongoose.model<ICategory>('Category', categorySchema);
