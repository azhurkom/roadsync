'use client';

import * as React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Switch } from './ui/switch';
import { Separator } from './ui/separator';
import { Textarea } from './ui/textarea';
import type { ActionType, ExpenseType, PaymentMethod, Trip, Address, Cadence, ActionLog } from '@/lib/types';
import TachographInput from './tachograph-input';
import PhotoInput from './photo-input';
import { useToast } from '@/hooks/use-toast';
import { useUser } from '@/hooks/use-user';
import { useShiftStatus } from '@/hooks/use-shift-status';
import { useTrips } from '@/hooks/use-trips';
import { useApi, apiMutate } from '@/hooks/use-api';
import { Loader2, ArrowLeft, Clock, Wallet, ClipboardList, FilePlus, PlusCircle, Trash2, BrainCircuit } from 'lucide-react';

interface ActionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cadence: Cadence;
}

type TachographData = {
  odometer: string;
  location: string;
  coords: { lat: number; lon: number } | null;
  photo: File | null;
};

const expenseTypes: ExpenseType[] = ['паливо', 'adblue', 'мийка', 'обслуговування', 'інше'];
const paymentMethods: PaymentMethod[] = ['EDC', 'Готівка', 'Моя картка'];
const tripActionTypes: ActionType[] = ['loading', 'unloading', 'trailer-change', 'vehicle-change'];
const tripActionTranslations: Record<ActionType, string> = {
  'loading': 'Завантаження', 'unloading': 'Розвантаження',
  'trailer-change': 'Зміна причепа', 'vehicle-change': 'Зміна авто',
  'start-shift': 'Початок зміни', 'end-shift': 'Кінець зміни',
};

