'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useForm, SubmitHandler } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useUser } from '@/hooks/use-user';
import { useApi, apiMutate } from '@/hooks/use-api';
import type { Address } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';

import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from '@/components/ui/form';
import { Label } from '@/components/ui/label';
import { Loader2, PlusCircle, Trash2, MapPin, Navigation, Pencil, Search } from 'lucide-react';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogClose,
} from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';

const addressSchema = z.object({
  name: z.string().min(2, { message: 'Назва має містити принаймні 2 символи.' }),
  address: z.string().min(10, { message: 'Адреса має містити принаймні 10 символів.' }),
  notes: z.string().optional(),
  entryCoordinates: z.string().optional().refine(val => {
    if (!val || val.trim() === '') return true;
    const parts = val.split(',').map(s => s.trim());
    if (parts.length !== 2) return false;
    return !isNaN(parseFloat(parts[0])) && !isNaN(parseFloat(parts[1]));
  }, { message: 'Неправильний формат. Використовуйте "широта,довгота".' }),
});

type AddressFormValues = z.infer<typeof addressSchema>;

function parseCoords(str: string | undefined | null): { lat?: number; lon?: number } {
  if (!str || !str.trim()) return {};
  const parts = str.split(',').map(s => s.trim());
  if (parts.length !== 2) return {};
  const lat = parseFloat(parts[0]);
  const lon = parseFloat(parts[1]);
  if (isNaN(lat) || isNaN(lon)) return {};
  return { lat, lon };
}

function AddressesHeader() {
  const router = useRouter();
  return (
    <header className="flex h-14 items-center justify-between px-4 sm:px-6 bg-card/80 backdrop-blur-sm border-b sticky top-0 z-10">
      <h1 className="text-xl font-headline font-bold text-primary">Адресна книга</h1>
      <Button variant="outline" onClick={() => router.push('/')}>Назад до панелі</Button>
    </header>
  );
}

