'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useUser } from '@/hooks/use-user';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, Info, User as UserIcon } from 'lucide-react';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';

function SettingsHeader() {
  const router = useRouter();
  return (
    <header className="flex h-14 items-center justify-between px-4 sm:px-6 bg-card/80 backdrop-blur-sm border-b sticky top-0 z-10">
      <h1 className="text-xl font-headline font-bold text-primary">Налаштування</h1>
      <Button variant="outline" onClick={() => router.push('/')}>Назад до панелі</Button>
    </header>
  );
}

export default function SettingsPage() {
  const { user, isUserLoading } = useUser();
  const router = useRouter();

  React.useEffect(() => {
    if (!isUserLoading && !user) router.push('/login');
  }, [user, isUserLoading, router]);

  if (isUserLoading || !user) {
    return (
      <div className="flex h-dvh items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-dvh bg-background">
      <SettingsHeader />
      <main className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
        <Card className="w-full max-w-2xl mx-auto">
          <CardHeader>
            <div className="flex items-center gap-3">
              <Info className="h-6 w-6 text-primary" />
              <div className="flex flex-col">
                <CardTitle>Про додаток RoadSync</CardTitle>
                <CardDescription>Версія, призначення та технології.</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p>
              <strong>RoadSync</strong> — це цифровий бортовий журнал, створений для спрощення щоденної роботи водіїв-міжнародників. Мета додатку — автоматизувати рутинні завдання, такі як ведення обліку рейсів, витрат та робочого часу.
            </p>
            <p className="text-xs text-muted-foreground pt-2 border-t">
              Версія 2.0.0 — PostgreSQL + NextAuth edition
            </p>
          </CardContent>
        </Card>

        <Card className="w-full max-w-2xl mx-auto">
          <CardHeader>
            <div className="flex items-center gap-3">
              <UserIcon className="h-6 w-6 text-primary" />
              <CardTitle>Обліковий запис</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="flex items-center gap-4">
            <Avatar className="h-16 w-16">
              {user.image ? (
                <AvatarImage src={user.image} alt={user.name || 'Аватар'} />
              ) : (
                <AvatarImage src="https://picsum.photos/seed/100/100/100" alt="Аватар" />
              )}
              <AvatarFallback>
                {user.name ? user.name.charAt(0).toUpperCase() : <UserIcon />}
              </AvatarFallback>
            </Avatar>
            <div className="space-y-1">
              <p className="font-semibold text-lg">{user.name}</p>
              <p className="text-sm text-muted-foreground">{user.email}</p>
              <p className="text-xs text-muted-foreground pt-2">З повагою, ваш колега. ;-)</p>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
