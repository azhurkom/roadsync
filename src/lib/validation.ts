import { z } from 'zod';

// Common validation schemas
export const IdSchema = z.string().uuid('Invalid ID format');
export const TimestampSchema = z.string().datetime('Invalid datetime format');
export const OdometerSchema = z.number().int().min(0).max(9999999);
export const CoordinatesSchema = z.object({
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
});

// Cadence validation schemas
export const CreateCadenceSchema = z.object({
  firmName: z.string().min(1, 'Firm name is required').max(100),
  vehicleNumber: z.string().min(1, 'Vehicle number is required').max(20),
  trailerNumber: z.string().min(1, 'Trailer number is required').max(20),
});

export const UpdateCadenceSchema = z.object({
  id: IdSchema,
  endDate: TimestampSchema.nullable().optional(),
  vehicleNumber: z.string().min(1).max(20).optional(),
  trailerNumber: z.string().min(1).max(20).optional(),
}).refine(data => Object.keys(data).length > 1, {
  message: 'At least one field to update is required'
});

// Trip validation schemas
export const CreateTripSchema = z.object({
  cadenceId: IdSchema,
  id: z.string().min(1, 'Trip ID is required').max(50),
  description: z.string().min(1, 'Description is required').max(500),
  referenceNumber: z.string().max(50).optional(),
  loadAddresses: z.array(z.string().max(200)).optional(),
  unloadAddresses: z.array(z.string().max(200)).optional(),
});

export const UpdateTripSchema = z.object({
  id: IdSchema,
  cadenceId: IdSchema,
  isClosed: z.boolean().optional(),
  description: z.string().min(1).max(500).optional(),
  referenceNumber: z.string().max(50).optional(),
  loadAddresses: z.array(z.string().max(200)).optional(),
  unloadAddresses: z.array(z.string().max(200)).optional(),
}).refine(data => Object.keys(data).length > 2, {
  message: 'At least one field to update is required'
});

// Action Log validation schemas
export const CreateActionLogSchema = z.object({
  cadenceId: IdSchema,
  tripId: IdSchema.optional(),
  timestamp: TimestampSchema,
  odometer: OdometerSchema,
  locationLatitude: z.number(),
  locationLongitude: z.number(),
  locationName: z.string().min(1).max(200),
  actionType: z.enum(['start-shift', 'end-shift', 'loading', 'unloading', 'trailer-change', 'vehicle-change']),
  notes: z.string().max(1000).optional(),
  weight: z.number().int().min(0).max(100000).optional(),
  drivingTime: z.string().max(50).optional(),
  fileUrl: z.string().url().optional(),
  newVehicleNumber: z.string().max(20).optional(),
  newTrailerNumber: z.string().max(20).optional(),
  oldVehicleNumber: z.string().max(20).optional(),
  oldTrailerNumber: z.string().max(20).optional(),
});

// Expense validation schemas
export const CreateExpenseSchema = z.object({
  cadenceId: IdSchema,
  timestamp: TimestampSchema,
  type: z.enum(['паливо', 'adblue', 'мийка', 'обслуговування', 'інше']),
  amount: z.number().min(0).max(10000),
  paymentMethod: z.enum(['EDC', 'Готівка', 'Моя картка']),
  liters: z.number().min(0).max(1000).optional(),
  receiptUrl: z.string().url().optional(),
  odometer: OdometerSchema,
  locationName: z.string().min(1).max(200),
  notes: z.string().max(1000).optional(),
});

// Address validation schemas
export const CreateAddressSchema = z.object({
  name: z.string().min(1).max(100),
  address: z.string().min(1).max(500),
  entryLatitude: z.number().min(-90).max(90).optional(),
  entryLongitude: z.number().min(-180).max(180).optional(),
  notes: z.string().max(1000).optional(),
});

export const UpdateAddressSchema = z.object({
  id: IdSchema,
  name: z.string().min(1).max(100).optional(),
  address: z.string().min(1).max(500).optional(),
  entryLatitude: z.number().min(-90).max(90).optional(),
  entryLongitude: z.number().min(-180).max(180).optional(),
  notes: z.string().max(1000).optional(),
}).refine(data => Object.keys(data).length > 1, {
  message: 'At least one field to update is required'
});

// AI validation schemas
export const OcrRequestSchema = z.object({
  photoDataUri: z.string().url('Invalid data URI format'),
});

export const GeocodeRequestSchema = z.object({
  address: z.string().min(1).max(500),
});

export const GeolocateRequestSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
});

export const ParseTripRequestSchema = z.object({
  message: z.string().min(1).max(2000),
});

// Query parameter schemas
export const CadenceQuerySchema = z.object({
  active: z.enum(['true', 'false']).optional(),
});

export const TripQuerySchema = z.object({
  cadenceId: IdSchema,
  closed: z.enum(['true', 'false']).optional(),
});

export const ActionLogQuerySchema = z.object({
  cadenceId: IdSchema,
  tripId: IdSchema.optional(),
  limit: z.string().regex(/^\d+$/).transform(Number).refine(n => n > 0 && n <= 10000, {
    message: 'Limit must be between 1 and 10000'
  }).optional(),
});

export const ExpenseQuerySchema = z.object({
  cadenceId: IdSchema,
});

// Type exports
export type CreateCadenceRequest = z.infer<typeof CreateCadenceSchema>;
export type UpdateCadenceRequest = z.infer<typeof UpdateCadenceSchema>;
export type CreateTripRequest = z.infer<typeof CreateTripSchema>;
export type UpdateTripRequest = z.infer<typeof UpdateTripSchema>;
export type CreateActionLogRequest = z.infer<typeof CreateActionLogSchema>;
export type CreateExpenseRequest = z.infer<typeof CreateExpenseSchema>;
export type CreateAddressRequest = z.infer<typeof CreateAddressSchema>;
export type UpdateAddressRequest = z.infer<typeof UpdateAddressSchema>;
export type OcrRequest = z.infer<typeof OcrRequestSchema>;
export type GeocodeRequest = z.infer<typeof GeocodeRequestSchema>;
export type GeolocateRequest = z.infer<typeof GeolocateRequestSchema>;
export type ParseTripRequest = z.infer<typeof ParseTripRequestSchema>;
