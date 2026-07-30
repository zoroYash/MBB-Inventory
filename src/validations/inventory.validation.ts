import { z } from 'zod';

export const createCategorySchema = z.object({
  body: z.object({
    name: z.string().min(2, 'Category name must be at least 2 characters'),
    price: z.number().min(0, 'Price cannot be negative'),
    profitMargin: z.number().min(0).optional().default(0),
    imageUrl: z.string().url('Invalid image URL').optional().or(z.literal('')),
  }),
});

export const updateCategorySchema = z.object({
  body: z.object({
    name: z.string().min(2).optional(),
    price: z.number().min(0).optional(),
    profitMargin: z.number().min(0).optional(),
    // quantity: z.number().min(0).optional(),
    imageUrl: z.string().url().optional().or(z.literal('')),
  }),
});

export const addItemsSchema = z.object({
  body: z.object({
    categoryId: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid Category ID'),
    barcodes: z.array(z.string().min(1, 'Barcode cannot be empty')).min(1, 'At least one barcode is required'),
  }),
});

export const sellItemsSchema = z.object({
  body: z.object({
    barcodes: z.array(z.string().min(1, 'Barcode cannot be empty')).min(1, 'At least one barcode is required'),
    sellingPrice: z.number().min(0, 'Selling price cannot be negative').optional(),
  }),
});


export const getItemsSchema = z.object({
    query: z.object({
      page: z.string().regex(/^\d+$/).optional(),
      limit: z.string().regex(/^\d+$/).optional(),
      search: z.string().optional(), // For barcode search
      status: z.enum(['available', 'sold']).optional(),
      categoryId: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid Category ID').optional(),
      sortBy: z.string().optional(),
      sortOrder: z.enum(['asc', 'desc']).optional(),
    }),
  });

export const getInvoicesSchema = z.object({
  query: z.object({
    page: z.string().regex(/^\d+$/).optional(),
    limit: z.string().regex(/^\d+$/).optional(),
    search: z.string().optional(), 
    startDate: z.string().optional(),
    endDate: z.string().optional(),
    sortBy: z.string().optional(),
    sortOrder: z.enum(['asc', 'desc']).optional(),
  }),
});

export const getTodaySalesSchema = z.object({
  query: z.object({
    page: z.string().regex(/^\d+$/).optional(),
    limit: z.string().regex(/^\d+$/).optional(),
    search: z.string().optional(), 
      categoryId: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid Category ID').optional(),
      sortBy: z.string().optional(),
      sortOrder: z.enum(['asc', 'desc']).optional(),
    }),
  });


  export const getAllSalesSchema = z.object({
    query: z.object({
      page: z.string().regex(/^\d+$/).optional(),
      limit: z.string().regex(/^\d+$/).optional(),
      search: z.string().optional(), // Search items sold
      categoryId: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid Category ID').optional(),
      startDate: z.string().optional(),
      endDate: z.string().optional(),
      sortBy: z.string().optional(),
      sortOrder: z.enum(['asc', 'desc']).optional(),
    }),
  });

export const getBatchItemDetailsSchema = z.object({
  body: z.object({
    barcodes: z.array(z.string().min(1, 'Barcode cannot be empty'))
      .min(1, 'At least one barcode is required')
      .max(50, 'Cannot fetch more than 50 items at once to maintain performance'),
  }),
});