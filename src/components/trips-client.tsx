'use client';

import * as React from 'react';
import { useAllTrips } from '@/hooks/use-trips';
import { useUser } from '@/hooks/use-user';
import { useApi, apiMutate } from '@/hooks/use-api';
import type { Address, Cadence, Trip, ActionLog } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import { format, startOfDay, endOfDay } from 'date-fns';
import { uk } from 'date-fns/locale';
import { type DateRange } from 'react-day-picker';

import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Loader2, Copy, Route, Download, Upload, Search, Calendar as CalendarIcon, Pencil, PlusCircle, Trash2, CheckCircle2, Lock, RotateCcw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Textarea } from '@/components/ui/textarea';

// ─── EditTripForm ─────────────────────────────────────────────────────────────
function EditTripForm({ trip, cadenceId, onFinished, savedAddresses }: { trip: Trip; cadenceId: string; onFinished: () => void; savedAddresses: Address[] | null }) {
  const { toast } = useToast();
  const [description, setDescription] = React.useState(trip.description);
  const [referenceNumber, setReferenceNumber] = React.useState(trip.referenceNumber || '');
  const [loadAddresses, setLoadAddresses] = React.useState<string[]>(trip.loadAddresses);
  const [unloadAddresses, setUnloadAddresses] = React.useState<string[]>(trip.unloadAddresses);
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  const { data: actions } = useApi<ActionLog[]>(`/api/action-logs?cadenceId=${cadenceId}&tripId=${trip.id}&limit=200`);
  const processedLoadCount = React.useMemo(() => actions?.filter(a => a.actionType === 'loading').length || 0, [actions]);
  const processedUnloadCount = React.useMemo(() => actions?.filter(a => a.actionType === 'unloading').length || 0, [actions]);

  const handleAddrChange = (i: number, v: string, t: 'load' | 'unload') => {
    const arr = t === 'load' ? [...loadAddresses] : [...unloadAddresses];
    arr[i] = v;
    t === 'load' ? setLoadAddresses(arr) : setUnloadAddresses(arr);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!description) return;
    setIsSubmitting(true);
    try {
      await apiMutate('/api/trips', 'PATCH', {
        id: trip.id, cadenceId,
        description,
        referenceNumber: referenceNumber.trim() || null,
        loadAddresses: loadAddresses.filter(a => a.trim()),
        unloadAddresses: unloadAddresses.filter(a => a.trim()),
      });
      toast({ title: 'Рейс оновлено!' });
      onFinished();
    } catch {
      toast({ variant: 'destructive', title: 'Помилка', description: 'Не вдалося оновити рейс.' });
    } finally { setIsSubmitting(false); }
  };

  const AddrRow = ({ arr, setArr, type, lockedCount }: { arr: string[]; setArr: React.Dispatch<React.SetStateAction<string[]>>; type: 'load'|'unload'; lockedCount: number }) => (
    <>
      {arr.map((addr, i) => {
        const isLocked = i < lockedCount;
        return (
          <div key={i} className="flex items-center gap-2">
            <div className="relative flex-1">
              <Input list="edit-saved-addrs" value={addr} onChange={e => handleAddrChange(i, e.target.value, type)} disabled={isLocked} className={cn(isLocked && 'bg-muted pr-8')} />
              {isLocked && <Lock className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />}
            </div>
            {!isLocked && <Button type="button" variant="ghost" size="icon" onClick={() => setArr(arr.filter((_,idx)=>idx!==i))}><Trash2 className="h-4 w-4 text-destructive"/></Button>}
          </div>
        );
      })}
      <Button type="button" variant="outline" size="sm" onClick={() => setArr([...arr,''])} className="w-full gap-2"><PlusCircle className="h-4 w-4"/> Додати адресу</Button>
    </>
  );

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2"><Label>Опис рейсу</Label><Input value={description} onChange={e=>setDescription(e.target.value)} required /></div>
      <div className="space-y-2"><Label>Номер CMR / замовлення</Label><Input value={referenceNumber} onChange={e=>setReferenceNumber(e.target.value)} /></div>
      <div className="space-y-2">
        <Label className="flex items-center gap-2"><Download className="h-4 w-4 text-blue-500"/> Адреси завантаження</Label>
        <AddrRow arr={loadAddresses} setArr={setLoadAddresses} type="load" lockedCount={processedLoadCount} />
      </div>
      <div className="space-y-2">
        <Label className="flex items-center gap-2"><Upload className="h-4 w-4 text-green-500"/> Адреси розвантаження</Label>
        <AddrRow arr={unloadAddresses} setArr={setUnloadAddresses} type="unload" lockedCount={processedUnloadCount} />
      </div>
      <datalist id="edit-saved-addrs">{savedAddresses?.map(a=><option key={a.id} value={a.address}>{a.name}</option>)}</datalist>
      <Button type="submit" className="w-full" disabled={isSubmitting}>
        {isSubmitting ? <Loader2 className="animate-spin h-4 w-4"/> : 'Зберегти зміни'}
      </Button>
    </form>
  );
}

