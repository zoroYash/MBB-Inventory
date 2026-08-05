import { Request, Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import { Category } from '../models/category.model';
import { Item } from '../models/item.model';
import { Invoice } from '../models/invoice.model';
import { AppError } from '../utils/AppError';
import { asyncHandler } from '../utils/asyncHandler';
import { sendSuccess } from '../utils/responseHandler';
import { parse } from 'csv-parse/sync';
import { BulkUploadSession } from '../models/bulkUploadSession.model';
// =======================
// CATEGORY MANAGEMENT
// =======================

export const createCategory = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  let existingCategory = await Category.findOne({ name: req.body.name });
  if (existingCategory) {
    if (!existingCategory.isActive) {
      const reactivatedCategory = await Category.findByIdAndUpdate(
        existingCategory._id,
        { ...req.body, isActive: true },
        { new: true, runValidators: true }
      );
      return sendSuccess(res, 200, reactivatedCategory, 'Category reactivated successfully');
    } else {
    return next(new AppError('Category with this name already exists', 400));
    }
  }

  const category = await Category.create({ ...req.body, isActive: true });
  sendSuccess(res, 201, category, 'Category created successfully');
});

export const updateCategory = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  if (req.body.isActive === false) {
    const categoryCheck = await Category.findById(req.params.id);
    if (!categoryCheck) return next(new AppError('Category not found', 404));
    if (categoryCheck.quantity > 0) {
      return next(new AppError('Cannot deactivate a category that has available stock.', 400));
    }
  }

  const category = await Category.findByIdAndUpdate(req.params.id, req.body, {
    new: true,
    runValidators: true,
  });

  if (!category) return next(new AppError('Category not found', 404));
  sendSuccess(res, 200, category, 'Category updated successfully');
});

export const getCategories = asyncHandler(async (req: Request, res: Response) => {
  const { 
    page = 1, 
    limit = 10, 
    search, 
    sortBy = 'createdAt', 
    sortOrder = 'desc', 
    minPrice, 
    maxPrice,
    outOfStock,     
    minQuantity,    
    maxQuantity,
    hideDeactivated
  } = req.query;
  
  const query: any = {};

  if (hideDeactivated === 'true') {
    query.isActive = true;
  }

  if (search) {
    query.name = { $regex: search, $options: 'i' };
  }

  if (minPrice || maxPrice) {
    query.price = {};
    if (minPrice) query.price.$gte = Number(minPrice);
    if (maxPrice) query.price.$lte = Number(maxPrice);
  }

  if (outOfStock === 'true') {
    query.quantity = 0; 
  } else if (minQuantity !== undefined || maxQuantity !== undefined) {
    query.quantity = {};
    if (minQuantity !== undefined) query.quantity.$gte = Number(minQuantity);
    if (maxQuantity !== undefined) query.quantity.$lte = Number(maxQuantity);
  }

  const skip = (Number(page) - 1) * Number(limit);
  const sortDirection = sortOrder === 'asc' ? 1 : -1;

  const [categories, total] = await Promise.all([
    Category.find(query)
      .sort({ [sortBy as string]: sortDirection })
      .skip(skip)
      .limit(Number(limit)),
    Category.countDocuments(query),
  ]);

  sendSuccess(res, 200, {
    categories,
    pagination: { 
      total, 
      page: Number(page), 
      limit: Number(limit), 
      totalPages: Math.ceil(total / Number(limit)) 
    },
  }, 'Categories retrieved');
});

// =======================
// ITEM MANAGEMENT (INVENTORY FLOW)
// =======================

