import mongoose, { Document, Schema } from 'mongoose';

export interface IBulkUploadSession extends Document {
  uploadedBy: mongoose.Types.ObjectId;
  status: 'processing' | 'completed' | 'failed';
  totalRows: number;
  created: number;
  skipped: number;
  errorCount: number;
  summary: {
    total: number;
    created: number;
    skipped: number;
  };
  rowErrors: {
    reason: string;
    row?: any;
  }[];
}

const bulkUploadSessionSchema = new Schema<IBulkUploadSession>(
  {
    uploadedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    status: { type: String, enum: ['processing', 'completed', 'failed'], default: 'processing' },
    totalRows: { type: Number, default: 0 },
    created: { type: Number, default: 0 },
    skipped: { type: Number, default: 0 },
    errorCount: { type: Number, default: 0 },
    summary: {
      total: { type: Number, default: 0 },
      created: { type: Number, default: 0 },
      skipped: { type: Number, default: 0 },
    },
    rowErrors: [
      {
        reason: { type: String, required: true },
        row: { type: Schema.Types.Mixed },
      },
    ],
  },
  { timestamps: true }
);

// Don't fetch massive rowErrors arrays when listing sessions
bulkUploadSessionSchema.index({ uploadedBy: 1, createdAt: -1 });

export const BulkUploadSession = mongoose.model<IBulkUploadSession>(
  'BulkUploadSession',
  bulkUploadSessionSchema
);