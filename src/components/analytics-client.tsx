'use client';

import * as React from 'react';
import { BarChart, Fuel, Gauge, GaugeCircle, Wallet, Scale, Droplets, Calendar as CalendarIcon, MapPin, Plus } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Loader2 } from 'lucide-react';
import { ActionDialog } from '@/components/action-dialog';
import { useApi } from '@/hooks/use-api';
import { useUser } from '@/hooks/use-user';
import type { Cadence, ActionLog, Expense } from '@/lib/types';
import { format, startOfDay, endOfDay } from 'date-fns';
import { uk } from 'date-fns/locale';
import { type DateRange } from 'react-day-picker';
import { PieChart, Pie, Cell, Tooltip, Legend } from 'recharts';
import { ChartContainer } from '@/components/ui/chart';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { cn } from '@/lib/utils';

interface AnalyticsClientProps { cadence: Cadence; }

const COLORS = ['hsl(var(--chart-1))','hsl(var(--chart-2))','hsl(var(--chart-3))','hsl(var(--chart-4))','hsl(var(--chart-5))'];

const parseDrivingTime = (s?: string): number => {
  if (!s) return 0;
  const [h, m] = s.split(':').map(Number);
  return (isNaN(h) || isNaN(m)) ? 0 : h + m / 60;
};

