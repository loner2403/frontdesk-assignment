import { Request, Response } from 'express';

/**
 * Standard error response interface
 */
export interface ErrorResponse {
  error: string;
  details?: any;
  code?: string;
}

/**
 * Handles API errors with consistent logging and response format
 * @param res Express response object
 * @param error Error that occurred
 * @param message Custom error message (optional)
 * @param statusCode HTTP status code (default: 500)
 */
export function handleApiError(
  res: Response,
  error: any,
  message: string = 'An error occurred',
  statusCode: number = 500
): Response {
  const errorMessage = error instanceof Error ? error.message : String(error);
  console.error(`${message}:`, error);
  
  const errorResponse: ErrorResponse = {
    error: message,
    details: errorMessage
  };
  
  return res.status(statusCode).json(errorResponse);
}

/**
 * Wraps an async route handler with error handling
 * @param fn Async route handler function
 * @returns Express middleware function with error handling
 */
export function asyncHandler(fn: (req: Request, res: Response) => Promise<any>) {
  return async (req: Request, res: Response) => {
    try {
      await fn(req, res);
    } catch (error) {
      handleApiError(res, error);
    }
  };
}

/**
 * Validates pagination parameters and returns standardized values
 * @param req Express request object
 * @param res Express response object
 * @param defaultLimit Default limit if not specified
 * @param maxLimit Maximum allowed limit
 * @returns Object with validated page and limit, or null if validation failed
 */
export function validatePagination(
  req: Request,
  res: Response,
  defaultLimit: number = 10,
  maxLimit: number = 100
): { page: number; limit: number } | null {
  const { page, limit } = req.query;
  
  // Parse pagination parameters
  const pageNum = page ? parseInt(page as string, 10) : 1;
  const limitNum = limit ? parseInt(limit as string, 10) : defaultLimit;
  
  // Validate pagination parameters
  if (isNaN(pageNum) || pageNum < 1) {
    res.status(400).json({ error: 'Invalid page parameter' });
    return null;
  }
  
  if (isNaN(limitNum) || limitNum < 1 || limitNum > maxLimit) {
    res.status(400).json({ 
      error: `Invalid limit parameter. Must be between 1 and ${maxLimit}`
    });
    return null;
  }
  
  return { page: pageNum, limit: limitNum };
}

/**
 * Creates a standard pagination response object
 * @param total Total number of items
 * @param page Current page number
 * @param limit Items per page
 * @returns Pagination object
 */
export function createPaginationResponse(total: number, page: number, limit: number) {
  return {
    total,
    page,
    limit,
    pages: Math.ceil(total / limit)
  };
}

/**
 * Validates required request parameters
 * @param req Express request object
 * @param res Express response object
 * @param params Array of required parameter names
 * @param source Where to look for parameters ('body', 'query', or 'params')
 * @returns true if all parameters are present, false if validation failed
 */
export function validateRequiredParams(
  req: Request,
  res: Response,
  params: string[],
  source: 'body' | 'query' | 'params' = 'body'
): boolean {
  const data = req[source];
  const missing = params.filter(param => !data[param]);
  
  if (missing.length > 0) {
    res.status(400).json({ 
      error: 'Missing required parameters', 
      missing 
    });
    return false;
  }
  
  return true;
} 