export type ExpenseType = 'паливо' | 'adblue' | 'мийка' | 'обслуговування' | 'інше';
export type PaymentMethod = 'EDC' | 'Готівка' | 'Моя картка';
export type ActionType = 'start-shift' | 'end-shift' | 'loading' | 'unloading' | 'trailer-change' | 'vehicle-change';

export interface Cadence {
  id: string;
  firmName: string;
  startDate: string; // ISO string
  endDate: string | null;
  vehicleNumber: string;
  trailerNumber: string;
  userId: string;
}

export interface ActionLog {
  id: string;
  cadenceId: string;
  tripId?: string;
  timestamp: string; // ISO string
  odometer: number;
  locationLatitude: number;
  locationLongitude: number;
  locationName: string;
  actionType: ActionType;
  notes?: string;
  weight?: number;
  drivingTime?: string;
  fileUrl?: string;
  newVehicleNumber?: string;
  newTrailerNumber?: string;
  oldVehicleNumber?: string;
  oldTrailerNumber?: string;
}

export interface Expense {
  id: string;
  cadenceId: string;
  timestamp: string; // ISO string
  type: ExpenseType;
  amount: number;
  paymentMethod: PaymentMethod;
  liters?: number;
  receiptUrl?: string;
  odometer: number;
  locationName: string;
  notes?: string;
}

export interface Trip {
  id: string;
  cadenceId: string;
  description: string;
  referenceNumber?: string;
  loadAddresses: string[];
  unloadAddresses: string[];
  shiftIds?: string[];
  isClosed: boolean;
  createdAt: string; // ISO string
}

export interface Address {
  id: string;
  userId: string;
  name: string;
  address: string;
  entryLatitude?: number;
  entryLongitude?: number;
  notes?: string;
  createdAt?: string;
}

export type ActivityFeedItem = (
  | (ActionLog & { recordType: 'action' })
  | (Expense & { recordType: 'expense' })
) & { id: string; timestamp: string };

export type CarouselItemData = {
  id: string;
  title: string;
  value: string;
  description: string;
};

// API Types
export interface ApiResponse<T = unknown> {
  data?: T;
  error?: string;
  status?: number;
}

export interface QueryParams {
  cadenceId?: string;
  active?: string;
  limit?: string;
  closed?: string;
}

export interface FileUploadResponse {
  id: string;
  url: string;
}

// Export types
export interface ExportableRecord {
  [key: string]: string | number | boolean | null;
}

export interface FlattenedRecord {
  [key: string]: string | number | boolean | null;
}

// Tachograph types
export interface TachographData {
  odometer: string;
  location: string;
  coords: { lat: number; lon: number } | null;
  photo: File | null;
}

// Database row types
export interface DatabaseRow {
  [key: string]: unknown;
}

// API Request/Response types
export interface CreateCadenceRequest {
  firmName: string;
  vehicleNumber: string;
  trailerNumber: string;
}

export interface UpdateCadenceRequest {
  id: string;
  endDate?: string;
  vehicleNumber?: string;
  trailerNumber?: string;
}

export interface CreateTripRequest {
  cadenceId: string;
  id: string;
  description: string;
  referenceNumber?: string;
  loadAddresses?: string[];
  unloadAddresses?: string[];
}

export interface UpdateTripRequest {
  id: string;
  cadenceId: string;
  isClosed?: boolean;
  description?: string;
  referenceNumber?: string;
  loadAddresses?: string[];
  unloadAddresses?: string[];
}