export const addItems = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  const { categoryId, barcodes } = req.body;

  const category = await Category.findById(categoryId);
  if (!category) return next(new AppError('Category not found', 404));

  // Find duplicates within the database
  const existingItems = await Item.find({ barcode: { $in: barcodes } });
  if (existingItems.length > 0) {
    return next(new AppError(`Barcodes already exist: ${existingItems.map(i => i.barcode).join(', ')}`, 400));
  }

  const newItems = barcodes.map((barcode: string) => ({
    barcode,
    category: categoryId,
    status: 'available',
  }));

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    await Item.insertMany(newItems, { session });
    await Category.findByIdAndUpdate(
      categoryId,
      { $inc: { quantity: barcodes.length } },
      { session }
    );

    await session.commitTransaction();
  } catch (error) {
    await session.abortTransaction();
    throw new AppError('Failed to add items.', 500);
  } finally {
    session.endSession();
  }

  sendSuccess(res, 201, null, `${barcodes.length} items added successfully`);
});

export const sellItems = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
    const { barcodes, sellingPrice } = req.body;

    const session = await mongoose.startSession();
    session.startTransaction();

  let invoiceData;

  try {
    const foundItems = await Item.find({ barcode: { $in: barcodes }, status: 'available' })
      .populate('category')
      .session(session);

    if (foundItems.length !== barcodes.length) {
      const foundBarcodes = foundItems.map(i => i.barcode);
      const missingBarcodes = barcodes.filter((b: string) => !foundBarcodes.includes(b));
      throw new AppError(`Items unavailable or not found: ${missingBarcodes.join(', ')}`, 400);
    }

    let totalAmount = 0;
    let totalProfitMargin = 0;
    const categoryQtyDecrements: Record<string, number> = {};
    const itemIds = [];

    // Calculate totals and gather stats
    for (const item of foundItems) {
      const category: any = item.category;
      totalAmount += category.price;
      totalProfitMargin += (category.profitMargin || 0);

      const catId = category._id.toString();
      categoryQtyDecrements[catId] = (categoryQtyDecrements[catId] || 0) + 1;
      itemIds.push(item._id);
    }

    // Determine final pricing
    const finalSellingPrice = sellingPrice ?? totalAmount;
    const discount = totalAmount - finalSellingPrice;
    const totalProfit = totalProfitMargin - discount; // Profit drops if you give a discount

    // 1. Create Invoice
    const [invoice] = await Invoice.create([{
      invoiceNumber: `INV-${Date.now()}`,
      totalAmount,
      sellingPrice: finalSellingPrice,
      discount,
      totalProfit,
      soldBy: req.user?._id,
      items: itemIds,
    }], { session });

    invoiceData = invoice;

    // 2. Update Items
    await Item.updateMany(
      { _id: { $in: itemIds } },
      { $set: { status: 'sold', soldAt: new Date(), soldBy: req.user?._id, invoiceId: invoice._id } },
      { session }
    );

    // 3. Update Categories Quantity
    const categoryBulkOps = Object.keys(categoryQtyDecrements).map(catId => ({
      updateOne: {
        filter: { _id: catId },
        update: { $inc: { quantity: -categoryQtyDecrements[catId] } },
      },
    }));
    await Category.bulkWrite(categoryBulkOps, { session });

    await session.commitTransaction();
  } catch (error: any) {
    await session.abortTransaction();
    if (error instanceof AppError) return next(error);
    return next(new AppError('Failed to process sale. Transaction aborted.', 500));
  } finally {
    session.endSession();
  }

  sendSuccess(res, 200, invoiceData, 'Sale processed and invoice generated successfully.');
});

  export const getItems = asyncHandler(async (req: Request, res: Response) => {
  const { page = 1, limit = 10, search, status, categoryId, sortBy = 'createdAt', sortOrder = 'desc' } = req.query;
  const query: any = {};

  if (search) query.barcode = { $regex: search, $options: 'i' };
  if (status) query.status = status;
  if (categoryId) query.category = categoryId;

  const skip = (Number(page) - 1) * Number(limit);
  const sortDirection = sortOrder === 'asc' ? 1 : -1;

  const [items, total] = await Promise.all([
    Item.find(query).populate('category', 'name price imageUrl').populate('soldBy', 'name email').populate('invoiceId', 'invoiceNumber')
      .sort({ [sortBy as string]: sortDirection }).skip(skip).limit(Number(limit)),
    Item.countDocuments(query),
  ]);

  sendSuccess(res, 200, { items, pagination: { total, page: Number(page), limit: Number(limit), totalPages: Math.ceil(total / Number(limit)) } }, 'Items retrieved');
});

