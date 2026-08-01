import { Request, Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import { Category } from '../models/category.model';
import { Item } from '../models/item.model';
import { Invoice } from '../models/invoice.model';
import { AppError } from '../utils/AppError';
import { asyncHandler } from '../utils/asyncHandler';
import { sendSuccess } from '../utils/responseHandler';

// =======================
// CATEGORY MANAGEMENT
// =======================

export const createCategory = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  const existingCategory = await Category.findOne({ name: req.body.name });
  if (existingCategory) {
    return next(new AppError('Category with this name already exists', 400));
  }

  const category = await Category.create(req.body);
  sendSuccess(res, 201, category, 'Category created successfully');
});

export const updateCategory = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
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
    maxQuantity    
  } = req.query;
  
  const query: any = {};

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
    Invoice.find(query).populate('soldBy', 'name email').populate('items', 'barcode')
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