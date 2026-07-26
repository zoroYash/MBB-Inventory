import { Response } from 'express';

export const sendSuccess = (res: Response, statusCode: number, data: any, message: string = 'Success') => {
  return res.status(statusCode).json({
    success: true,
    message,
    data,
  });
};
