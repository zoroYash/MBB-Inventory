// =======================
// DASHBOARD & ANALYTICS
// =======================

import { Request, Response } from "express";
import { Category } from "../models/category.model";
import { asyncHandler } from "../utils/asyncHandler";
import { Item } from "../models/item.model";
import { Invoice } from "../models/invoice.model";
import { sendSuccess } from "../utils/responseHandler";

export const getDashboardStats = asyncHandler(async (req: Request, res: Response) => {
    // 1. High-level Inventory & Financial Stat Cards
    const [
      totalCategories,
      totalItemsCount,
      availableItemsCount,
      soldItemsCount,
      totalRevenueResult,
      totalProfitResult
    ] = await Promise.all([
      Category.countDocuments(),
      Item.countDocuments(),
      Item.countDocuments({ status: 'available' }),
      Item.countDocuments({ status: 'sold' }),
      Invoice.aggregate([{ $group: { _id: null, total: { $sum: '$sellingPrice' } } }]),
      Invoice.aggregate([{ $group: { _id: null, total: { $sum: '$totalProfit' } } }]),
    ]);
  
    const totalRevenue = totalRevenueResult[0]?.total || 0;
    const totalProfit = totalProfitResult[0]?.total || 0;
  
    // 2. Sales Trend (Last 12 Months Line/Area Chart data)
    const twelveMonthsAgo = new Date();
    twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 11);
    twelveMonthsAgo.setDate(1);
    twelveMonthsAgo.setHours(0, 0, 0, 0);
  
    const salesTrendRaw = await Invoice.aggregate([
      { $match: { createdAt: { $gte: twelveMonthsAgo } } },
      {
        $group: {
          _id: {
            year: { $year: '$createdAt' },
            month: { $month: '$createdAt' },
          },
          revenue: { $sum: '$sellingPrice' },
          profit: { $sum: '$totalProfit' },
          salesCount: { $sum: 1 },
        },
      },
      { $sort: { '_id.year': 1, '_id.month': 1 } },
    ]);
  
    // Format months cleanly for frontend charts (e.g., "Aug", "Sep", etc.)
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const salesTrend = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date();
      d.setMonth(d.getMonth() - i);
      const year = d.getFullYear();
      const month = d.getMonth() + 1;
      const monthLabel = `${monthNames[month - 1]} ${year}`;
  
      const found = salesTrendRaw.find(s => s._id.year === year && s._id.month === month);
      salesTrend.push({
        label: monthLabel,
        revenue: found ? found.revenue : 0,
        profit: found ? found.profit : 0,
        salesCount: found ? found.salesCount : 0,
      });
    }
  
    // 3. Item Status Distribution (Bar / Status Summary chart data)
    const itemStatusSummary = {
      available: availableItemsCount,
      sold: soldItemsCount,
      total: totalItemsCount,
    };
  
    // 4. Category Performance Distribution (Pie/Donut Chart data - top categories by stock/sales)
    const categoryDistribution = await Item.aggregate([
      { $match: { status: 'available' } },
      { $group: { _id: '$category', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 5 }, // Top 5 categories in stock
      {
        $lookup: {
          from: 'categories',
          localField: '_id',
          foreignField: '_id',
          as: 'categoryDetails',
        },
      },
      { $unwind: '$categoryDetails' },
      {
        $project: {
          categoryId: '$_id',
          categoryName: '$categoryDetails.name',
          count: 1,
        },
      },
    ]);
  
    sendSuccess(res, 200, {
      cards: {
        totalCategories,
        totalItems: totalItemsCount,
        availableItems: availableItemsCount,
        soldItems: soldItemsCount,
        totalRevenue,
        totalProfit,
      },
      salesTrend,
      itemStatusSummary,
      categoryDistribution,
    }, 'Dashboard analytics retrieved successfully');
  });