// =======================
// INVOICES & STATS
// =======================

export const getInvoices = asyncHandler(async (req: Request, res: Response) => {
  const { page = 1, limit = 10, search, startDate, endDate, sortBy = 'createdAt', sortOrder = 'desc' } = req.query;
  const query: any = {};

  if (search) query.invoiceNumber = { $regex: search, $options: 'i' };
  
  if (startDate || endDate) {
    query.createdAt = {};
    if (startDate) query.createdAt.$gte = new Date(startDate as string);
    if (endDate) query.createdAt.$lte = new Date(endDate as string);
  }

  const skip = (Number(page) - 1) * Number(limit);
  const sortDirection = sortOrder === 'asc' ? 1 : -1;

  const [invoices, total] = await Promise.all([
    Invoice.find(query).populate('soldBy', 'name email').populate({
        path: 'items',
        select: 'barcode category',
        populate: {
          path: 'category',
          select: 'name price'
        }
      })
      .sort({ [sortBy as string]: sortDirection }).skip(skip).limit(Number(limit)),
    Invoice.countDocuments(query),
  ]);

  sendSuccess(res, 200, {
    invoices,
    pagination: { total, page: Number(page), limit: Number(limit), totalPages: Math.ceil(total / Number(limit)) }
  }, 'Invoices retrieved');
});

export const getTodaySales = asyncHandler(async (req: Request, res: Response) => {
  const { page = 1, limit = 10, search, categoryId, sortBy = 'soldAt', sortOrder = 'desc' } = req.query;
  
  // Define "Today"
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date();
  endOfDay.setHours(23, 59, 59, 999);

  // 1. Get Aggregated Daily Stats from Invoices
  const statsResult = await Invoice.aggregate([
    { $match: { createdAt: { $gte: startOfDay, $lte: endOfDay } } },
    {
      $group: {
        _id: null,
        totalSalesAmount: { $sum: "$sellingPrice" },
        totalDiscount: { $sum: "$discount" },
        totalProfit: { $sum: "$totalProfit" },
        totalItemsSold: { $sum: { $size: "$items" } }
      }
    }
  ]);

  const stats = statsResult[0] || { totalSalesAmount: 0, totalDiscount: 0, totalProfit: 0, totalItemsSold: 0 };
  delete stats._id; // Cleanup

  // 2. Fetch paginated ITEMS sold today
  const itemQuery: any = { status: 'sold', soldAt: { $gte: startOfDay, $lte: endOfDay } };
  if (search) itemQuery.barcode = { $regex: search, $options: 'i' };
  if (categoryId) itemQuery.category = categoryId;

  const skip = (Number(page) - 1) * Number(limit);
  const sortDirection = sortOrder === 'asc' ? 1 : -1;

  const [itemsSoldToday, total] = await Promise.all([
    Item.find(itemQuery).populate('category', 'name price').populate('invoiceId', 'invoiceNumber')
      .sort({ [sortBy as string]: sortDirection }).skip(skip).limit(Number(limit)),
    Item.countDocuments(itemQuery),
  ]);

  sendSuccess(res, 200, {
    stats, // Overarching stats for the day
    items: itemsSoldToday,
    pagination: { total, page: Number(page), limit: Number(limit), totalPages: Math.ceil(total / Number(limit)) }
  }, 'Today\'s sales and stats retrieved');
});