// ─── NewTripForm ──────────────────────────────────────────────────────────────
function NewTripForm({ cadenceId, onFinished }: { cadenceId: string; onFinished: () => void }) {
  const { toast } = useToast();
  const { data: savedAddresses } = useApi<Address[]>('/api/addresses');

  const [rawMessage, setRawMessage] = React.useState('');
  const [description, setDescription] = React.useState('');
  const [referenceNumber, setReferenceNumber] = React.useState('');
  const [loadAddresses, setLoadAddresses] = React.useState<string[]>(['']);
  const [unloadAddresses, setUnloadAddresses] = React.useState<string[]>(['']);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [isParsing, setIsParsing] = React.useState(false);

  const handleParseMessage = async () => {
    if (!rawMessage) return;
    setIsParsing(true);
    toast({ title: 'Аналіз повідомлення...', description: 'Запускаємо AI для розпізнавання даних.' });
    try {
      const res = await fetch('/api/ai/parse-trip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: rawMessage }),
      });
      if (!res.ok) throw new Error(await res.text());
      const result = await res.json();
      setDescription(result.description);
      setReferenceNumber(result.referenceNumber || '');
      setLoadAddresses(result.loadAddresses.length > 0 ? result.loadAddresses : ['']);
      setUnloadAddresses(result.unloadAddresses.length > 0 ? result.unloadAddresses : ['']);
      toast({ title: 'Дані розпізнано!', description: 'Перевірте та за потреби виправте поля.' });
    } catch (error: unknown) {
      const err = error as Error;
      const is429 = err?.message?.includes('429') || err?.message?.includes('Quota');
      toast({ variant: 'destructive', title: 'Помилка розпізнавання', description: is429 ? 'Перевищено ліміт запитів до AI. Зачекайте хвилину.' : 'Не вдалося розпізнати дані.' });
    } finally {
      setIsParsing(false);
    }
  };

  const handleAddressChange = (i: number, v: string, t: 'load' | 'unload') => {
    const arr = t === 'load' ? [...loadAddresses] : [...unloadAddresses];
    arr[i] = v;
    t === 'load' ? setLoadAddresses(arr) : setUnloadAddresses(arr);
  };
  const addAddr = (t: 'load' | 'unload') => t === 'load' ? setLoadAddresses([...loadAddresses, '']) : setUnloadAddresses([...unloadAddresses, '']);
  const removeAddr = (i: number, t: 'load' | 'unload') => {
    const arr = (t === 'load' ? loadAddresses : unloadAddresses).filter((_, idx) => idx !== i);
    if (arr.length === 0) return;
    t === 'load' ? setLoadAddresses(arr) : setUnloadAddresses(arr);
  };

  const geocodeAndSaveAddress = async (addr: string) => {
    try {
      const existing = savedAddresses?.find(s => s.address.toLowerCase() === addr.toLowerCase());
      if (existing) return;
      // Geocode via AI
      const geoRes = await fetch('/api/ai/geocode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address: addr }),
      });
      const { latitude, longitude } = geoRes.ok ? await geoRes.json() : { latitude: 0, longitude: 0 };
      await apiMutate('/api/addresses', 'POST', {
        name: addr.split(',')[0] || addr,
        address: addr,
        entryLatitude: latitude || undefined,
        entryLongitude: longitude || undefined,
        notes: '',
      });
      if (!latitude && !longitude) {
        toast({ variant: 'destructive', title: 'Координати не знайдено', description: `Адресу "${addr}" збережено без координат.` });
      } else {
        toast({ title: 'Адресу додано до довідника', description: addr });
      }
    } catch {
      // Non-critical
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!description) { toast({ variant: 'destructive', title: 'Помилка', description: 'Будь ласка, заповніть опис рейсу.' }); return; }
    setIsSubmitting(true);
    try {
      const allAddresses = [...new Set([...loadAddresses, ...unloadAddresses])].filter(a => a.trim());
      for (const addr of allAddresses) await geocodeAndSaveAddress(addr);

      const date = new Date();
      const datePrefix = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`;
      // Get trip count for today to generate ID
      const tripsRes = await fetch(`/api/trips?cadenceId=${cadenceId}`);
      const allTrips: Trip[] = await tripsRes.json();
      const todaysTrips = allTrips.filter(t => t.id.startsWith(datePrefix));
      const newTripId = `${datePrefix}-${String(todaysTrips.length + 1).padStart(3, '0')}`;

      await apiMutate('/api/trips', 'POST', {
        id: newTripId,
        cadenceId,
        description,
        referenceNumber: referenceNumber.trim() || undefined,
        loadAddresses: loadAddresses.filter(a => a.trim()),
        unloadAddresses: unloadAddresses.filter(a => a.trim()),
      });
      toast({ title: 'Успіх!', description: `Рейс ${newTripId} було створено.` });
      onFinished();
    } catch (err: unknown) {
      const error = err as Error;
      toast({ variant: 'destructive', title: 'Помилка створення рейсу', description: error.message });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-1">
      <div className="space-y-1">
        <Label htmlFor="raw-message">Вставити повідомлення (напр. з WhatsApp)</Label>
        <Textarea id="raw-message" placeholder="Тут може бути ваше повідомлення про рейс..." value={rawMessage} onChange={e => setRawMessage(e.target.value)} rows={3} />
      </div>
      <Button type="button" variant="outline" className="w-full h-8" onClick={handleParseMessage} disabled={isParsing || !rawMessage}>
        {isParsing ? <Loader2 className="animate-spin h-4 w-4" /> : <BrainCircuit className="h-4 w-4" />}
        Розпізнати з тексту
      </Button>
      <Separator className="my-2" />
      <div className="space-y-1">
        <Label htmlFor="trip-description">Опис рейсу</Label>
        <Input id="trip-description" className="h-8" placeholder="напр., Перевезення товарів до Берліна" value={description} onChange={e => setDescription(e.target.value)} required />
      </div>
      <div className="space-y-1">
        <Label htmlFor="trip-reference">Номер CMR / замовлення</Label>
        <Input id="trip-reference" className="h-8" placeholder="Довільний номер" value={referenceNumber} onChange={e => setReferenceNumber(e.target.value)} />
      </div>
      <div className="space-y-1">
        <Label>Адреси завантаження</Label>
        {loadAddresses.map((addr, i) => (
          <div key={i} className="flex items-center gap-1">
            <Input list="saved-addresses" className="h-8" placeholder={`Адреса ${i + 1}`} value={addr} onChange={e => handleAddressChange(i, e.target.value, 'load')} />
            <Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => removeAddr(i, 'load')} disabled={loadAddresses.length <= 1}><Trash2 className="h-4 w-4 text-destructive" /></Button>
          </div>
        ))}
        <Button type="button" variant="outline" size="sm" onClick={() => addAddr('load')} className="h-8 gap-2"><PlusCircle className="h-4 w-4" /> Додати адресу</Button>
      </div>
      <div className="space-y-1">
        <Label>Адреси розвантаження</Label>
        {unloadAddresses.map((addr, i) => (
          <div key={i} className="flex items-center gap-1">
            <Input list="saved-addresses" className="h-8" placeholder={`Адреса ${i + 1}`} value={addr} onChange={e => handleAddressChange(i, e.target.value, 'unload')} />
            <Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => removeAddr(i, 'unload')} disabled={unloadAddresses.length <= 1}><Trash2 className="h-4 w-4 text-destructive" /></Button>
          </div>
        ))}
        <Button type="button" variant="outline" size="sm" onClick={() => addAddr('unload')} className="h-8 gap-2"><PlusCircle className="h-4 w-4" /> Додати адресу</Button>
      </div>
      <datalist id="saved-addresses">
        {savedAddresses?.map(addr => <option key={addr.id} value={addr.address}>{addr.name}</option>)}
      </datalist>
      <Button type="submit" className="w-full h-9" disabled={isSubmitting}>
        {isSubmitting ? <Loader2 className="animate-spin h-4 w-4" /> : 'Створити рейс'}
      </Button>
    </form>
  );
}

// ─── ShiftForm ────────────────────────────────────────────────────────────────
function ShiftForm({ cadenceId, onFinished }: { cadenceId: string; onFinished: () => void }) {
  const { toast } = useToast();
  const [tachographData, setTachographData] = React.useState<TachographData | null>(null);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const { isActive: isShiftActive, isLoading: isShiftStatusLoading } = useShiftStatus(cadenceId);
  const [time, setTime] = React.useState('');
  const [drivingTime, setDrivingTime] = React.useState('');

  React.useEffect(() => {
    const now = new Date();
    setTime(`${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`);
    setDrivingTime('');
  }, [isShiftActive]);

  const handleAction = async () => {
    if (!tachographData?.odometer) { toast({ variant: 'destructive', title: 'Помилка', description: 'Будь ласка, заповніть дані тахографа.' }); return; }
    if (!time) { toast({ variant: 'destructive', title: 'Помилка', description: 'Будь ласка, введіть час.' }); return; }
    if (isShiftActive && drivingTime) {
      const [h] = drivingTime.split(':').map(Number);
      if (h > 12) { toast({ variant: 'destructive', title: 'Помилка', description: 'Час водіння не може перевищувати 12 годин.' }); return; }
    }

    const action = isShiftActive ? 'end-shift' : 'start-shift';
    setIsSubmitting(true);

    const [hours, minutes] = time.split(':').map(Number);
    const actionTimestamp = new Date();
    actionTimestamp.setHours(hours, minutes, 0, 0);
    if (actionTimestamp.getTime() > Date.now()) actionTimestamp.setDate(actionTimestamp.getDate() - 1);

    try {
      await apiMutate('/api/action-logs', 'POST', {
        cadenceId,
        timestamp: actionTimestamp.toISOString(),
        odometer: Number(tachographData.odometer),
        locationLatitude: tachographData.coords?.lat || 0,
        locationLongitude: tachographData.coords?.lon || 0,
        locationName: tachographData.location,
        actionType: action,
        ...(isShiftActive && drivingTime && { drivingTime }),
      });
      toast({ title: 'Успіх!', description: `Зміну ${action === 'start-shift' ? 'розпочато' : 'завершено'}.` });
      onFinished();
    } catch {
      toast({ variant: 'destructive', title: 'Помилка', description: 'Не вдалося зберегти запис.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-1 pt-1">
      <TachographInput onDataExtracted={setTachographData} />
      <div className="space-y-1">
        <Label htmlFor="shift-time">{isShiftActive ? 'Час закінчення' : 'Час початку'}</Label>
        <Input id="shift-time" type="time" value={time} onChange={e => setTime(e.target.value)} className="h-8" />
      </div>
      {isShiftActive && (
        <div className="space-y-1">
          <Label htmlFor="driving-time">Час водіння</Label>
          <Input id="driving-time" type="time" value={drivingTime} onChange={e => setDrivingTime(e.target.value)} className="h-8" />
        </div>
      )}
      <Button onClick={handleAction} disabled={isSubmitting || isShiftStatusLoading} className="w-full h-9" variant={isShiftActive ? 'default' : 'outline'}>
        {(isSubmitting || isShiftStatusLoading) ? <Loader2 className="animate-spin h-4 w-4" /> : (isShiftActive ? 'Закінчити зміну' : 'Почати зміну')}
      </Button>
    </div>
  );
}

// ─── ExpenseForm ──────────────────────────────────────────────────────────────
function ExpenseForm({ cadence, onFinished }: { cadence: Cadence; onFinished: () => void }) {
  const { toast } = useToast();
  const [liters, setLiters] = React.useState('');
  const [cost, setCost] = React.useState('1');
  const [expenseType, setExpenseType] = React.useState<ExpenseType | ''>('');
  const [paymentMethod, setPaymentMethod] = React.useState<PaymentMethod | ''>('EDC');
  const [notes, setNotes] = React.useState('');
  const [tachographData, setTachographData] = React.useState<TachographData | null>(null);
  const [receiptUrl, setReceiptUrl] = React.useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  const handleLitersBlur = () => {
    if (liters.includes('+') || liters.includes(',')) {
      try {
        const sum = liters.replace(/,/g, '.').split('+').reduce((acc, v) => acc + (Number(v.trim()) || 0), 0);
        if (sum > 0) setLiters(String(sum));
      } catch { toast({ variant: 'destructive', title: 'Неправильний розрахунок' }); }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tachographData?.odometer || !expenseType || !cost || !paymentMethod) {
      toast({ variant: 'destructive', title: 'Помилка', description: "Будь ласка, заповніть всі обов'язкові поля." });
      return;
    }
    let numericLiters: number | undefined;
    if (liters.trim()) {
      try {
        numericLiters = liters.replace(/,/g, '.').split('+').reduce((acc, v) => { const n = Number(v.trim()); if (isNaN(n)) throw new Error(); return acc + n; }, 0);
      } catch { toast({ variant: 'destructive', title: 'Неправильна кількість літрів' }); return; }
    }
    setIsSubmitting(true);
    try {
      await apiMutate('/api/expenses', 'POST', {
        cadenceId: cadence.id,
        timestamp: new Date().toISOString(),
        odometer: Number(tachographData.odometer),
        locationName: tachographData.location,
        type: expenseType,
        amount: Number(cost),
        paymentMethod,
        ...(numericLiters !== undefined && { liters: numericLiters }),
        ...(receiptUrl && { receiptUrl }),
        ...(notes && { notes }),
      });
      toast({ title: 'Успіх!', description: 'Витрату збережено.' });
      onFinished();
    } catch {
      toast({ variant: 'destructive', title: 'Помилка', description: 'Не вдалося зберегти витрату.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-1 pt-1">
      <TachographInput onDataExtracted={setTachographData} />
      <div className="space-y-1">
        <Label htmlFor="expense-type">Тип витрат</Label>
        <Select onValueChange={(v: ExpenseType) => setExpenseType(v)} value={expenseType}>
          <SelectTrigger id="expense-type" className="h-8"><SelectValue placeholder="Виберіть тип" /></SelectTrigger>
          <SelectContent>{expenseTypes.map(t => <SelectItem key={t} value={t} className="capitalize">{t}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label htmlFor="liters">Кількість (літри)</Label>
          <Input id="liters" placeholder="напр., 100+50,5" value={liters} onChange={e => setLiters(e.target.value)} onBlur={handleLitersBlur} className="h-8" />
        </div>
        <div className="space-y-1">
          <Label htmlFor="cost">Загальна вартість (EUR)</Label>
          <Input id="cost" type="number" placeholder="напр., 123.45" value={cost} onChange={e => setCost(e.target.value)} className="h-8" />
        </div>
      </div>
      <div className="space-y-1">
        <Label htmlFor="payment">Спосіб оплати</Label>
        <Select onValueChange={(v: PaymentMethod) => setPaymentMethod(v)} value={paymentMethod}>
          <SelectTrigger id="payment" className="h-8"><SelectValue placeholder="Виберіть спосіб" /></SelectTrigger>
          <SelectContent>{paymentMethods.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      {(expenseType === 'обслуговування' || expenseType === 'інше') && (
        <div className="space-y-1">
          <Label htmlFor="expense-notes">Примітка</Label>
          <Input id="expense-notes" className="h-8" placeholder="Опціонально" value={notes} onChange={e => setNotes(e.target.value)} />
        </div>
      )}
      <PhotoInput onFileUploaded={setReceiptUrl} promptText="Додати фото чеку" />
      <Button type="submit" className="w-full h-9" disabled={isSubmitting}>
        {isSubmitting ? <Loader2 className="animate-spin h-4 w-4" /> : 'Зберегти витрату'}
      </Button>
    </form>
  );
}

// ─── TripActionForm ───────────────────────────────────────────────────────────
function TripActionForm({ cadence, onFinished }: { cadence: Cadence; onFinished: () => void }) {
  const { toast } = useToast();
  const { trips, isLoading: areTripsLoading, refetch: refetchTrips } = useTrips(cadence.id);
  const oldestTrip = React.useMemo(() => trips?.[0] ?? null, [trips]);
  const selectedTripId = oldestTrip?.id || '';

  const [actionType, setActionType] = React.useState<ActionType | ''>('');
  const [weight, setWeight] = React.useState('');
  const [newNumber, setNewNumber] = React.useState('');
  const [notes, setNotes] = React.useState('');
  const [tachographData, setTachographData] = React.useState<TachographData | null>(null);
  const [fileUrl, setFileUrl] = React.useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [isLastUnload, setIsLastUnload] = React.useState(false);
  const [shouldCloseTrip, setShouldCloseTrip] = React.useState(true);

  React.useEffect(() => {
    if (actionType !== 'loading' && actionType !== 'unloading') setWeight('');
    if (actionType !== 'trailer-change' && actionType !== 'vehicle-change') setNewNumber('');

    const checkLastUnload = async () => {
      if (actionType === 'unloading' && selectedTripId) {
        const tripsRes = await fetch(`/api/trips?cadenceId=${cadence.id}`);
        const allTrips: Trip[] = await tripsRes.json();
        const trip = allTrips.find(t => t.id === selectedTripId);
        if (!trip) return;
        const logsRes = await fetch(`/api/action-logs?cadenceId=${cadence.id}&tripId=${selectedTripId}&limit=200`);
        const logs = await logsRes.json();
        const unloadCount = logs.filter((l: ActionLog) => l.actionType === 'unloading').length;
        if (unloadCount + 1 >= (trip.unloadAddresses?.length || 0)) {
          setIsLastUnload(true); setShouldCloseTrip(true);
        } else { setIsLastUnload(false); }
      } else { setIsLastUnload(false); }
    };
    checkLastUnload();
  }, [actionType, selectedTripId, cadence.id]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tachographData?.odometer || !actionType) {
      toast({ variant: 'destructive', title: 'Помилка', description: 'Будь ласка, заповніть дані тахографа та виберіть дію.' }); return;
    }
    if (!selectedTripId) { toast({ variant: 'destructive', title: 'Помилка', description: 'Немає активного рейсу.' }); return; }
    setIsSubmitting(true);

    try {
      const logPayload: Record<string, unknown> = {
        cadenceId: cadence.id,
        timestamp: new Date().toISOString(),
        odometer: Number(tachographData.odometer),
        locationLatitude: tachographData.coords?.lat || 0,
        locationLongitude: tachographData.coords?.lon || 0,
        locationName: tachographData.location,
        actionType,
        tripId: selectedTripId,
        ...(weight && { weight: Number(weight) }),
        ...(notes && { notes }),
        ...(fileUrl && { fileUrl }),
      };
      if (actionType === 'trailer-change') { logPayload.newTrailerNumber = newNumber; logPayload.oldTrailerNumber = cadence.trailerNumber; }
      if (actionType === 'vehicle-change') { logPayload.newVehicleNumber = newNumber; logPayload.oldVehicleNumber = cadence.vehicleNumber; }

      await apiMutate('/api/action-logs', 'POST', logPayload);

      // Side effects: close trip, update cadence numbers
      if (actionType === 'trailer-change' || actionType === 'vehicle-change') {
        const logsRes = await fetch(`/api/action-logs?cadenceId=${cadence.id}&tripId=${selectedTripId}&limit=200`);
        const logs = await logsRes.json();
        const hasLoading = logs.some((l: ActionLog) => l.actionType === 'loading');
        if (hasLoading) {
          await apiMutate('/api/trips', 'PATCH', { id: selectedTripId, cadenceId: cadence.id, isClosed: true });
          toast({ title: 'Рейс закрито.' });
        }
        const field = actionType === 'trailer-change' ? 'trailerNumber' : 'vehicleNumber';
        await apiMutate('/api/cadences', 'PATCH', { id: cadence.id, [field]: newNumber });
        toast({ title: `Номер ${actionType === 'trailer-change' ? 'причепа' : 'авто'} оновлено.` });
      } else if (actionType === 'unloading' && shouldCloseTrip && isLastUnload) {
        await apiMutate('/api/trips', 'PATCH', { id: selectedTripId, cadenceId: cadence.id, isClosed: true });
        toast({ title: 'Рейс завершено', description: 'Автоматично закрито після останнього розвантаження.' });
      }

      toast({ title: 'Успіх!', description: 'Дію рейсу збережено.' });
      refetchTrips();
      onFinished();
    } catch {
      toast({ variant: 'destructive', title: 'Помилка', description: 'Не вдалося зберегти дію.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-1 pt-1">
      <TachographInput onDataExtracted={setTachographData} />
      <div className="space-y-1">
        <Label>Рейс</Label>
        <div className="flex flex-col justify-center rounded-md border border-input bg-muted px-3 py-1.5 text-sm min-h-[36px]">
          {areTripsLoading ? <span className="text-muted-foreground">Завантаження...</span>
            : oldestTrip ? (<><span className="font-bold text-foreground truncate">{oldestTrip.id}</span><span className="text-xs text-muted-foreground truncate">{oldestTrip.description}</span></>)
            : <span className="text-muted-foreground">Немає активних рейсів</span>}
        </div>
      </div>
      <div className="space-y-1">
        <Label htmlFor="action-type">Дія</Label>
        <Select onValueChange={(v: ActionType) => setActionType(v)} value={actionType}>
          <SelectTrigger id="action-type" className="h-8"><SelectValue placeholder="Виберіть дію" /></SelectTrigger>
          <SelectContent>{tripActionTypes.map(t => <SelectItem key={t} value={t}>{tripActionTranslations[t]}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      {(actionType === 'loading' || actionType === 'unloading') && (
        <div className="space-y-1">
          <Label htmlFor="weight">Вага (кг)</Label>
          <Input id="weight" type="number" placeholder="напр., 22000" max="26000" value={weight} onChange={e => setWeight(e.target.value)} className="h-8" />
        </div>
      )}
      {(actionType === 'trailer-change' || actionType === 'vehicle-change') && (
        <div className="space-y-1">
          <Label htmlFor="new-number">{actionType === 'trailer-change' ? 'Новий номер причепа' : 'Новий номер авто'}</Label>
          <Input id="new-number" placeholder="Введіть новий номер" value={newNumber} onChange={e => setNewNumber(e.target.value)} className="h-8" />
        </div>
      )}
      <div className="space-y-1">
        <Label htmlFor="notes">Нотатки</Label>
        <Input id="notes" placeholder="напр., CMR #12345" value={notes} onChange={e => setNotes(e.target.value)} className="h-8" />
      </div>
      {actionType === 'unloading' && isLastUnload && (
        <div className="flex items-center justify-between p-2 rounded-lg bg-primary/5 border border-primary/20">
          <Label htmlFor="close-trip-toggle" className="text-sm font-medium">🏁 Завершити рейс після запису</Label>
          <Switch id="close-trip-toggle" checked={shouldCloseTrip} onCheckedChange={setShouldCloseTrip} />
        </div>
      )}
      <PhotoInput onFileUploaded={setFileUrl} promptText="Додати фото документа" />
      <Button type="submit" className="w-full h-9" disabled={isSubmitting || !selectedTripId}>
        {isSubmitting ? <Loader2 className="animate-spin h-4 w-4" /> : 'Записати дію'}
      </Button>
    </form>
  );
}

// ─── Main ActionDialog ────────────────────────────────────────────────────────
export default function ActionDialog({ open, onOpenChange, cadence }: ActionDialogProps) {
  const [view, setView] = React.useState<'main' | 'shift' | 'expense' | 'trip' | 'new-trip'>('main');

  React.useEffect(() => { if (open) setView('main'); }, [open]);

  const closeDialog = () => onOpenChange(false);
  const handleFinished = () => { closeDialog(); setTimeout(() => setView('main'), 300); };

  const renderContent = () => {
    switch (view) {
      case 'shift': return <ShiftForm cadenceId={cadence.id} onFinished={handleFinished} />;
      case 'expense': return <ExpenseForm cadence={cadence} onFinished={handleFinished} />;
      case 'trip': return <TripActionForm cadence={cadence} onFinished={handleFinished} />;
      case 'new-trip': return <NewTripForm cadenceId={cadence.id} onFinished={handleFinished} />;
      default: return (
        <div className="grid grid-cols-2 gap-2 pt-2">
          <Button variant="secondary" className="h-20 flex-col gap-1" onClick={() => setView('shift')}><Clock className="h-6 w-6" /><span>Зміна</span></Button>
          <Button variant="secondary" className="h-20 flex-col gap-1" onClick={() => setView('expense')}><Wallet className="h-6 w-6" /><span>Витрати</span></Button>
          <Button variant="secondary" className="h-20 flex-col gap-1" onClick={() => setView('trip')}><ClipboardList className="h-6 w-6" /><span>Дія з рейсу</span></Button>
          <Button variant="secondary" className="h-20 flex-col gap-1" onClick={() => setView('new-trip')}><FilePlus className="h-6 w-6" /><span>Новий рейс</span></Button>
        </div>
      );
    }
  };

  const getTitle = () => {
    switch (view) {
      case 'shift': return 'Запис зміни';
      case 'expense': return 'Запис витрат';
      case 'trip': return 'Запис дії з рейсу';
      case 'new-trip': return 'Створити новий рейс';
      default: return 'Записати нову дію';
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[90vw] sm:max-w-sm rounded-lg p-3">
        <DialogHeader>
          <div className="flex items-center relative h-8">
            {view !== 'main' && (
              <Button variant="ghost" size="icon" className="absolute -left-2 top-1/2 -translate-y-1/2 h-8 w-8" onClick={() => setView('main')}>
                <ArrowLeft className="h-5 w-5" />
              </Button>
            )}
            <DialogTitle className="w-full text-center text-lg">{getTitle()}</DialogTitle>
          </div>
          {view === 'main' && <DialogDescription className="text-center pt-0">Виберіть тип дії, яку ви хочете записати.</DialogDescription>}
        </DialogHeader>
        <div className="px-1 overflow-y-auto max-h-[75vh]">
          {renderContent()}
        </div>
      </DialogContent>
    </Dialog>
  );
}
