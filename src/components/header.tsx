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
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogClose,
} from '@/components/ui/dialog';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { format } from 'date-fns';
import { uk } from 'date-fns/locale';

export default function Header() {
  const { user } = useUser();
  const router = useRouter();
  const { toast } = useToast();
  const { activeCadence, refetch } = useActiveCadence();
  const [comment, setComment] = React.useState('');
  const [isEndDialogOpen, setIsEndDialogOpen] = React.useState(false);

  const handleSignOut = async () => {
    await signOut({ callbackUrl: '/login' });
  };

  const handleEndCadence = async () => {
    if (!activeCadence) return;
    try {
      await apiMutate('/api/cadences', 'PATCH', {
        id: activeCadence.id,
        endDate: new Date().toISOString(),
        notes: comment.trim() || null,
      });
      toast({ title: 'Каденцію завершено.' });
      setIsEndDialogOpen(false);
      setComment('');
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
            <Dialog open={isEndDialogOpen} onOpenChange={setIsEndDialogOpen}>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <DialogTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-9 w-9 rounded-full text-destructive hover:bg-destructive/10 hover:text-destructive">
                        <LogOut />
                      </Button>
                    </DialogTrigger>
                  </TooltipTrigger>
                  <TooltipContent><p>Завершити каденцію</p></TooltipContent>
                </Tooltip>
              </TooltipProvider>
              <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                  <DialogTitle>Завершити каденцію</DialogTitle>
                </DialogHeader>
                <div className="py-4 space-y-4">
                  <p className="text-sm text-muted-foreground">
                    Ця дія заархівує поточну каденцію. Ви зможете розпочати нову.
                  </p>
                  <div className="space-y-2">
                    <label htmlFor="cadence-comment" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                      Коментар до каденції (опціонально)
                    </label>
                    <textarea
                      id="cadence-comment"
                      placeholder="Введіть ваш коментар тут..."
                      value={comment}
                      onChange={e => setComment(e.target.value)}
                      className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 resize-y"
                    />
                  </div>
                </div>
                <DialogFooter className="flex sm:justify-end gap-2">
                  <DialogClose asChild>
                    <Button type="button" variant="ghost">Скасувати</Button>
                  </DialogClose>
                  <Button type="button" variant="destructive" onClick={handleEndCadence}>
                    Завершити каденцію
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
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