export const getAllSales = asyncHandler(async (req: Request, res: Response) => {
  const { 
    page = 1, 
    limit = 10, 
    search, 
    categoryId, 
    startDate, 
    endDate, 
    sortBy = 'soldAt', 
    sortOrder = 'desc' 
  } = req.query;
  
  const invoiceMatchQuery: any = {};
  const itemQuery: any = { status: 'sold' };

  // Handle Date Filtering
  if (startDate || endDate) {
    invoiceMatchQuery.createdAt = {};
    itemQuery.soldAt = {};

    if (startDate) {
      const start = new Date(startDate as string);
      start.setHours(0, 0, 0, 0); // Start of the day
      invoiceMatchQuery.createdAt.$gte = start;
      itemQuery.soldAt.$gte = start;
    }

    if (endDate) {
      const end = new Date(endDate as string);
      end.setHours(23, 59, 59, 999); // End of the day
      invoiceMatchQuery.createdAt.$lte = end;
      itemQuery.soldAt.$lte = end;
    }
  }

  const statsResult = await Invoice.aggregate([
    { $match: Object.keys(invoiceMatchQuery).length > 0 ? invoiceMatchQuery : {} },
    {
      $group: {
        _id: null,
        totalSalesAmount: { $sum: "$sellingPrice" },
        totalDiscount: { $sum: "$discount" },
        totalProfit: { $sum: "$totalProfit" },
        totalItemsSold: { $sum: { $size: "$items" } }
      }
    }
  ]);

  const stats = statsResult[0] || { totalSalesAmount: 0, totalDiscount: 0, totalProfit: 0, totalItemsSold: 0 };
  delete stats._id; // Cleanup the null _id from aggregation

  // 2. Fetch paginated ITEMS sold
  if (search) itemQuery.barcode = { $regex: search, $options: 'i' };
  if (categoryId) itemQuery.category = categoryId;

  const skip = (Number(page) - 1) * Number(limit);
  const sortDirection = sortOrder === 'asc' ? 1 : -1;

  const [itemsSold, total] = await Promise.all([
    Item.find(itemQuery)
      .populate('category', 'name price')
      .populate('invoiceId', 'invoiceNumber')
      .populate('soldBy', 'name email')
      .sort({ [sortBy as string]: sortDirection })
      .skip(skip)
      .limit(Number(limit)),
    Item.countDocuments(itemQuery),
  ]);

  sendSuccess(res, 200, {
    stats, // Overarching stats for the filtered period (or all-time)
    items: itemsSold,
    pagination: { 
      total, 
      page: Number(page), 
      limit: Number(limit), 
      totalPages: Math.ceil(total / Number(limit)) 
    }
  }, 'Total sales and stats retrieved successfully');
});

export const getBatchItemDetails = asyncHandler(async (req: Request, res: Response) => {
  const { barcodes } = req.body;

  const uniqueBarcodes = [...new Set(barcodes as string[])];

  const items = await Item.find({ barcode: { $in: uniqueBarcodes } })
    .populate('category', 'name price imageUrl')
    .lean(); 

  const availableItems: any[] = [];
  const soldItems: string[] = [];
  const foundBarcodes: string[] = [];

  items.forEach(item => {
    foundBarcodes.push(item.barcode);
    if (item.status === 'available') {
      availableItems.push(item);
    } else {
      soldItems.push(item.barcode); 
    }
  });

  const missingBarcodes = uniqueBarcodes.filter(b => !foundBarcodes.includes(b));

  sendSuccess(res, 200, {
    availableItems,
    soldItems,
    missingBarcodes
  }, 'Batch item details retrieved successfully');
});

