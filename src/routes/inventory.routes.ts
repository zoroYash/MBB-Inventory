import { Router } from 'express';
import { protect } from '../middlewares/auth.middleware';
import { validate } from '../middlewares/validate.middleware';
import {
  createCategory,
  updateCategory,
  getCategories,
  addItems,
  sellItems,
  getItems,
  getInvoices,
  getTodaySales,
  getAllSales,
  getBatchItemDetails,
} from '../controllers/inventory.controller';
import {
  createCategorySchema,
  updateCategorySchema,
  addItemsSchema,
  sellItemsSchema,
  getItemsSchema,
  getInvoicesSchema,
  getTodaySalesSchema,
  getAllSalesSchema,
  getBatchItemDetailsSchema, 
} from '../validations/inventory.validation';

const router = Router();

// All inventory routes require a logged-in admin/super_admin
router.use(protect);

// Category Routes
router.post('/categories', validate(createCategorySchema), createCategory);
router.put('/categories/:id', validate(updateCategorySchema), updateCategory);
router.get('/categories', getCategories);

// Item / Flow Routes
router.get('/items', validate(getItemsSchema), getItems);
router.post('/items/add', validate(addItemsSchema), addItems);
router.post('/items/sell', validate(sellItemsSchema), sellItems);

router.post('/items/batch-details', validate(getBatchItemDetailsSchema), getBatchItemDetails);

// Invoice & Dashboard Routes
router.get('/invoices', validate(getInvoicesSchema), getInvoices);
router.get('/sales', validate(getAllSalesSchema), getAllSales);
router.get('/sales/today', validate(getTodaySalesSchema), getTodaySales);

export default router;
