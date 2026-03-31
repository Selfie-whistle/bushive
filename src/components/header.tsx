
'use client';

import Link from 'next/link';
import { Bus, MapPin, Ticket, LogOut, User as UserIcon, Settings, Wallet, Bell } from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { Button } from './ui/button';
import { useFirebase } from '@/firebase';
import { Avatar, AvatarFallback, AvatarImage } from './ui/avatar';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from './ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import * as React from 'react';
import { dataService } from '@/lib/data/client-service';
import { Badge } from './ui/badge';

// This signOut function is intentionally simplified for client-side use.
// A more robust implementation might be in a separate auth service file.
async function handleSignOut(auth: any) {
  try {
    if (auth) {
      await auth.signOut();
    }
  } catch (error) {
    console.error('Error signing out:', error);
  }
}

const navLinks = [
  { href: '/track', label: 'My Bus', icon: MapPin },
  { href: '/wallet', label: 'Wallet', icon: Wallet },
];

const ADMIN_EMAILS = [
    'clubanandtravel@gmail.com',
    'youradmin@email.com',
];
  
const CABIN_CREW_EMAIL = 'cabincrew9435@gmail.com';

export function Header() {
  const pathname = usePathname();
  const { user, isUserLoading, auth } = useFirebase();
  const router = useRouter();
  const isAdmin = !!user?.email && ADMIN_EMAILS.includes(user.email);
  const isCabinCrew = user?.email === CABIN_CREW_EMAIL;
  const [isMounted, setIsMounted] = React.useState(false);
  const [unreadCount, setUnreadCount] = React.useState(0);

  React.useEffect(() => {
    setIsMounted(true);
  }, []);

  React.useEffect(() => {
    if (user) {
      const unsubscribe = dataService.onNotificationsSnapshot(user.uid, (notifications) => {
        setUnreadCount(notifications.filter(n => !n.read).length);
      });
      return () => unsubscribe();
    }
  }, [user]);

  const onSignOut = async () => {
    await handleSignOut(auth);
    router.push('/');
  }

  const isAuthPage = pathname === '/login' || pathname === '/signup' || pathname === '/signup/email' || pathname === '/register/admin';

  const getUserDetail = () => {
    if (!user || !user.email) return '';
    if (user.email.endsWith('@example.com')) {
      return user.email.split('@')[0];
    }
    return user.email;
  }
  
  const headerTitle = "BusHive";

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container flex h-16 items-center">
        <Link href="/" className="mr-6 flex items-center space-x-2">
          <Bus className="h-6 w-6 text-primary" />
          <span className="font-bold font-headline text-xl">{headerTitle}</span>
        </Link>
        <nav className="flex flex-1 items-center space-x-4 md:space-x-6 text-sm font-medium">
          {isMounted && navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={cn(
                'transition-colors hover:text-foreground/80 flex items-center gap-2',
                pathname === link.href.split('?')[0] ? 'text-foreground' : 'text-foreground/60'
              )}
            >
              <link.icon className="h-4 w-4" />
              <span className="hidden md:inline">{link.label}</span>
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-4">
          {user && (
            <Button
              variant="ghost"
              size="icon"
              className="relative"
              onClick={() => router.push('/notifications')}
            >
              <Bell className="h-5 w-5" />
              {unreadCount > 0 && (
                <Badge 
                  className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center p-0 text-[10px] bg-red-600 hover:bg-red-600"
                >
                  {unreadCount > 9 ? '9+' : unreadCount}
                </Badge>
              )}
            </Button>
          )}

          {isUserLoading ? (
            <div className="h-8 w-20 animate-pulse rounded-md bg-muted" />
          ) : user ? (
            <AlertDialog>
              <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                      <Button variant="ghost" className="relative h-8 w-8 rounded-full">
                          <Avatar className="h-9 w-9">
                              <AvatarImage src={user.photoURL ?? ''} alt={user.displayName ?? 'User'} />
                              <AvatarFallback>
                                  {user.email ? user.email.charAt(0).toUpperCase() : <UserIcon size={18} />}
                              </AvatarFallback>
                          </Avatar>
                      </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent className="w-56" align="end" forceMount>
                      <DropdownMenuLabel className="font-normal">
                          <div className="flex flex-col space-y-1">
                              <p className="text-sm font-medium leading-none">{user.displayName || 'Welcome'}</p>
                              <p className="text-xs leading-none text-muted-foreground">
                              {getUserDetail()}
                              </p>
                          </div>
                      </DropdownMenuLabel>
                      <DropdownMenuSeparator />
                       {isAdmin ? (
                        <>
                          <DropdownMenuItem onClick={() => router.push('/admin')}>
                            <Settings className="mr-2 h-4 w-4" />
                            <span>Admin Panel</span>
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => router.push('/account')}>
                            <UserIcon className="mr-2 h-4 w-4" />
                            <span>Edit Profile</span>
                          </DropdownMenuItem>
                        </>
                      ) : isCabinCrew ? (
                          <DropdownMenuItem onClick={() => router.push('/cabin-crew')}>
                            <UserIcon className="mr-2 h-4 w-4" />
                            <span>Cabin Crew Console</span>
                          </DropdownMenuItem>
                      ) : (
                        <DropdownMenuItem onClick={() => router.push('/account')}>
                          <Settings className="mr-2 h-4 w-4" />
                          <span>Account</span>
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuItem onClick={() => router.push('/notifications')}>
                        <Bell className="mr-2 h-4 w-4" />
                        <span>Notifications</span>
                      </DropdownMenuItem>
                      <AlertDialogTrigger asChild>
                        <DropdownMenuItem onSelect={(e) => e.preventDefault()}>
                            <LogOut className="mr-2 h-4 w-4" />
                            <span>Log out</span>
                        </DropdownMenuItem>
                      </AlertDialogTrigger>
                  </DropdownMenuContent>
              </DropdownMenu>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Are you sure you want to log out?</AlertDialogTitle>
                  <AlertDialogDescription>
                    You will be returned to the home page.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={onSignOut}>
                    Log Out
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          ) : (
            !isAuthPage && (
                <Button asChild>
                  <Link href="/login">Login</Link>
                </Button>
            )
          )}
        </div>
      </div>
    </header>
  );
}
