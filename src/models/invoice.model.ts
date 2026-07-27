import mongoose, { Document, Schema } from 'mongoose';

export interface IInvoice extends Document {
  invoiceNumber: string;
  totalAmount: number; // Sum of the default prices of all items
  sellingPrice: number; // What the customer actually paid
  discount: number; // totalAmount - sellingPrice
  totalProfit: number; // Sum of category profit margins - discount
  soldBy: mongoose.Types.ObjectId;
  items: mongoose.Types.ObjectId[]; // References to sold items
}

const invoiceSchema = new Schema<IInvoice>(
  {
    invoiceNumber: { type: String, required: true, unique: true, index: true },
    totalAmount: { type: Number, required: true, min: 0 },
    sellingPrice: { type: Number, required: true, min: 0 },
    discount: { type: Number, default: 0 },
    totalProfit: { type: Number, required: true },
    soldBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    items: [{ type: Schema.Types.ObjectId, ref: 'Item' }],
  },
  { timestamps: true }
);

export const Invoice = mongoose.model<IInvoice>('Invoice', invoiceSchema);