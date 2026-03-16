'use client';

import * as React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { useApi } from '@/hooks/use-api';
import { useUser } from '@/hooks/use-user';
import type { ActionLog, Expense, ActivityFeedItem } from '@/lib/types';
import {
  Fuel, Wrench, Download, Upload, Clock, Ban, Truck, WashingMachine, Wallet, LucideIcon, Calendar as CalendarIcon
} from 'lucide-react';
import { format, startOfDay, endOfDay } from 'date-fns';
import { uk } from 'date-fns/locale';
import { DateRange } from 'react-day-picker';
import { Skeleton } from './ui/skeleton';
import { Button } from './ui/button';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';
import { Calendar } from './ui/calendar';
import { cn } from '@/lib/utils';

interface ActivityFeedProps { cadenceId: string; }

const actionIcons: { [key: string]: LucideIcon } = {
  'loading': Download, 'unloading': Upload, 'start-shift': Clock,
  'end-shift': Ban, 'trailer-change': Truck, 'vehicle-change': Wrench,
};
const expenseIcons: { [key: string]: LucideIcon } = {
  'паливо': Fuel, 'adblue': Fuel, 'мийка': WashingMachine, 'обслуговування': Wrench, 'інше': Wallet,
};
const actionTypeTranslations: { [key: string]: string } = {
  'loading': 'Завантаження', 'unloading': 'Розвантаження',
  'start-shift': 'Початок зміни', 'end-shift': 'Кінець зміни',
  'trailer-change': 'Зміна причепа', 'vehicle-change': 'Зміна авто',
  'паливо': 'Паливо', 'adblue': 'AdBlue', 'мийка': 'Мийка',
  'обслуговування': 'Обслуговування', 'інше': 'Інше',
};

const ActivityItem = ({ item, allItems, itemIndex }: { item: ActivityFeedItem, allItems: ActivityFeedItem[], itemIndex: number }) => {
  const isAction = item.recordType === 'action';
  const isExpense = item.recordType === 'expense';
  const Icon = isAction ? actionIcons[(item as ActionLog).actionType] : expenseIcons[(item as Expense).type];
  const title = actionTypeTranslations[isAction ? (item as ActionLog).actionType : (item as Expense).type];

  const formatTimestamp = (ts: string) => {
    try { return format(new Date(ts), 'd MMM, HH:mm', { locale: uk }); }
    catch { return 'очікування...'; }
  };

  let detailsElements: React.ReactNode[] = [];
  const action = isAction ? (item as ActionLog) : undefined;

  if (isExpense) {
    const expense = item as Expense;
    let expenseDetails = `${expense.amount} EUR • ${expense.paymentMethod}`;
    if ((expense.type === 'паливо' || expense.type === 'adblue') && typeof expense.liters === 'number') {
      expenseDetails = `${expense.liters}л, ${expenseDetails}`;
    }
    detailsElements.push(<span key="exp-details">{expenseDetails}</span>);
  } else if (action) {
    if (action.actionType === 'end-shift') {
      const details: React.ReactNode[] = [];
      if (action.drivingTime) details.push(<span key="driving-time">Їзда: {action.drivingTime}</span>);
      const startShiftLog = allItems.slice(itemIndex + 1).find(
        i => i.recordType === 'action' && (i as ActionLog).actionType === 'start-shift'
      ) as (ActionLog & { recordType: 'action' }) | undefined;
      if (startShiftLog) {
        const distance = action.odometer - startShiftLog.odometer;
        if (distance >= 0) details.push(<span key="distance">Шлях: {distance} км</span>);
      }
      if (details.length > 0) detailsElements.push(<div key="shift-details" className="flex flex-col">{details}</div>);
    } else if (action.actionType === 'trailer-change' || action.actionType === 'vehicle-change') {
      const isTrailer = action.actionType === 'trailer-change';
      const newVal = isTrailer ? action.newTrailerNumber : action.newVehicleNumber;
      const oldVal = isTrailer ? action.oldTrailerNumber : action.oldVehicleNumber;
      if (newVal) {
        detailsElements.push(
          <span key="change-details" className="flex items-center gap-1">
            {oldVal ? (<><span className="text-muted-foreground line-through opacity-70">{oldVal}</span><span>→</span></>) : (<span className="text-xs text-muted-foreground mr-1">Новий:</span>)}
            <span className="font-bold text-foreground">{newVal}</span>
          </span>
        );
      }
    } else {
      if (action.weight) detailsElements.push(<span key="weight">{action.weight} кг</span>);
      if (action.notes) detailsElements.push(<span key="notes" className="ml-2">{action.notes}</span>);
    }
  }

  return (
    <div className="flex items-start space-x-2">
      <div className="p-1.5 bg-secondary rounded-full mt-1">
        {Icon && <Icon className="w-4 h-4 text-secondary-foreground" />}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex justify-between items-baseline">
          <p className="font-medium capitalize">{title}</p>
          <p className="text-xs text-muted-foreground whitespace-nowrap">{formatTimestamp(item.timestamp)}</p>
        </div>
        {action?.tripId && <p className="text-sm text-muted-foreground truncate">Рейс: {action.tripId}</p>}
        <div className="flex flex-col text-sm text-muted-foreground text-left">
          <div className="flex flex-wrap items-baseline gap-x-1">{detailsElements}</div>
          {isExpense && (item as Expense).notes && <p className="text-xs italic">"{(item as Expense).notes}"</p>}
          <p>{item.odometer} км{item.locationName ? ` - ${item.locationName}` : ''}</p>
        </div>
      </div>
    </div>
  );
};

