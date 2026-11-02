
'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { 
  Star, 
  MessageCircle, 
  ArrowLeft, 
  Bus,
  Calendar,
  Frown,
  Search,
  Filter,
} from 'lucide-react';
import { useFirebase } from '@/firebase';
import { dataService } from '@/lib/data/client-service';
import { format, parseISO } from 'date-fns';
import type { Review, Bus as BusType } from '@/lib/types';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from '@/components/ui/select';

export default function AllReviewsPage() {
  const { user, isUserLoading } = useFirebase();
  const router = useRouter();
  
  const [reviews, setReviews] = useState<Review[]>([]);
  const [buses, setBuses] = useState<Record<string, BusType>>({});
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);

  // Filter and Sort State
  const [searchQuery, setSearchQuery] = useState('');
  const [ratingFilter, setRatingFilter] = useState('all');
  const [sortOption, setSortOption] = useState('ratingDesc');

  useEffect(() => {
    if (isUserLoading) return;
    if (!user) {
      setIsAdmin(false);
      setLoading(false);
      return;
    }

    let unsubscribe: (() => void) | undefined;

    dataService.isAdmin(user.uid).then(status => {
      setIsAdmin(status);
      if (status) {
        dataService.getBusesByOperator(user.uid, user.displayName || '').then(busList => {
          const busMap = busList.reduce((acc, bus) => {
            acc[bus.id] = bus;
            return acc;
          }, {} as Record<string, BusType>);
          setBuses(busMap);

          unsubscribe = dataService.onAllReviewsSnapshot((allReviews) => {
            const operatorReviews = allReviews.filter(r => busMap[r.busId]);
            setReviews(operatorReviews);
            setLoading(false);
          });
        });
      } else {
        setLoading(false);
      }
    });

    return () => {
        if (unsubscribe) unsubscribe();
    };
  }, [user, isUserLoading]);

  // Processed Reviews Logic
  const processedGroups = useMemo(() => {
    // 1. Filter individual reviews by star rating
    const filteredReviews = reviews.filter(review => {
      if (ratingFilter === 'all') return true;
      return review.busRating === parseInt(ratingFilter);
    });

    // 2. Group by Bus ID
    const groups: Record<string, { bus: BusType | undefined, reviews: Review[], avgRating: number }> = {};
    
    filteredReviews.forEach(review => {
      if (!groups[review.busId]) {
        groups[review.busId] = {
          bus: buses[review.busId],
          reviews: [],
          avgRating: 0
        };
      }
      groups[review.busId].reviews.push(review);
    });

    // Calculate averages and filter by search query
    let result = Object.entries(groups).map(([busId, data]) => {
      const sum = data.reviews.reduce((acc, r) => acc + r.busRating, 0);
      return {
        busId,
        ...data,
        avgRating: parseFloat((sum / data.reviews.length).toFixed(1))
      };
    }).filter(group => {
      if (!searchQuery) return true;
      const term = searchQuery.toLowerCase();
      return (
        group.bus?.travelsName.toLowerCase().includes(term) ||
        group.bus?.busNumber.toLowerCase().includes(term) ||
        group.busId.toLowerCase().includes(term)
      );
    });

    // 3. Sort Groups
    result.sort((a, b) => {
      switch (sortOption) {
        case 'ratingDesc': return b.avgRating - a.avgRating;
        case 'ratingAsc': return a.avgRating - b.avgRating;
        case 'reviewsDesc': return b.reviews.length - a.reviews.length;
        case 'nameAsc': return (a.bus?.travelsName || '').localeCompare(b.bus?.travelsName || '');
        default: return 0;
      }
    });

    return result;
  }, [reviews, buses, searchQuery, ratingFilter, sortOption]);

  const getRatingColorClasses = (rating: number) => {
    switch (rating) {
      case 5: return "bg-green-700/10 border-green-700 text-green-900";
      case 4: return "bg-green-400/10 border-green-400 text-green-800";
      case 3: return "bg-yellow-400/10 border-yellow-400 text-yellow-800";
      case 2: return "bg-orange-400/10 border-orange-400 text-orange-800";
      case 1: return "bg-red-400/10 border-red-400 text-red-800";
      default: return "bg-primary/5 border-primary/20 text-gray-700";
    }
  };

  if (loading || isUserLoading) {
    return (
      <div className="container mx-auto px-4 py-8 max-w-5xl">
        <Skeleton className="h-10 w-48 mb-6" />
        <div className="space-y-6">
          {[...Array(3)].map((_, i) => (
            <Card key={i}>
              <CardHeader>
                <div className="flex items-center gap-4">
                  <Skeleton className="h-12 w-12 rounded-xl" />
                  <div className="space-y-2 flex-1">
                    <Skeleton className="h-6 w-1/4" />
                    <Skeleton className="h-4 w-1/3" />
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <Skeleton className="h-20 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="container mx-auto px-4 py-8 flex items-center justify-center min-h-[60vh]">
        <Card className="max-w-md w-full text-center p-6">
          <Frown className="w-12 h-12 mx-auto text-destructive mb-4" />
          <CardTitle>Access Denied</CardTitle>
          <p className="text-muted-foreground mt-2">You do not have permission to view this page.</p>
          <Button onClick={() => router.push('/')} className="mt-6">Go Home</Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-5xl">
      <header className="mb-8 flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => router.back()} className="rounded-full">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-3xl font-bold font-headline">Passenger Reviews</h1>
            <p className="text-muted-foreground">Detailed feedback grouped by bus service</p>
          </div>
        </div>

        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input 
              placeholder="Search bus..." 
              className="pl-9 w-[200px]"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          
          <Select value={ratingFilter} onValueChange={setRatingFilter}>
            <SelectTrigger className="w-[140px]">
              <div className="flex items-center gap-2">
                <Filter className="h-3.5 w-3.5 text-muted-foreground" />
                <SelectValue placeholder="Rating" />
              </div>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Ratings</SelectItem>
              <SelectItem value="5">5 Stars</SelectItem>
              <SelectItem value="4">4 Stars</SelectItem>
              <SelectItem value="3">3 Stars</SelectItem>
              <SelectItem value="2">2 Stars</SelectItem>
              <SelectItem value="1">1 Star</SelectItem>
            </SelectContent>
          </Select>

          <Select value={sortOption} onValueChange={setSortOption}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="Sort by" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ratingDesc">Highest Rated</SelectItem>
              <SelectItem value="ratingAsc">Lowest Rated</SelectItem>
              <SelectItem value="reviewsDesc">Most Reviews</SelectItem>
              <SelectItem value="nameAsc">Name (A-Z)</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </header>

      {processedGroups.length > 0 ? (
        <div className="space-y-8">
          {processedGroups.map((group) => {
            const { bus, reviews: busReviews, avgRating, busId } = group;
            
            return (
              <Card key={busId} className="overflow-hidden border shadow-md">
                <CardHeader className="bg-muted/30 border-b py-6">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="flex items-center gap-4">
                      <div className="p-3 rounded-xl bg-white shadow-sm border text-primary">
                        <Bus className="h-6 w-6" />
                      </div>
                      <div>
                        <CardTitle className="text-xl font-headline font-semibold">{bus?.travelsName || 'Bus Service'}</CardTitle>
                        <CardDescription className="flex items-center gap-2 mt-1">
                          <span className="bg-yellow-400 text-black font-mono text-xs font-bold px-2 py-0.5 rounded border-2 border-black">
                            {bus?.busNumber || busId}
                          </span>
                          <span className="text-gray-400">•</span>
                          <span className="font-medium text-gray-600">{busReviews.length} matching reviews</span>
                        </CardDescription>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 bg-white px-5 py-3 rounded-2xl border shadow-sm self-start md:self-auto">
                      <div className="flex flex-col items-center">
                        <div className="flex items-center gap-1">
                          <Star className="w-5 h-5 text-yellow-400 fill-yellow-400" />
                          <span className="text-2xl font-bold font-headline">{avgRating}</span>
                        </div>
                        <span className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground">Average</span>
                      </div>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="divide-y">
                    {busReviews.sort((a,b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()).map((review) => (
                      <div key={review.id} className="p-6 hover:bg-muted/5 transition-colors">
                        <div className="flex justify-between items-start mb-4">
                          <div className="flex items-center gap-3">
                            <Avatar className="h-10 w-10 border shadow-sm">
                              <AvatarFallback className="bg-gradient-to-br from-blue-50 to-indigo-100 text-indigo-700 font-bold">
                                {review.passengerName?.[0] || 'P'}
                              </AvatarFallback>
                            </Avatar>
                            <div>
                              <p className="font-semibold text-gray-900">{review.passengerName || 'Anonymous Traveler'}</p>
                              <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                                <Calendar className="h-3 w-3" />
                                {review.timestamp ? format(parseISO(review.timestamp), 'dd MMM yyyy, hh:mm a') : 'Recently'}
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-1 bg-yellow-50 px-2 py-1 rounded-md border border-yellow-100">
                            {[...Array(5)].map((_, i) => (
                              <Star 
                                key={i} 
                                className={cn(
                                  "w-3.5 h-3.5", 
                                  i < review.busRating ? "text-yellow-400 fill-yellow-400" : "text-gray-200"
                                )} 
                              />
                            ))}
                          </div>
                        </div>
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-2">
                          <div className="space-y-2">
                            <div className="flex items-center gap-2">
                              <Badge variant="outline" className="text-[10px] font-bold uppercase tracking-wider h-5 bg-white">Journey</Badge>
                            </div>
                            <p className={cn(
                              "text-sm leading-relaxed italic border-l-4 pl-4 py-1 rounded-r-lg",
                              getRatingColorClasses(review.busRating)
                            )}>
                              &quot;{review.busFeedback || 'The passenger enjoyed the journey but didn\'t leave a specific comment.'}&quot;
                            </p>
                          </div>
                          
                          {review.appFeedback && (
                            <div className="space-y-2">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <Badge variant="outline" className="text-[10px] font-bold uppercase tracking-wider h-5 bg-white">App Experience</Badge>
                                </div>
                                <div className="flex gap-0.5">
                                  {[...Array(5)].map((_, i) => (
                                    <div key={i} className={cn("w-1.5 h-1.5 rounded-full", i < review.appRating ? "bg-blue-500 shadow-[0_0_4px_rgba(59,130,246,0.5)]" : "bg-gray-200")} />
                                  ))}
                                </div>
                              </div>
                              <p className="text-xs text-gray-600 pl-4 border-l-4 border-blue-200 py-1 bg-blue-50/50 rounded-r-lg italic">
                                {review.appFeedback}
                              </p>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : (
        <div className="text-center py-24 bg-white rounded-3xl border-2 border-dashed border-gray-200 shadow-inner">
          <div className="bg-muted/50 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6">
            <MessageCircle className="w-10 h-10 text-muted-foreground opacity-40" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900 font-headline">No matching reviews</h2>
          <p className="text-muted-foreground mt-2 max-w-sm mx-auto">Try adjusting your filters or search terms to find what you're looking for.</p>
          <Button 
            onClick={() => { setSearchQuery(''); setRatingFilter('all'); }} 
            variant="outline" 
            className="mt-10 px-8 rounded-full"
          >
            Clear All Filters
          </Button>
        </div>
      )}
    </div>
  );
}