function EditAddressForm({ address, onFinished }: { address: Address; onFinished: () => void }) {
  const { toast } = useToast();
  const form = useForm<AddressFormValues>({
    resolver: zodResolver(addressSchema),
    defaultValues: {
      name: address.name, address: address.address, notes: address.notes || '',
      entryCoordinates: (address.entryLatitude && address.entryLongitude)
        ? `${address.entryLatitude},${address.entryLongitude}` : '',
    },
  });
  const { isSubmitting } = form.formState;

  const onSubmit: SubmitHandler<AddressFormValues> = async (values) => {
    try {
      let entryLatitude: number | undefined = address.entryLatitude;
      let entryLongitude: number | undefined = address.entryLongitude;

      // If manual coords provided — use them
      if (values.entryCoordinates && values.entryCoordinates.trim()) {
        const c = parseCoords(values.entryCoordinates);
        entryLatitude = c.lat;
        entryLongitude = c.lon;
      } else if (values.address !== address.address) {
        // Address changed — re-geocode
        toast({ description: 'Адреса змінилась, визначаємо нові координати.' });
        try {
          const geoRes = await fetch('/api/ai/geocode', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ address: values.address }),
          });
          if (geoRes.ok) {
            const { latitude, longitude } = await geoRes.json();
            if (latitude !== 0 || longitude !== 0) {
              entryLatitude = latitude;
              entryLongitude = longitude;
            }
          }
        } catch { /* keep old coords */ }
      }

      await apiMutate('/api/addresses', 'PATCH', {
        id: address.id,
        name: values.name, address: values.address, notes: values.notes,
        entryLatitude, entryLongitude,
      });
      toast({ title: 'Адресу оновлено!' });
      onFinished();
    } catch {
      toast({ variant: 'destructive', title: 'Помилка', description: 'Не вдалося оновити адресу.' });
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-3">
        <FormField control={form.control} name="name" render={({ field }) => (
          <FormItem><FormLabel>Назва / Компанія</FormLabel><FormControl><Input placeholder="напр., Склад Amazon" {...field} /></FormControl><FormMessage /></FormItem>
        )} />
        <FormField control={form.control} name="address" render={({ field }) => (
          <FormItem><FormLabel>Повна адреса</FormLabel><FormControl><Input placeholder="Країна, місто, вулиця, номер будинку" {...field} /></FormControl><FormMessage /></FormItem>
        )} />
        <FormField control={form.control} name="notes" render={({ field }) => (
          <FormItem><FormLabel>Нотатки</FormLabel><FormControl><Textarea placeholder="напр., Час роботи" {...field} /></FormControl><FormMessage /></FormItem>
        )} />
        <FormField control={form.control} name="entryCoordinates" render={({ field }) => (
          <FormItem><FormLabel>Координати заїзду (опціонально)</FormLabel><FormControl><Input placeholder="напр., 50.4501,30.5234" {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>
        )} />
        <DialogFooter>
          <DialogClose asChild><Button type="button" variant="ghost">Скасувати</Button></DialogClose>
          <Button type="submit" disabled={isSubmitting}>{isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Зберегти зміни'}</Button>
        </DialogFooter>
      </form>
    </Form>
  );
}

function AddressCard({ address, onRefetch }: { address: Address; onRefetch: () => void }) {
  const { toast } = useToast();
  const [isDeleting, setIsDeleting] = React.useState(false);
  const [isEditOpen, setIsEditOpen] = React.useState(false);

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      await fetch(`/api/addresses?id=${address.id}`, { method: 'DELETE' });
      toast({ title: 'Адресу видалено' });
      onRefetch();
    } catch { toast({ variant: 'destructive', title: 'Помилка' }); }
    finally { setIsDeleting(false); }
  };

  const needsAttention = !address.entryLatitude || !address.entryLongitude || (address.entryLatitude === 0 && address.entryLongitude === 0);

  return (
    <Card className={cn(needsAttention && 'bg-amber-100/50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-900/40')}>
      <CardHeader className="flex flex-row items-center justify-between p-4 pb-2">
        <CardTitle className="text-lg flex items-center gap-2"><MapPin className="h-5 w-5 text-primary"/>{address.name}</CardTitle>
        <div className="flex items-center">
          <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
            <DialogTrigger asChild><Button variant="ghost" size="icon"><Pencil className="h-4 w-4"/></Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Редагувати адресу</DialogTitle></DialogHeader>
              <EditAddressForm address={address} onFinished={() => { setIsEditOpen(false); onRefetch(); }} />
            </DialogContent>
          </Dialog>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="ghost" size="icon" disabled={isDeleting}>
                {isDeleting ? <Loader2 className="h-4 w-4 animate-spin"/> : <Trash2 className="h-4 w-4 text-destructive"/>}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader><AlertDialogTitle>Ви впевнені?</AlertDialogTitle>
                <AlertDialogDescription>Ця дія видалить адресу "{address.name}" назавжди.</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Скасувати</AlertDialogCancel>
                <AlertDialogAction onClick={handleDelete} className={buttonVariants({ variant: 'destructive' })}>Видалити</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </CardHeader>
      <CardContent className="p-4 pt-2">
        <p className="text-sm text-muted-foreground">{address.address}</p>
        {address.notes && <p className="text-sm mt-2 pt-2 border-t">{address.notes}</p>}
        <div className="mt-2 pt-2 border-t">
          {needsAttention ? (
            <p className="text-sm text-amber-700 dark:text-amber-500 flex items-center gap-1">
              Координати заїзду не вказано. Натисніть <Pencil className="inline h-3 w-3"/> щоб додати.
            </p>
          ) : (
            <>
              <p className="text-sm font-medium flex items-center gap-2"><Navigation className="h-4 w-4 text-primary"/>Координати заїзду:</p>
              <p className="text-xs text-muted-foreground ml-6">{address.entryLatitude?.toFixed(5)},{address.entryLongitude?.toFixed(5)}</p>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export default function AddressesPage() {
  const { user, isUserLoading } = useUser();
  const router = useRouter();
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = React.useState('');
  const [sortOrder, setSortOrder] = React.useState<'name'|'newest'|'attention'>('name');

  const { data: addresses, isLoading: areAddressesLoading, refetch } = useApi<Address[]>(
    user ? '/api/addresses' : null
  );

  const form = useForm<AddressFormValues>({
    resolver: zodResolver(addressSchema),
    defaultValues: { name: '', address: '', notes: '', entryCoordinates: '' },
  });
  const { isSubmitting } = form.formState;

  React.useEffect(() => {
    if (!isUserLoading && !user) router.push('/login');
  }, [user, isUserLoading, router]);

  const processedAddresses = React.useMemo(() => {
    if (!addresses) return [];
    const filtered = addresses.filter(a => {
      const term = searchTerm.toLowerCase();
      return a.name.toLowerCase().includes(term) || a.address.toLowerCase().includes(term) || (a.notes?.toLowerCase().includes(term) ?? false);
    });
    return [...filtered].sort((a, b) => {
      if (sortOrder === 'name') return a.name.localeCompare(b.name);
      if (sortOrder === 'newest') return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
      if (sortOrder === 'attention') {
        const na = !a.entryLatitude || !a.entryLongitude || (a.entryLatitude === 0 && a.entryLongitude === 0);
        const nb = !b.entryLatitude || !b.entryLongitude || (b.entryLatitude === 0 && b.entryLongitude === 0);
        if (na && !nb) return -1; if (!na && nb) return 1;
      }
      return a.name.localeCompare(b.name);
    });
  }, [addresses, searchTerm, sortOrder]);

  const onSubmit: SubmitHandler<AddressFormValues> = async (values) => {
    try {
      // Try to geocode the address via AI
      let entryLatitude: number | undefined;
      let entryLongitude: number | undefined;

      if (values.entryCoordinates && values.entryCoordinates.trim()) {
        const c = parseCoords(values.entryCoordinates);
        entryLatitude = c.lat;
        entryLongitude = c.lon;
      } else {
        toast({ title: 'Обробка адреси...', description: 'Визначаємо координати.' });
        try {
          const geoRes = await fetch('/api/ai/geocode', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ address: values.address }),
          });
          if (geoRes.ok) {
            const { latitude, longitude } = await geoRes.json();
            if (latitude !== 0 || longitude !== 0) {
              entryLatitude = latitude;
              entryLongitude = longitude;
            } else {
              toast({ variant: 'destructive', title: 'Не вдалося знайти адресу', description: 'Адреса буде збережена без координат.' });
            }
          }
        } catch {
          // Geocode failed — save without coords
        }
      }

      await apiMutate('/api/addresses', 'POST', {
        name: values.name, address: values.address, notes: values.notes,
        entryLatitude, entryLongitude,
      });
      toast({ title: 'Адресу збережено!' });
      form.reset();
      refetch();
    } catch {
      toast({ variant: 'destructive', title: 'Помилка', description: 'Не вдалося зберегти адресу.' });
    }
  };

  if (isUserLoading || !user) {
    return <div className="flex h-dvh items-center justify-center bg-background"><Loader2 className="h-8 w-8 animate-spin text-primary"/></div>;
  }

  return (
    <div className="flex flex-col h-dvh bg-background">
      <AddressesHeader/>
      <main className="flex-1 overflow-y-auto p-2 sm:p-4 space-y-4">
        <Card>
          <CardHeader className="p-4"><CardTitle className="text-xl">Додати нову адресу</CardTitle></CardHeader>
          <CardContent className="p-4 pt-0">
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-3">
                <FormField control={form.control} name="name" render={({ field }) => (
                  <FormItem><FormLabel>Назва / Компанія</FormLabel><FormControl><Input placeholder="напр., Склад Amazon" {...field}/></FormControl><FormMessage/></FormItem>
                )}/>
                <FormField control={form.control} name="address" render={({ field }) => (
                  <FormItem><FormLabel>Повна адреса</FormLabel><FormControl><Input placeholder="Країна, місто, вулиця, номер будинку" {...field}/></FormControl><FormMessage/></FormItem>
                )}/>
                <FormField control={form.control} name="notes" render={({ field }) => (
                  <FormItem><FormLabel>Нотатки</FormLabel><FormControl><Textarea placeholder="напр., Час роботи, контактна особа" {...field}/></FormControl><FormMessage/></FormItem>
                )}/>
                <FormField control={form.control} name="entryCoordinates" render={({ field }) => (
                  <FormItem><FormLabel>Координати заїзду (опціонально)</FormLabel><FormControl><Input placeholder="напр., 50.4501,30.5234" {...field} value={field.value ?? ''}/></FormControl><FormMessage/></FormItem>
                )}/>
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin"/> : <PlusCircle className="mr-2 h-4 w-4"/>}
                  Додати адресу
                </Button>
              </form>
            </Form>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <h2 className="text-2xl font-bold font-headline">Збережені адреси</h2>
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground"/>
              <Input type="search" placeholder="Пошук за назвою, адресою, нотатками..." className="pl-8 w-full" value={searchTerm} onChange={e=>setSearchTerm(e.target.value)}/>
            </div>
            <Select value={sortOrder} onValueChange={v=>setSortOrder(v as any)}>
              <SelectTrigger className="w-full sm:w-[200px]"><SelectValue placeholder="Сортувати за"/></SelectTrigger>
              <SelectContent>
                <SelectItem value="name">Назвою (А-Я)</SelectItem>
                <SelectItem value="newest">Датою додавання</SelectItem>
                <SelectItem value="attention">Потребує уваги</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {areAddressesLoading && <div className="flex justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary"/></div>}
          {!areAddressesLoading && processedAddresses.length === 0 && (
            <p className="text-muted-foreground text-center py-4">{searchTerm ? 'Не знайдено адрес за вашим запитом.' : 'У вас ще немає збережених адрес.'}</p>
          )}
          {processedAddresses.map(addr => <AddressCard key={addr.id} address={addr} onRefetch={refetch}/>)}
        </div>
      </main>
    </div>
  );
}
