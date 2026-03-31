
'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { 
  Bell, 
  CheckCircle2, 
  AlertCircle, 
  Info, 
  Trash2, 
  ChevronRight, 
  Frown,
  ArrowLeft,
  Clock,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useFirebase } from '@/firebase';
import { dataService } from '@/lib/data/client-service';
import type { Notification } from '@/lib/types';
import { Skeleton } from '@/components/ui/skeleton';
import { formatDistanceToNow, parseISO } from 'date-fns';
import { cn } from '@/lib/utils';
import { Separator } from '@/components/ui/separator';

export default function NotificationsPage() {
  const router = useRouter();
  const { user, isUserLoading } = useFirebase();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (isUserLoading) return;
    if (!user) {
      router.push('/login');
      return;
    }

    const unsubscribe = dataService.onNotificationsSnapshot(user.uid, (data) => {
      setNotifications(data);
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, [user, isUserLoading, router]);

  const handleNotificationClick = async (id: string) => {
    if (!user) return;
    
    // Toggle expansion
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

    // Mark as read if it isn't already
    const notification = notifications.find(n => n.id === id);
    if (notification && !notification.read) {
      await dataService.markNotificationAsRead(user.uid, id);
    }
  };

  const handleMarkAllRead = async () => {
    if (!user) return;
    const unread = notifications.filter(n => !n.read);
    for (const n of unread) {
      await dataService.markNotificationAsRead(user.uid, n.id);
    }
  };

  const getIcon = (type: Notification['type']) => {
    switch (type) {
      case 'alert':
        return <AlertCircle className="h-5 w-5 text-destructive" />;
      case 'trip':
        return <CheckCircle2 className="h-5 w-5 text-green-600" />;
      case 'info':
      default:
        return <Info className="h-5 w-5 text-blue-600" />;
    }
  };

  if (isLoading || isUserLoading) {
    return (
      <div className="container mx-auto px-4 py-8 max-w-3xl">
        <Skeleton className="h-10 w-48 mb-6" />
        <div className="space-y-4">
          {[...Array(5)].map((_, i) => (
            <Skeleton key={i} className="h-24 w-full rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  const unreadCount = notifications.filter(n => !n.read).length;

  return (
    <div className="container mx-auto px-4 py-8 max-w-3xl">
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => router.back()}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-3xl font-bold font-headline">Notifications</h1>
            <p className="text-muted-foreground">Stay updated with your travel journey</p>
          </div>
        </div>
        {unreadCount > 0 && (
          <Button variant="outline" size="sm" onClick={handleMarkAllRead}>
            Mark all as read
          </Button>
        )}
      </div>

      <div className="space-y-4">
        {notifications.length > 0 ? (
          notifications.map((notification) => {
            const isExpanded = expandedIds.has(notification.id);
            return (
              <Card 
                key={notification.id} 
                className={cn(
                  "transition-all duration-200 border shadow-sm hover:shadow-md cursor-pointer",
                  !notification.read ? "bg-blue-50/30 border-blue-100" : "bg-white"
                )}
                onClick={() => handleNotificationClick(notification.id)}
              >
                <CardContent className="p-4 sm:p-6">
                  <div className="flex gap-4">
                    <div className={cn(
                      "flex-shrink-0 h-10 w-10 rounded-full flex items-center justify-center",
                      notification.type === 'alert' ? "bg-red-100" : 
                      notification.type === 'trip' ? "bg-green-100" : "bg-blue-100"
                    )}>
                      {getIcon(notification.type)}
                    </div>
                    <div className="flex-grow min-w-0">
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <h3 className={cn(
                          "font-semibold truncate text-base",
                          !notification.read ? "text-blue-900" : "text-gray-900"
                        )}>
                          {notification.title}
                        </h3>
                        {!notification.read && (
                          <Badge variant="default" className="bg-blue-600 h-2 w-2 p-0 rounded-full shrink-0" />
                        )}
                      </div>
                      <p className={cn(
                        "text-sm text-gray-600 mb-2 transition-all duration-200",
                        !isExpanded && "line-clamp-2"
                      )}>
                        {notification.message}
                      </p>
                      <div className="flex items-center justify-between mt-2">
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <Clock className="h-3 w-3" />
                          <span>{formatDistanceToNow(parseISO(notification.createdAt), { addSuffix: true })}</span>
                        </div>
                        {isExpanded ? (
                          <ChevronUp className="h-4 w-4 text-gray-400" />
                        ) : (
                          <ChevronDown className="h-4 w-4 text-gray-400" />
                        )}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })
        ) : (
          <Card className="border-dashed py-12">
            <CardContent className="flex flex-col items-center justify-center text-center">
              <div className="h-16 w-16 bg-muted rounded-full flex items-center justify-center mb-4">
                <Bell className="h-8 w-8 text-muted-foreground opacity-50" />
              </div>
              <h2 className="text-xl font-semibold text-gray-900">No Notifications</h2>
              <p className="text-muted-foreground mt-1 max-w-xs">
                We'll let you know when there's an update about your trips or account.
              </p>
              <Button 
                variant="outline" 
                className="mt-6"
                onClick={() => router.push('/')}
              >
                Go to Dashboard
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
