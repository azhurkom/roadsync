'use client';

import * as React from 'react';
import { useForm, SubmitHandler } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Loader2, PlayCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useActiveCadence } from '@/hooks/use-active-cadence';
import { apiMutate } from '@/hooks/use-api';

const formSchema = z.object({
  firmName: z.string().min(2, { message: 'Назва фірми має бути принаймні 2 символи.' }),
  vehicleNumber: z.string().min(4, { message: 'Номер авто має бути принаймні 4 символи.' }),
  trailerNumber: z.string().min(4, { message: 'Номер причепа має бути принаймні 4 символи.' }),
});

type CadenceFormValues = z.infer<typeof formSchema>;

export default function CadenceManager() {
  const { toast } = useToast();
  const { refetch } = useActiveCadence();

  const form = useForm<CadenceFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { firmName: '', vehicleNumber: '', trailerNumber: '' },
  });

  const { isSubmitting } = form.formState;

  const onSubmit: SubmitHandler<CadenceFormValues> = async (values) => {
    try {
      await apiMutate('/api/cadences', 'POST', values);
      toast({ title: 'Каденцію розпочато!' });
      refetch();
    } catch {
      toast({ variant: 'destructive', title: 'Помилка', description: 'Не вдалося створити каденцію.' });
    }
  };

  return (
    <div className="p-2 sm:p-4">
      <Card className="w-full max-w-lg mx-auto">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)}>
            <CardHeader className="p-4">
              <CardTitle className="text-xl">Почати нову каденцію</CardTitle>
              <CardDescription>Введіть дані, щоб розпочати відстеження вашої роботи.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 p-4 pt-0">
              <FormField control={form.control} name="firmName" render={({ field }) => (
                <FormItem>
                  <FormLabel>Назва фірми</FormLabel>
                  <FormControl><Input placeholder="напр., Acme Logistics" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="vehicleNumber" render={({ field }) => (
                <FormItem>
                  <FormLabel>Номер транспортного засобу</FormLabel>
                  <FormControl><Input placeholder="напр., AA 1234 BB" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="trailerNumber" render={({ field }) => (
                <FormItem>
                  <FormLabel>Номер причепа</FormLabel>
                  <FormControl><Input placeholder="напр., AX 5678 YT" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            </CardContent>
            <CardFooter className="p-4 pt-0">
              <Button type="submit" className="w-full" disabled={isSubmitting}>
                {isSubmitting ? <Loader2 className="animate-spin" /> : <><PlayCircle className="mr-2" />Почати каденцію</>}
              </Button>
            </CardFooter>
          </form>
        </Form>
      </Card>
    </div>
  );
}