export default function ActivityFeed({ cadenceId }: ActivityFeedProps) {
  const { user } = useUser();
  const [filter, setFilter] = React.useState<'all' | 'shift' | 'trip' | 'expense' | 'service'>('all');
  const [date, setDate] = React.useState<DateRange | undefined>(undefined);

  const { data: actionLogs, isLoading: loadingActions } = useApi<ActionLog[]>(
    user ? `/api/action-logs?cadenceId=${cadenceId}&limit=50` : null
  );
  const { data: expenses, isLoading: loadingExpenses } = useApi<Expense[]>(
    user ? `/api/expenses?cadenceId=${cadenceId}` : null
  );

  const combinedFeed = React.useMemo(() => {
    const actions = (actionLogs || []).map(log => ({ ...log, recordType: 'action' as const }));
    const expenseItems = (expenses || []).map(exp => ({ ...exp, recordType: 'expense' as const }));
    return [...actions, ...expenseItems].sort((a, b) =>
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    ) as ActivityFeedItem[];
  }, [actionLogs, expenses]);

  const filteredFeed = React.useMemo(() => {
    let items = combinedFeed;
    switch (filter) {
      case 'shift': items = items.filter(i => i.recordType === 'action' && ['start-shift', 'end-shift'].includes((i as ActionLog).actionType)); break;
      case 'trip': items = items.filter(i => i.recordType === 'action' && ['loading', 'unloading', 'trailer-change', 'vehicle-change'].includes((i as ActionLog).actionType)); break;
      case 'expense': items = items.filter(i => i.recordType === 'expense'); break;
      case 'service': items = items.filter(i => (i.recordType === 'expense' && (i as Expense).type === 'обслуговування') || (i.recordType === 'action' && ['vehicle-change', 'trailer-change'].includes((i as ActionLog).actionType))); break;
    }
    if (date?.from || date?.to) {
      const from = date.from ? startOfDay(date.from) : undefined;
      const to = date.to ? endOfDay(date.to) : undefined;
      items = items.filter(i => {
        const d = new Date(i.timestamp);
        if (from && to) return d >= from && d <= to;
        if (from) return d >= from;
        if (to) return d <= to;
        return true;
      });
    }
    return items;
  }, [combinedFeed, filter, date]);

  const isLoading = loadingActions || loadingExpenses;

  return (
    <Card>
      <CardHeader className="p-4 pb-2">
        <CardTitle className="text-xl">Стрічка активності</CardTitle>
        <div className="flex flex-col gap-2 pt-2">
          <div className="flex flex-wrap gap-2">
            {(['all', 'shift', 'trip', 'expense', 'service'] as const).map(f => (
              <Button key={f} size="sm" variant={filter === f ? 'default' : 'outline'} onClick={() => setFilter(f)}>
                {f === 'all' ? 'Все' : f === 'shift' ? 'Зміна' : f === 'trip' ? 'Рейси' : f === 'expense' ? 'Витрати' : 'Сервіс'}
              </Button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <Popover>
              <PopoverTrigger asChild>
                <Button id="date" variant="outline" size="sm" className={cn('w-full justify-start text-left font-normal', !date && 'text-muted-foreground')}>
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {date?.from ? (date.to ? <>{format(date.from, 'dd.MM.yy', { locale: uk })} - {format(date.to, 'dd.MM.yy', { locale: uk })}</> : format(date.from, 'dd.MM.yyyy', { locale: uk })) : <span>Вибрати діапазон</span>}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar initialFocus mode="range" defaultMonth={date?.from} selected={date} onSelect={setDate} numberOfMonths={1} locale={uk} />
              </PopoverContent>
            </Popover>
            {date && <Button variant="ghost" size="sm" onClick={() => setDate(undefined)}>Очистити</Button>}
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-4 pt-2">
        {isLoading && (
          <div className="space-y-3">
            <Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-full" />
          </div>
        )}
        {!isLoading && filteredFeed.length === 0 && (
          <p className="text-muted-foreground text-center py-4">
            {filter === 'all' && !date ? 'Ще немає жодних записів у цій каденції.' : 'Немає записів, що відповідають цим фільтрам.'}
          </p>
        )}
        <div className="space-y-3">
          {filteredFeed.map((item, index, array) => (
            <ActivityItem key={`${item.recordType}-${item.id}`} item={item} allItems={array} itemIndex={index} />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