export default function AnalyticsClient({ cadence }: AnalyticsClientProps) {
  const [isActionDialogOpen, setIsActionDialogOpen] = React.useState(false);
  const { user } = useUser();
  const [date, setDate] = React.useState<DateRange | undefined>(undefined);

  const { data: actionLogs, isLoading: loadingActions } = useApi<ActionLog[]>(
    user ? `/api/action-logs?cadenceId=${cadence.id}&limit=1000` : null, { refreshInterval: 30000 }
  );
  const { data: expenses, isLoading: loadingExpenses } = useApi<Expense[]>(
    user ? `/api/expenses?cadenceId=${cadence.id}` : null, { refreshInterval: 30000 }
  );

  const analyticsData = React.useMemo(() => {
    if (!actionLogs || !expenses) return null;
    const from = date?.from ? startOfDay(date.from) : undefined;
    const to = date?.to ? endOfDay(date.to) : undefined;
    const inRange = (ts: string) => {
      const d = new Date(ts);
      if (from && to) return d >= from && d <= to;
      if (from) return d >= from; if (to) return d <= to; return true;
    };
    const logs = actionLogs.filter(l => l.timestamp && inRange(l.timestamp));
    const exps = expenses.filter(e => e.timestamp && inRange(e.timestamp));
    const sorted = [...logs].sort((a,b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

    let totalDistance = 0, totalDrivingTimeHours = 0, lastStart = 0, totalWeightKg = 0, loadCount = 0;
    sorted.forEach(log => {
      if (log.actionType === 'start-shift') lastStart = log.odometer;
      if (log.actionType === 'end-shift') {
        if (lastStart > 0) { const d = log.odometer - lastStart; if (d > 0) totalDistance += d; }
        totalDrivingTimeHours += parseDrivingTime(log.drivingTime);
      }
      if (log.actionType === 'loading' && log.weight) { totalWeightKg += log.weight; loadCount++; }
    });

    const visited = logs.filter(l => (l.actionType==='loading'||l.actionType==='unloading') && l.locationName).map(l => l.locationName!);
    const visitCounts = visited.reduce((a,v) => { a[v]=(a[v]||0)+1; return a; }, {} as Record<string,number>);
    const top3 = Object.entries(visitCounts).sort(([,a],[,b])=>b-a).slice(0,3).map(([name,count])=>({name,count}));

    const avgWeight = loadCount > 0 ? totalWeightKg / loadCount : 0;
    const avgSpeed = totalDrivingTimeHours > 0 && totalDistance > 0 ? totalDistance / totalDrivingTimeHours : 0;
    const fuelExps = exps.filter(e=>e.type==='паливо'&&e.odometer&&e.liters).sort((a,b)=>a.odometer-b.odometer);
    const totalLiters = fuelExps.length>=2 ? fuelExps.slice(0,-1).reduce((s,e)=>s+(e.liters||0),0) : 0;
    let fuelConsumption = 0;
    if (totalLiters>0&&fuelExps.length>=2) { const d=fuelExps[fuelExps.length-1].odometer-fuelExps[0].odometer; if(d>0) fuelConsumption=(totalLiters/d)*100; }
    const fuelPerTonKm = totalLiters>0&&totalDistance>0&&avgWeight>0 ? (totalLiters/(totalDistance*(avgWeight/1000)))*100 : 0;
    const expCounts = exps.reduce((a,e)=>{ a[e.type]=(a[e.type]||0)+1; return a; }, {} as Record<string,number>);

    return { totalDistance, totalDrivingTimeHours, averageSpeed: avgSpeed, fuelConsumption, expenseChartData: Object.entries(expCounts).map(([name,value])=>({name,value})), totalWeightKg, averageWeightKg: avgWeight, fuelPerTonKm, totalVisits: visited.length, uniqueVisits: Object.keys(visitCounts).length, top3VisitedAddresses: top3 };
  }, [actionLogs, expenses, date]);

  if (loadingActions || loadingExpenses)
    return <div className="flex h-[calc(100dvh-8rem)] items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

  const chartConfig = analyticsData?.expenseChartData.reduce((a,e,i)=>{ a[e.name]={label:e.name,color:COLORS[i%COLORS.length]}; return a; }, {} as any) || {};
  const noData = !analyticsData || (analyticsData.totalDistance===0 && analyticsData.expenseChartData.length===0 && analyticsData.totalWeightKg===0 && analyticsData.totalVisits===0);

  return (
    <div className="space-y-2">
      <Card>
        <CardHeader className="p-4 pb-2"><CardTitle className="text-sm font-medium">Фільтр за датою</CardTitle></CardHeader>
        <CardContent className="p-4 pt-0">
          <div className="flex items-center gap-2">
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className={cn('w-full justify-start text-left font-normal h-9', !date && 'text-muted-foreground')}>
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {date?.from ? (date.to ? <>{format(date.from,'dd.MM.yy',{locale:uk})} - {format(date.to,'dd.MM.yy',{locale:uk})}</> : format(date.from,'dd.MM.yyyy',{locale:uk})) : <span>Вибрати діапазон</span>}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar initialFocus mode="range" defaultMonth={date?.from} selected={date} onSelect={setDate} numberOfMonths={1} locale={uk} />
              </PopoverContent>
            </Popover>
            {date && <Button variant="ghost" size="sm" onClick={()=>setDate(undefined)}>Очистити</Button>}
          </div>
        </CardContent>
      </Card>

      {noData ? <p className="text-center text-muted-foreground mt-8 py-8">Недостатньо даних для аналітики за вибраний період.</p> : (<>
        <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-4">
          {[
            {title:'Середня витрата',Icon:Fuel,value:analyticsData!.fuelConsumption.toFixed(2),desc:'л / 100 км'},
            {title:'Середня швидкість',Icon:Gauge,value:analyticsData!.averageSpeed.toFixed(1),desc:'км / год'},
            {title:'Загальна відстань',Icon:GaugeCircle,value:analyticsData!.totalDistance.toFixed(0),desc:'км за період'},
            {title:'Час за кермом',Icon:BarChart,value:analyticsData!.totalDrivingTimeHours.toFixed(1),desc:'годин за період'},
            {title:'Загальна вага',Icon:Scale,value:(analyticsData!.totalWeightKg/1000).toFixed(2),desc:'тонн за період'},
            {title:'Середня вага',Icon:Scale,value:analyticsData!.averageWeightKg.toFixed(0),desc:'кг на завантаження'},
            {title:'Витрата на вагу',Icon:Droplets,value:analyticsData!.fuelPerTonKm.toFixed(2),desc:'л / 100 т-км'},
          ].map(({title,Icon,value,desc})=>(
            <Card key={title}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">{title}</CardTitle><Icon className="h-4 w-4 text-muted-foreground"/>
              </CardHeader>
              <CardContent><div className="text-2xl font-bold">{value}</div><p className="text-xs text-muted-foreground">{desc}</p></CardContent>
            </Card>
          ))}
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><MapPin className="h-5 w-5"/>Аналіз Адрес</CardTitle>
            <CardDescription>Статистика по відвіданих адресах завантаження та розвантаження.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex justify-around text-center">
              <div><p className="text-2xl font-bold">{analyticsData!.totalVisits}</p><p className="text-xs text-muted-foreground">Всього візитів</p></div>
              <div><p className="text-2xl font-bold">{analyticsData!.uniqueVisits}</p><p className="text-xs text-muted-foreground">Унікальних адрес</p></div>
            </div>
            {analyticsData!.top3VisitedAddresses.length>0&&(
              <div><h4 className="font-medium text-center mb-2">Топ-3 найвідвідуваніших</h4>
                <div className="space-y-2">{analyticsData!.top3VisitedAddresses.map((a,i)=>(
                  <div key={i} className="flex justify-between items-center p-2 rounded-lg bg-muted/50">
                    <span className="font-medium truncate pr-4">{a.name}</span>
                    <span className="font-bold text-primary">{a.count} {a.count>4?'разів':a.count>1?'рази':'раз'}</span>
                  </div>
                ))}</div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Wallet className="h-5 w-5"/>Аналіз витрат</CardTitle>
            <CardDescription>Співвідношення кількості різних типів витрат за період.</CardDescription>
          </CardHeader>
          <CardContent>
            {analyticsData!.expenseChartData.length>0 ? (
              <ChartContainer config={chartConfig} className="mx-auto aspect-square h-[250px]">
                <PieChart>
                  <Tooltip contentStyle={{background:'hsl(var(--background))',border:'1px solid hsl(var(--border))'}}/>
                  <Legend/>
                  <Pie data={analyticsData!.expenseChartData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label>
                    {analyticsData!.expenseChartData.map((_,i)=><Cell key={i} fill={COLORS[i%COLORS.length]}/>)}
                  </Pie>
                </PieChart>
              </ChartContainer>
            ) : <p className="text-center text-muted-foreground py-8">Немає даних про витрати за період.</p>}
          </CardContent>
        </Card>
      </>)}
      <ActionDialog
        open={isActionDialogOpen}
        onOpenChange={setIsActionDialogOpen}
        cadence={cadence}
      />
      <div className="fixed bottom-4 right-4 z-20">
        <Button
          size="icon"
          className="h-14 w-14 rounded-full shadow-lg"
          style={{
            background: 'linear-gradient(135deg, hsl(var(--accent)), hsl(var(--primary)))',
            color: 'hsl(var(--accent-foreground))',
          }}
          onClick={() => setIsActionDialogOpen(true)}
          aria-label="Додати нову дію"
        >
          <Plus className="h-8 w-8" />
        </Button>
      </div>
    </div>
  );
}