export const bulkUploadItems = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  if (!req.file) return next(new AppError('No CSV file provided', 400));

  let records: any[] = [];
  try {
    // Parse CSV synchronously in-memory (safe for limited rows)
    records = parse(req.file.buffer, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    });
  } catch (error) {
    return next(new AppError('Failed to parse CSV file. Ensure it is a valid CSV format.', 400));
  }

  const MAX_ROWS = 2000;
  if (records.length > MAX_ROWS) {
    return next(new AppError(`File exceeds maximum limit of ${MAX_ROWS} rows per upload.`, 400));
  }
  if (records.length === 0) {
    return next(new AppError('CSV file is empty.', 400));
  }

  // 1. Create a processing session
  const sessionDoc = await BulkUploadSession.create({
    uploadedBy: req.user?._id,
    status: 'processing',
    totalRows: records.length,
  });

  const rowErrors: any[] = [];
  const validItemsToInsert: any[] = [];
  const categoryQuantities: Record<string, number> = {};

  try {
    // 2. Map existing categories for quick lookup
    const uniqueCatNamesInCSV = [...new Set(records.map(r => r.categoryName?.trim()).filter(Boolean))];
    const existingCats = await Category.find({
      name: { $regex: new RegExp(`^(${uniqueCatNamesInCSV.join('|')})$`, 'i') }
    });
    
    const categoryMap = new Map<string, string>(); // lowercase name -> ObjectId
    existingCats.forEach(c => categoryMap.set(c.name.toLowerCase(), c._id.toString()));

    // 3. Resolve & Create New Categories if requested (isNewCategory === 'true')
    const categoriesToCreateMap = new Map<string, any>();
    for (const record of records) {
      const cName = record.categoryName?.trim();
      if (!cName) continue;
      const cNameLower = cName.toLowerCase();

      if (!categoryMap.has(cNameLower)) {
        const isNew = record.isNewCategory?.toLowerCase() === 'true' || record.isNewCategory?.toLowerCase() === 'yes';
        if (isNew && !categoriesToCreateMap.has(cNameLower)) {
          categoriesToCreateMap.set(cNameLower, {
            name: cName,
            price: Number(record.price) || 0,
            profitMargin: Number(record.profitMargin) || 0,
            isActive: true,
          });
        }
      }
    }

    // Create the resolved new categories one by one to capture specific validation errors safely
    for (const [cNameLower, catData] of categoriesToCreateMap.entries()) {
      try {
        if (catData.price <= 0) throw new Error('Price is required and must be > 0 for new categories');
        const newCat = await Category.create(catData);
        categoryMap.set(cNameLower, newCat._id.toString());
      } catch (err: any) {
        // If creation fails, we just don't add it to the categoryMap.
        // The rows dependent on this category will fail in step 5 with a clear error.
      }
    }

    // 4. Pre-fetch existing barcodes to prevent DB duplication
    const allBarcodesInCSV = records.map(r => r.barcode?.trim()).filter(Boolean);
    const existingItems = await Item.find({ barcode: { $in: allBarcodesInCSV } }).select('barcode');
    const existingBarcodes = new Set(existingItems.map(i => i.barcode));

    const barcodesInCurrentUpload = new Set<string>();

    // 5. Evaluate rows sequentially in memory
    records.forEach((record, index) => {
      const rowNum = index + 2; // header is row 1
      const barcode = record.barcode?.trim();
      const catName = record.categoryName?.trim();

      // Basic Validation
      if (!barcode) {
        rowErrors.push({ row: record, reason: `Row ${rowNum}: Barcode is missing` });
        return;
      }
      if (!catName) {
        rowErrors.push({ row: record, reason: `Row ${rowNum}: Category name is missing` });
        return;
      }

      // Check intra-CSV duplicates
      if (barcodesInCurrentUpload.has(barcode)) {
        rowErrors.push({ row: record, reason: `Row ${rowNum}: Duplicate barcode '${barcode}' found within the CSV file` });
        return;
      }
      barcodesInCurrentUpload.add(barcode);

      // Check DB duplicates
      if (existingBarcodes.has(barcode)) {
        rowErrors.push({ row: record, reason: `Row ${rowNum}: Barcode '${barcode}' already exists in inventory` });
        return;
      }

      // Check Category
      const catId = categoryMap.get(catName.toLowerCase());
      if (!catId) {
        rowErrors.push({
          row: record,
          reason: `Row ${rowNum}: Category '${catName}' does not exist. (If you meant to create it, set 'isNewCategory' to 'true' and provide a valid 'price' > 0)`,
        });
        return;
      }

      // Record is Valid
      validItemsToInsert.push({ barcode, category: catId, status: 'available' });
      categoryQuantities[catId] = (categoryQuantities[catId] || 0) + 1;
    });

    // 6. Database Transaction for bulk insertion & updates
    if (validItemsToInsert.length > 0) {
      const dbSession = await mongoose.startSession();
      dbSession.startTransaction();
      try {
        await Item.insertMany(validItemsToInsert, { session: dbSession });

        const bulkOps = Object.keys(categoryQuantities).map(catId => ({
          updateOne: {
            filter: { _id: catId },
            update: { $inc: { quantity: categoryQuantities[catId] } },
          },
        }));
        await Category.bulkWrite(bulkOps, { session: dbSession });

        await dbSession.commitTransaction();
      } catch (dbError: any) {
        await dbSession.abortTransaction();
        throw new Error(`Database transaction failed during save: ${dbError.message}`);
      } finally {
        dbSession.endSession();
      }
    }

    // 7. Update Session as Completed
    sessionDoc.status = 'completed';
    sessionDoc.created = validItemsToInsert.length;
    sessionDoc.skipped = rowErrors.length;
    sessionDoc.errorCount = rowErrors.length;
    sessionDoc.rowErrors = rowErrors;
    sessionDoc.summary = {
      total: records.length,
      created: validItemsToInsert.length,
      skipped: rowErrors.length,
    };
    await sessionDoc.save();

    sendSuccess(res, 200, sessionDoc, 'Bulk upload processing finished');

  } catch (error: any) {
    // 8. Handle critical failures
    sessionDoc.status = 'failed';
    sessionDoc.rowErrors.push({ row: {}, reason: error.message || 'Unknown critical error' });
    await sessionDoc.save();
    return next(new AppError(error.message || 'Bulk upload failed', 500));
  }
});

