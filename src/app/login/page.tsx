'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { signIn } from 'next-auth/react';
import { Button } from '@/components/ui/button';
import { GoogleIcon } from '@/components/icons';
import { Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useUser } from '@/hooks/use-user';

export default function LoginPage() {
  const { user, isUserLoading } = useUser();
  const router = useRouter();
  const { toast } = useToast();
  const [isProcessingLogin, setIsProcessingLogin] = useState(false);

  useEffect(() => {
    if (!isUserLoading && user) {
      router.push('/');
    }
  }, [user, isUserLoading, router]);

  const handleSignIn = async () => {
    setIsProcessingLogin(true);
    try {
      await signIn('google', { callbackUrl: '/' });
    } catch {
      toast({
        variant: 'destructive',
        title: 'Помилка входу',
        description: 'Не вдалося увійти через Google. Спробуйте ще раз.',
      });
      setIsProcessingLogin(false);
    }
  };

  if (isUserLoading || user) {
    return (
      <div className="flex h-dvh flex-col items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="mt-4 text-muted-foreground">Завантаження...</p>
      </div>
    );
  }

  return (
    <div className="flex h-dvh flex-col items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm rounded-lg border bg-card p-8 shadow-lg">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-bold font-headline text-primary">Щоденник RoadSync</h1>
          <p className="text-muted-foreground">Вхід до вашого бортового журналу</p>
        </div>
        <Button className="w-full" onClick={handleSignIn} disabled={isProcessingLogin}>
          {isProcessingLogin ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <GoogleIcon className="mr-2 h-4 w-4" />
          )}
          Увійти через Google
        </Button>
      </div>
    </div>
  );
}
