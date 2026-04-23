'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { signOut } from 'next-auth/react';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button, buttonVariants } from '@/components/ui/button';
import { LogOut, Settings, User as UserIcon, Archive, BookUser } from 'lucide-react';
import { useUser } from '@/hooks/use-user';
import { useActiveCadence } from '@/hooks/use-active-cadence';
import { useToast } from '@/hooks/use-toast';
import { apiMutate } from '@/hooks/use-api';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader,
  AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { format } from 'date-fns';
import { uk } from 'date-fns/locale';

export default function Header() {
  const { user } = useUser();
  const router = useRouter();
  const { toast } = useToast();
  const { activeCadence, refetch } = useActiveCadence();

  const handleSignOut = async () => {
    await signOut({ callbackUrl: '/login' });
  };

  const handleEndCadence = async () => {
    if (!activeCadence) return;
    try {
      await apiMutate('/api/cadences', 'PATCH', {
        id: activeCadence.id,
        endDate: new Date().toISOString(),
      });
      toast({ title: 'Каденцію завершено.' });
      refetch();
    } catch {
      toast({ variant: 'destructive', title: 'Помилка', description: 'Не вдалося завершити каденцію.' });
    }
  };

  return (
    <header className="flex h-14 items-center justify-between px-4 sm:px-6 bg-card/80 backdrop-blur-sm border-b sticky top-0 z-10">
      {activeCadence ? (
        <div>
          <h1 className="text-lg font-headline font-bold text-primary leading-tight">
            {activeCadence.firmName}
          </h1>
          <p className="text-xs text-muted-foreground">
            з {format(new Date(activeCadence.startDate), 'dd.MM.yyyy', { locale: uk })}
          </p>
        </div>
      ) : (
        <h1 className="text-xl font-headline font-bold text-primary">Щоденник RoadSync</h1>
      )}

      {user && (
        <div className="flex items-center gap-2">
          {activeCadence && (
            <AlertDialog>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <AlertDialogTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-9 w-9 rounded-full text-destructive hover:bg-destructive/10 hover:text-destructive">
                        <LogOut />
                      </Button>
                    </AlertDialogTrigger>
                  </TooltipTrigger>
                  <TooltipContent><p>Завершити каденцію</p></TooltipContent>
                </Tooltip>
              </TooltipProvider>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Ви впевнені, що хочете завершити каденцію?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Ця дія заархівує поточну каденцію. Ви зможете розпочати нову.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Скасувати</AlertDialogCancel>
                  <AlertDialogAction onClick={handleEndCadence} className={buttonVariants({ variant: 'destructive' })}>
                    Завершити
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="relative h-9 w-9 rounded-full">
                <Avatar className="h-9 w-9">
                  {user.image ? (
                    <AvatarImage src={user.image} alt={user.name || 'Аватар'} />
                  ) : (
                    <AvatarImage src="https://picsum.photos/seed/100/100/100" alt="Аватар" />
                  )}
                  <AvatarFallback>
                    {user.name ? user.name.charAt(0).toUpperCase() : <UserIcon />}
                  </AvatarFallback>
                </Avatar>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-56" align="end" forceMount>
              <DropdownMenuLabel className="font-normal">
                <div className="flex flex-col space-y-1">
                  <p className="text-sm font-medium leading-none">{user.name || 'Водій'}</p>
                  <p className="text-xs leading-none text-muted-foreground">{user.email}</p>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => router.push('/addresses')}>
                <BookUser className="mr-2 h-4 w-4" />
                <span>Адресна книга</span>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => router.push('/archive')}>
                <Archive className="mr-2 h-4 w-4" />
                <span>Архів каденцій</span>
              </DropdownMenuItem>

              <DropdownMenuItem onClick={() => router.push('/settings')}>
                <Settings className="mr-2 h-4 w-4" />
                <span>Налаштування</span>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleSignOut}>
                <LogOut className="mr-2 h-4 w-4" />
                <span>Вийти</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}
    </header>
  );
}