// ─── AddressRow ───────────────────────────────────────────────────────────────
const AddressRow = ({ address, addressMap, onCopy }: { address: string; addressMap: Map<string, Address>; onCopy: (text: string, isCoords: boolean) => void }) => {
  const details = addressMap.get(address.toLowerCase());
  const hasCoords = details && typeof details.entryLatitude === 'number' && typeof details.entryLongitude === 'number' && (details.entryLatitude !== 0 || details.entryLongitude !== 0);
  const textToCopy = hasCoords ? `${details!.entryLatitude},${details!.entryLongitude}` : address;
  return (
    <div className="py-1.5 text-sm">
      <div className="flex items-center justify-between">
        <span className="truncate pr-4 font-medium">{address}</span>
        <Button variant="ghost" size="icon" onClick={() => onCopy(textToCopy, !!hasCoords)} className="h-8 w-8 shrink-0"><Copy className="h-4 w-4"/></Button>
      </div>
      {details?.notes && <p className="text-xs text-muted-foreground pl-1 mt-0.5">{details.notes}</p>}
    </div>
  );
};

// ─── Main TripsClient ─────────────────────────────────────────────────────────
export default function TripsClient({ cadence }: { cadence: Cadence }) {
  const { user } = useUser();
  const { toast } = useToast();
  const { trips, isLoading: areTripsLoading, refetch } = useAllTrips(cadence.id);
  const { data: savedAddresses, isLoading: areAddressesLoading } = useApi<Address[]>(user ? '/api/addresses' : null);

  const [searchTerm, setSearchTerm] = React.useState('');
  const [sortOrder, setSortOrder] = React.useState<'newest'|'oldest'|'status'>('newest');
  const [date, setDate] = React.useState<DateRange|undefined>(undefined);
  const [editingTrip, setEditingTrip] = React.useState<Trip|null>(null);

  const addressMap = React.useMemo(() => {
    const map = new Map<string, Address>();
    savedAddresses?.forEach(a => map.set(a.address.toLowerCase(), a));
    return map;
  }, [savedAddresses]);

  const processedTrips = React.useMemo(() => {
    if (!trips) return [];
    let filtered = [...trips];
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(t =>
        t.id.toLowerCase().includes(term) || t.description.toLowerCase().includes(term) ||
        (t.referenceNumber?.toLowerCase().includes(term)) ||
        t.loadAddresses.some(a=>a.toLowerCase().includes(term)) ||
        t.unloadAddresses.some(a=>a.toLowerCase().includes(term))
      );
    }
    if (date?.from) filtered = filtered.filter(t => new Date(t.createdAt) >= startOfDay(date.from!));
    if (date?.to) filtered = filtered.filter(t => new Date(t.createdAt) <= endOfDay(date.to!));
    switch (sortOrder) {
      case 'oldest': filtered.sort((a,b)=>new Date(a.createdAt).getTime()-new Date(b.createdAt).getTime()); break;
      case 'status': filtered.sort((a,b)=>(a.isClosed?1:0)-(b.isClosed?1:0)||new Date(b.createdAt).getTime()-new Date(a.createdAt).getTime()); break;
      default: filtered.sort((a,b)=>new Date(b.createdAt).getTime()-new Date(a.createdAt).getTime()); break;
    }
    return filtered;
  }, [trips, searchTerm, sortOrder, date]);

  const defaultOpenTripId = React.useMemo(() => processedTrips.find(t=>!t.isClosed)?.id, [processedTrips]);

  const handleCopy = (text: string, isCoords: boolean) => {
    navigator.clipboard.writeText(text);
    toast({ title: 'Скопійовано!', description: isCoords ? `Координати ${text} скопійовано.` : `Адресу "${text}" скопійовано.`, duration: 3000 });
  };

  const handleToggleTripStatus = async (tripId: string, currentlyClosed: boolean) => {
    try {
      await apiMutate('/api/trips', 'PATCH', { id: tripId, cadenceId: cadence.id, isClosed: !currentlyClosed });
      toast({ title: currentlyClosed ? 'Рейс відкрито' : 'Рейс завершено', description: `Рейс ${tripId} ${currentlyClosed ? 'знову активний' : 'перенесено в архів'}.` });
      refetch();
    } catch { toast({ variant: 'destructive', title: 'Помилка' }); }
  };

  const isLoading = areTripsLoading || areAddressesLoading;

  return (
    <div className="space-y-2">
      <Card>
        <CardHeader className="p-4 pb-2">
          <CardTitle className="text-xl flex items-center gap-2"><Route className="h-5 w-5"/>Мої Рейси</CardTitle>
        </CardHeader>
        <CardContent className="p-4 pt-2 space-y-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground"/>
            <Input type="search" placeholder="Пошук за ID, описом, адресою..." className="pl-8 w-full h-9" value={searchTerm} onChange={e=>setSearchTerm(e.target.value)}/>
          </div>
          <div className="flex flex-col sm:flex-row gap-2">
            <Select value={sortOrder} onValueChange={v=>setSortOrder(v as any)}>
              <SelectTrigger className="w-full h-9"><SelectValue placeholder="Сортувати за"/></SelectTrigger>
              <SelectContent>
                <SelectItem value="newest">Спочатку нові</SelectItem>
                <SelectItem value="oldest">Спочатку старі</SelectItem>
                <SelectItem value="status">За статусом</SelectItem>
              </SelectContent>
            </Select>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className={cn('w-full justify-start text-left font-normal h-9', !date && 'text-muted-foreground')}>
                  <CalendarIcon className="mr-2 h-4 w-4"/>
                  {date?.from ? (date.to ? <>{format(date.from,'dd.MM.yy',{locale:uk})} - {format(date.to,'dd.MM.yy',{locale:uk})}</> : format(date.from,'dd.MM.yyyy',{locale:uk})) : <span>Фільтр за датою</span>}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar initialFocus mode="range" defaultMonth={date?.from} selected={date} onSelect={setDate} numberOfMonths={1} locale={uk}/>
              </PopoverContent>
            </Popover>
            {date && <Button variant="ghost" size="sm" onClick={()=>setDate(undefined)}>Очистити</Button>}
          </div>
        </CardContent>
      </Card>

      {isLoading && <div className="flex justify-center items-center p-6"><Loader2 className="h-8 w-8 animate-spin text-primary"/></div>}
      {!isLoading && processedTrips.length === 0 && (
        <p className="text-muted-foreground text-center py-8">{searchTerm||date ? 'Не знайдено рейсів за вашим запитом.' : 'Немає рейсів у цій каденції.'}</p>
      )}

      {!isLoading && processedTrips.length > 0 && (
        <Accordion type="single" collapsible className="w-full" defaultValue={defaultOpenTripId}>
          {processedTrips.map(trip => (
            <AccordionItem value={trip.id} key={trip.id} className="border-b-0">
              <Card className="mb-2">
                <div className="flex items-start">
                  <AccordionTrigger className="flex-1 p-3 hover:no-underline">
                    <div className="flex flex-col text-left overflow-hidden w-full">
                      <div className="flex justify-between items-center">
                        <span className="font-bold truncate pr-2">{trip.referenceNumber || trip.description}</span>
                        <Badge variant={trip.isClosed ? 'secondary' : 'default'}>{trip.isClosed ? 'Закрито' : 'Активний'}</Badge>
                      </div>
                      <span className="text-xs text-muted-foreground">{trip.id}</span>
                    </div>
                  </AccordionTrigger>
                  {!trip.isClosed && (
                    <Button variant="ghost" size="icon" className="mt-3 mr-2 h-8 w-8 shrink-0" onClick={e=>{e.stopPropagation();setEditingTrip(trip);}}>
                      <Pencil className="h-4 w-4"/>
                    </Button>
                  )}
                </div>
                <AccordionContent className="px-3 pb-3">
                  {trip.loadAddresses.length > 0 && (
                    <div>
                      <h4 className="font-semibold text-sm flex items-center gap-2 mb-1"><Download className="h-4 w-4 text-blue-500"/>Завантаження</h4>
                      <div className="divide-y divide-border border-t border-b">
                        {trip.loadAddresses.map((addr,i) => <AddressRow key={i} address={addr} addressMap={addressMap} onCopy={handleCopy}/>)}
                      </div>
                    </div>
                  )}
                  {trip.unloadAddresses.length > 0 && (
                    <div className="mt-3">
                      <h4 className="font-semibold text-sm flex items-center gap-2 mb-1"><Upload className="h-4 w-4 text-green-500"/>Розвантаження</h4>
                      <div className="divide-y divide-border border-t border-b">
                        {trip.unloadAddresses.map((addr,i) => <AddressRow key={i} address={addr} addressMap={addressMap} onCopy={handleCopy}/>)}
                      </div>
                    </div>
                  )}
                  {!trip.loadAddresses.length && !trip.unloadAddresses.length && (
                    <p className="text-sm text-muted-foreground text-center py-4">В цьому рейсі не вказано адрес.</p>
                  )}
                  <div className="mt-4 pt-2 border-t flex justify-end">
                    {trip.isClosed ? (
                      <Button variant="outline" size="sm" className="gap-2" onClick={()=>handleToggleTripStatus(trip.id, true)}>
                        <RotateCcw className="h-4 w-4"/>Відкрити рейс
                      </Button>
                    ) : (
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="outline" size="sm" className="text-destructive hover:bg-destructive/10 hover:text-destructive border-destructive/50 gap-2">
                            <CheckCircle2 className="h-4 w-4"/>Завершити рейс
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent className="max-w-[90vw] sm:max-w-md rounded-lg">
                          <AlertDialogHeader>
                            <AlertDialogTitle>Завершити рейс?</AlertDialogTitle>
                            <AlertDialogDescription>Рейс {trip.id} буде перенесено до архіву.</AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Скасувати</AlertDialogCancel>
                            <AlertDialogAction onClick={()=>handleToggleTripStatus(trip.id, false)}>Завершити</AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    )}
                  </div>
                </AccordionContent>
              </Card>
            </AccordionItem>
          ))}
        </Accordion>
      )}

      <Dialog open={!!editingTrip} onOpenChange={open=>!open&&setEditingTrip(null)}>
        <DialogContent className="max-w-[90vw] sm:max-w-md rounded-lg">
          <DialogHeader>
            <DialogTitle>Редагувати рейс</DialogTitle>
            <DialogDescription>Вже відвідані точки заблоковані.</DialogDescription>
          </DialogHeader>
          {editingTrip && (
            <EditTripForm trip={editingTrip} cadenceId={cadence.id} onFinished={()=>{setEditingTrip(null);refetch();}} savedAddresses={savedAddresses ?? null}/>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