export const getBulkUploadSessions = asyncHandler(async (req: Request, res: Response) => {
  const { page = 1, limit = 10, status, sortBy = 'createdAt', sortOrder = 'desc' } = req.query;
  const query: any = {};
  if (status) query.status = status;

  const skip = (Number(page) - 1) * Number(limit);
  const sortDirection = sortOrder === 'asc' ? 1 : -1;

  const [sessions, total] = await Promise.all([
    BulkUploadSession.find(query)
      .select('-rowErrors') // Don't fetch heavy error logs on list view
      .populate('uploadedBy', 'name email')
      .sort({ [sortBy as string]: sortDirection })
      .skip(skip)
      .limit(Number(limit)),
    BulkUploadSession.countDocuments(query),
  ]);

  sendSuccess(res, 200, {
    sessions,
    pagination: { total, page: Number(page), limit: Number(limit), totalPages: Math.ceil(total / Number(limit)) }
  }, 'Bulk upload sessions retrieved');
});

export const getBulkUploadSessionDetail = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  const session = await BulkUploadSession.findById(req.params.id).populate('uploadedBy', 'name email');
  if (!session) return next(new AppError('Session not found', 404));
  sendSuccess(res, 200, session, 'Session details retrieved');
});

export const deleteBulkUploadSession = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  const session = await BulkUploadSession.findByIdAndDelete(req.params.id);
  if (!session) return next(new AppError('Session not found', 404));
  sendSuccess(res, 200, null, 'Session deleted successfully');
});

export const bulkDeleteUploadSessions = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  const { ids } = req.body;
  if (!ids || !Array.isArray(ids) || ids.length === 0) {
    return next(new AppError('Please provide an array of session IDs to delete.', 400));
  }
  await BulkUploadSession.deleteMany({ _id: { $in: ids } });
  sendSuccess(res, 200, null, 'BULK_UPLOAD_SESSIONS_DELETED');
});