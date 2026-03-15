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
