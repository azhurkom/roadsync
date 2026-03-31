import { NextRequest, NextResponse } from 'next/server';
import { ZodSchema, ZodError } from 'zod';

export class ValidationError extends Error {
  constructor(message: string, public details?: Record<string, string>) {
    super(message);
    this.name = 'ValidationError';
  }
}

export function validateRequestBody<T>(schema: ZodSchema<T>, body: unknown): T {
  try {
    return schema.parse(body);
  } catch (error) {
    if (error instanceof ZodError) {
      const details: Record<string, string> = {};
      error.errors.forEach(err => {
        const path = err.path.join('.');
        details[path] = err.message;
      });
      throw new ValidationError('Invalid request body', details);
    }
    throw new ValidationError('Validation failed');
  }
}

export function validateQueryParams<T>(schema: ZodSchema<T>, searchParams: URLSearchParams): T {
  const params: Record<string, string> = {};
  searchParams.forEach((value, key) => {
    params[key] = value;
  });
  
  try {
    return schema.parse(params);
  } catch (error) {
    if (error instanceof ZodError) {
      const details: Record<string, string> = {};
      error.errors.forEach(err => {
        const path = err.path.join('.');
        details[path] = err.message;
      });
      throw new ValidationError('Invalid query parameters', details);
    }
    throw new ValidationError('Query validation failed');
  }
}

export function handleValidationError(error: unknown): NextResponse {
  if (error instanceof ValidationError) {
    return NextResponse.json(
      { 
        error: error.message,
        details: error.details 
      }, 
      { status: 400 }
    );
  }
  
  console.error('Unexpected validation error:', error);
  return NextResponse.json(
    { error: 'Internal server error' }, 
    { status: 500 }
  );
}

export function createValidationMiddleware<T>(schema: ZodSchema<T>, source: 'body' | 'query' = 'body') {
  return async (req: NextRequest) => {
    try {
      if (source === 'body') {
        const body = await req.json();
        return validateRequestBody(schema, body);
      } else {
        return validateQueryParams(schema, req.nextUrl.searchParams);
      }
    } catch (error) {
      throw error;
    }
  };
}
