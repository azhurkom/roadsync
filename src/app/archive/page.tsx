'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useUser } from '@/hooks/use-user';
import { useApi } from '@/hooks/use-api';
import type { Cadence, ActionLog, Expense, Trip } from '@/lib/types';
import { format } from 'date-fns';
import { uk } from 'date-fns/locale';
import { ArrowLeft, ChevronDown, ChevronUp, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';

function CadenceDetails({ cadence }: { cadence: Cadence }) {
  const { data: trips, isLoading: tripsLoading } = useApi<Trip[]>(
    `/api/trips?cadenceId=${cadence.id}`
  );
  const { data: logs, isLoading: logsLoading } = useApi<ActionLog[]>(
    `/api/action-logs?cadenceId=${cadence.id}&limit=200`
  );
  const { data: expenses, isLoading: expensesLoading } = useApi<Expense[]>(
    `/api/expenses?cadenceId=${cadence.id}`
  );

  const isLoading = tripsLoading || logsLoading || expensesLoading;

  if (isLoading) return (
    <div className="flex justify-center p-4">
      <Loader2 className="h-6 w-6 animate-spin text-primary" />
    </div>
  );

  return (
    <div className="space-y-4 pt-2">
      {/* Рейси */}
      <div>
        <h3 className="text-sm font-semibold text-muted-foreground mb-2">
          Рейси ({trips?.length || 0})
        </h3>
        {trips && trips.length > 0 ? (
          <div className="space-y-1">
            {trips.map(trip => (
              <div key={trip.id} className="flex items-center justify-between p-2 bg-secondary/50 rounded-md text-sm">
                <div>
                  <p className="font-medium">{trip.description}</p>
                  <p className="text-xs text-muted-foreground">{trip.id}</p>
                </div>
                <Badge variant={trip.isClosed ? 'secondary' : 'default'}>
                  {trip.isClosed ? 'Закрито' : 'Активний'}
                </Badge>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Немає рейсів</p>
        )}
      </div>

      {/* Статистика */}
      <div className="grid grid-cols-3 gap-2">
        <div className="bg-secondary/50 rounded-md p-2 text-center">
          <p className="text-lg font-bold">{logs?.filter(l => l.actionType === 'start-shift').length || 0}</p>
          <p className="text-xs text-muted-foreground">Змін</p>
        </div>
        <div className="bg-secondary/50 rounded-md p-2 text-center">
          <p className="text-lg font-bold">{logs?.filter(l => l.actionType === 'loading').length || 0}</p>
          <p className="text-xs text-muted-foreground">Завантажень</p>
        </div>
        <div className="bg-secondary/50 rounded-md p-2 text-center">
          <p className="text-lg font-bold">{expenses?.length || 0}</p>
          <p className="text-xs text-muted-foreground">Витрат</p>
        </div>
      </div>
    </div>
  );
}

function CadenceCard({ cadence }: { cadence: Cadence }) {
  const [isOpen, setIsOpen] = React.useState(false);

  return (
    <Card>
      <CardHeader className="p-4 pb-2 cursor-pointer" onClick={() => setIsOpen(!isOpen)}>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base">{cadence.firmName}</CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">
              {format(new Date(cadence.startDate), 'dd.MM.yyyy', { locale: uk })}
              {cadence.endDate && ` — ${format(new Date(cadence.endDate), 'dd.MM.yyyy', { locale: uk })}`}
            </p>
            <p className="text-xs text-muted-foreground">{cadence.vehicleNumber} · {cadence.trailerNumber}</p>
          </div>
          {isOpen ? <ChevronUp className="h-5 w-5 text-muted-foreground" /> : <ChevronDown className="h-5 w-5 text-muted-foreground" />}
        </div>
      </CardHeader>
      {isOpen && (
        <CardContent className="p-4 pt-0">
          <CadenceDetails cadence={cadence} />
        </CardContent>
      )}
    </Card>
  );
}

export default function ArchivePage() {
  const { user, isUserLoading } = useUser();
  const router = useRouter();
  const [search, setSearch] = React.useState('');

  const { data: cadences, isLoading } = useApi<Cadence[]>(
    user ? '/api/cadences' : null
  );

  React.useEffect(() => {
    if (!isUserLoading && !user) router.push('/login');
  }, [user, isUserLoading, router]);

  const closedCadences = React.useMemo(() => {
    if (!cadences) return [];
    return cadences
      .filter(c => c.endDate !== null)
      .filter(c => !search || c.firmName.toLowerCase().includes(search.toLowerCase()))
      .sort((a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime());
  }, [cadences, search]);

  if (isUserLoading || isLoading) return (
    <div className="flex h-dvh items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
    </div>
  );

  return (
    <div className="flex flex-col h-dvh bg-background">
      <header className="flex h-14 items-center gap-3 px-4 bg-card/80 backdrop-blur-sm border-b sticky top-0 z-10">
        <Button variant="ghost" size="icon" onClick={() => router.back()}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-lg font-headline font-bold text-primary">Архів каденцій</h1>
      </header>
      <main className="flex-1 overflow-y-auto p-4 space-y-3">
        <Input
          placeholder="Пошук за назвою фірми..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        {closedCadences.length === 0 && (
          <p className="text-center text-muted-foreground py-8">
            {search ? 'Нічого не знайдено' : 'Немає закритих каденцій'}
          </p>
        )}
        {closedCadences.map(cadence => (
          <CadenceCard key={cadence.id} cadence={cadence} />
        ))}
      </main>
    </div>
  );
}
