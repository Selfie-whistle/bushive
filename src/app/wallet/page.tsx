
'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { 
  Wallet, Coins, PlayCircle, TrendingUp, Clock, Zap, History, Bus,
  Sparkles, Crown, Target, ChevronRight, Trophy, MapPin, Navigation,
  Eye, CheckCircle, Calendar, Users, Star, BarChart3,
  Settings, Gift, Clock3, Percent, Route, Ticket, Shield,
  X, Loader2, Info
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import Link from 'next/link';
import { useFirebase } from '@/firebase';
import { doc, collection, query, where, onSnapshot, updateDoc, increment, setDoc, addDoc } from 'firebase/firestore';
import { cn } from '@/lib/utils';

// Types
interface BusTransaction {
  id: string;
  type: 'ticket_purchase' | 'coin_earned' | 'bonus' | 'referral';
  route: string;
  operator: string;
  amount: number;
  tickets: number;
  timestamp: Date;
  status: 'completed' | 'upcoming' | 'cancelled';
}

interface EarningStats {
  totalCoinsEarned: number;
  coinsUsed: number;
  availableCoins: number;
  ticketsPurchased: number;
  routesTraveled: number;
  totalSavings: number;
  adsWatchedToday: number;
}

interface UpcomingTrip {
  id: string;
  route: string;
  from: string;
  to: string;
  operator: string;
  date: string;
  time: string;
  seats: number;
  price: number;
  coinsApplied: number;
}

interface AdProgress {
  isShowing: boolean;
  countdown: number;
  totalSeconds: number;
  adTitle: string;
  adDescription: string;
  adReward: number;
}

export default function WalletPage() {
  const { user, isUserLoading, firestore: db } = useFirebase();
  const [loading, setLoading] = useState<boolean>(true);
  const [availableCoins, setAvailableCoins] = useState<number>(0);
  const [earningStats, setEarningStats] = useState<EarningStats>({
    totalCoinsEarned: 0,
    coinsUsed: 0,
    availableCoins: 0,
    ticketsPurchased: 0,
    routesTraveled: 0,
    totalSavings: 0,
    adsWatchedToday: 0
  });
  const [transactions, setTransactions] = useState<BusTransaction[]>([]);
  const [upcomingTrips, setUpcomingTrips] = useState<UpcomingTrip[]>([]);
  const [adProgress, setAdProgress] = useState<AdProgress>({
    isShowing: false,
    countdown: 0,
    totalSeconds: 0,
    adTitle: '',
    adDescription: '',
    adReward: 0
  });
  const [isProcessingAd, setIsProcessingAd] = useState(false);

  const fadeIn = {
    initial: { opacity: 0, y: 20 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.5 }
  };

  // RedBus-style colors
  const PRIMARY_COLOR = '#D84E55';
  const SECONDARY_COLOR = '#FF6B6B';
  const ACCENT_COLOR = '#FFA726';

  // Conversion rate
  const COINS_TO_RUPEE = 100; // 100 coins = ₹1
  const COINS_PER_AD = 30;
  const DAILY_AD_LIMIT = 10;
  const COIN_EXPIRY_DAYS = 180; // 6 months

  const coinsEarnedToday = useMemo(() => {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    return transactions.reduce((total, t) => {
      if (t.type === 'coin_earned' && t.timestamp >= todayStart) {
        return total + t.amount;
      }
      return total;
    }, 0);
  }, [transactions]);

  // Sample ads with different durations
  const ads = [
    {
      id: 1,
      title: "BusHive - Book Buses Instantly",
      description: "India's fastest bus booking app with live tracking",
      duration: 15, // seconds
      reward: COINS_PER_AD,
      image: "🎯"
    },
    {
      id: 2,
      title: "Travel Easy with BusHive",
      description: "Get 20% off on your first bus booking",
      duration: 20,
      reward: COINS_PER_AD,
      image: "🚌"
    },
    {
      id: 3,
      title: "BusHive Premium",
      description: "Zero cancellation fees & priority customer support",
      duration: 12,
      reward: COINS_PER_AD,
      image: "⭐"
    }
  ];

  useEffect(() => {
    if (isUserLoading || !user) {
      if (!isUserLoading) setLoading(false);
      return;
    }

    if (!db) return;

    setLoading(true);

    // 1. Wallet subscription
    const walletRef = doc(db, 'wallets', user.uid);
    const unsubscribeWallet = onSnapshot(walletRef, (walletSnap) => {
      if (walletSnap.exists()) {
        const walletData = walletSnap.data();
        setAvailableCoins(walletData.balance || 0);
        setEarningStats({
            totalCoinsEarned: walletData.totalCoinsEarned || 0,
            coinsUsed: walletData.coinsUsed || 0,
            availableCoins: walletData.balance || 0,
            ticketsPurchased: walletData.ticketsPurchased || 0,
            routesTraveled: walletData.routesTraveled || 0,
            totalSavings: walletData.totalSavings || 0,
            adsWatchedToday: walletData.adsWatchedToday || 0
        });
      } else {
        // Wallet doesn't exist, create it with default values.
        const newWalletData = {
          balance: 0, totalCoinsEarned: 0, coinsUsed: 0,
          ticketsPurchased: 0, routesTraveled: 0, totalSavings: 0,
          adsWatchedToday: 0, lastAdWatched: null
        };
        setDoc(walletRef, newWalletData); // This will create the doc
      }
    }, (error) => {
        console.error("Error listening to wallet:", error);
    });

    // 2. Transactions subscription
    const transactionsQuery = query(collection(db, 'users', user.uid, 'busTransactions'));
    const unsubscribeTransactions = onSnapshot(transactionsQuery, (snapshot) => {
      const transactionsData: BusTransaction[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        transactionsData.push({ id: doc.id, ...data, timestamp: data.timestamp?.toDate() } as BusTransaction);
      });
      setTransactions(transactionsData.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime()));
    }, (error) => {
      console.error("Error listening to transactions:", error);
    });

    // 3. Upcoming Trips subscription
    const tripsQuery = query(collection(db, 'users', user.uid, 'upcomingTrips'));
    const unsubscribeTrips = onSnapshot(tripsQuery, (snapshot) => {
      const tripsData: UpcomingTrip[] = [];
      snapshot.forEach((doc) => {
        tripsData.push({ id: doc.id, ...doc.data() } as UpcomingTrip);
      });
      setUpcomingTrips(tripsData.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()).slice(0, 3));
      setLoading(false); // Set loading to false after the last query snapshot
    }, (error) => {
        console.error("Error listening to upcoming trips:", error);
        setLoading(false);
    });

    return () => {
      unsubscribeWallet();
      unsubscribeTransactions();
      unsubscribeTrips();
    };

  }, [user, isUserLoading, db]);

  const startAd = async () => {
    if (earningStats.adsWatchedToday >= DAILY_AD_LIMIT || adProgress.isShowing) {
      return;
    }

    // Select a random ad
    const randomAd = ads[Math.floor(Math.random() * ads.length)];
    
    setAdProgress({
      isShowing: true,
      countdown: randomAd.duration,
      totalSeconds: randomAd.duration,
      adTitle: randomAd.title,
      adDescription: randomAd.description,
      adReward: randomAd.reward
    });

    // Start countdown
    const timer = setInterval(() => {
      setAdProgress(prev => {
        if (prev.countdown <= 1) {
          clearInterval(timer);
          completeAd(randomAd.reward);
          return { ...prev, countdown: 0 };
        }
        return { ...prev, countdown: prev.countdown - 1 };
      });
    }, 1000);
  };

  const completeAd = async (reward: number) => {
    if (!db || !user || isProcessingAd) return;
    setIsProcessingAd(true);
    
    try {
      // Add delay for processing
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      const walletRef = doc(db, 'wallets', user.uid);
      const transactionRef = collection(db, 'users', user.uid, 'busTransactions');
      
      // Create a transaction document
      const newTransaction = {
        type: 'coin_earned',
        route: 'Ad Watched',
        operator: 'BusHive Rewards',
        amount: reward,
        tickets: 0,
        timestamp: new Date(),
        status: 'completed',
      };

      await addDoc(transactionRef, newTransaction);
      
      await updateDoc(walletRef, {
        balance: increment(reward),
        totalCoinsEarned: increment(reward),
        adsWatchedToday: increment(1),
        lastAdWatched: new Date()
      });

    } catch (error) {
      console.error('Error completing ad:', error);
    } finally {
      setIsProcessingAd(false);
      setAdProgress(prev => ({ ...prev, isShowing: false }));
    }
  };

  const cancelAd = () => {
    setAdProgress(prev => ({ ...prev, isShowing: false, countdown: 0 }));
  };

  const formatCurrency = (coins: number) => {
    const rupees = coins / COINS_TO_RUPEE;
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(rupees);
  };

  const formatDate = (date: Date) => {
    return new Intl.DateTimeFormat('en-IN', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit'
    }).format(date);
  };

  if (isUserLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-red-50 to-orange-50">
        <div className="text-center">
          <div className="w-16 h-16 mx-auto mb-4 border-4 border-[#D84E55]/20 border-t-[#D84E55] rounded-full animate-spin"></div>
          <p className="text-lg font-medium text-muted-foreground">Loading your travel wallet...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-red-50 to-orange-50">
        <div className="text-center space-y-4">
          <Bus className="w-16 h-16 mx-auto text-[#D84E55]" />
          <h2 className="text-2xl font-bold">Sign in to access your travel wallet</h2>
          <p className="text-muted-foreground">Earn coins and save on bus tickets</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-red-50 to-orange-50">
      {/* Ad Overlay */}
      <AnimatePresence>
        {adProgress.isShowing && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden"
            >
              {/* Ad Header */}
              <div className="relative">
                <div className="absolute top-4 right-4 z-10">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 rounded-full bg-white/90 hover:bg-white"
                    onClick={cancelAd}
                    disabled={isProcessingAd}
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>
                
                {/* Ad Content */}
                <div className="p-8 text-center">
                  <div className="text-6xl mb-4">🚌</div>
                  <h3 className="text-2xl font-bold font-headline text-gray-900 mb-2">
                    {adProgress.adTitle}
                  </h3>
                  <p className="text-gray-600 mb-6">
                    {adProgress.adDescription}
                  </p>
                  
                  {/* Countdown Timer */}
                  <div className="mb-6">
                    <div className="text-5xl font-bold font-headline text-[#D84E55] mb-2">
                      {adProgress.countdown}s
                    </div>
                    <div className="text-sm text-gray-500">
                      Please wait for the ad to finish
                    </div>
                    
                    {/* Progress Bar */}
                    <div className="mt-4">
                      <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-gradient-to-r from-[#D84E55] to-[#FF6B6B] transition-all duration-1000"
                          style={{ 
                            width: `${((adProgress.totalSeconds - adProgress.countdown) / adProgress.totalSeconds) * 100}%` 
                          }}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Reward Info */}
                  <div className="bg-gradient-to-r from-green-50 to-emerald-50 rounded-xl p-4 mb-6 border border-green-200">
                    <div className="flex items-center justify-center gap-3">
                      <div className="p-2 rounded-full bg-green-100">
                        <Coins className="w-5 h-5 text-green-600" />
                      </div>
                      <div>
                        <div className="font-semibold text-green-700">
                          +{adProgress.adReward} Travel Coins
                        </div>
                        <div className="text-sm text-green-600">
                          Will be added to your wallet
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Processing State */}
                  {isProcessingAd && (
                    <div className="space-y-4">
                      <div className="flex items-center justify-center gap-3">
                        <Loader2 className="w-5 h-5 animate-spin text-[#D84E55]" />
                        <span className="text-gray-600">Processing your reward...</span>
                      </div>
                    </div>
                  )}

                  {/* Instructions */}
                  <div className="text-xs text-gray-500 mt-4">
                    Keep this window open to earn your coins
                  </div>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="container mx-auto px-4 py-8">
        <motion.div 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-7xl mx-auto"
        >
          {/* Header */}
          <div className="mb-10">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mb-6">
              <div>
                <div className="flex items-center gap-3 mb-2">
                  <div className="p-2 rounded-xl bg-gradient-to-r from-[#D84E55] to-[#FF6B6B] shadow-lg">
                    <Wallet className="w-6 h-6 text-white" />
                  </div>
                  <Badge className="bg-gradient-to-r from-[#D84E55] to-[#FF6B6B] text-white font-headline">
                    <Crown className="w-3 h-3 mr-1" />
                    Travel Wallet
                  </Badge>
                </div>
                <h1 className="text-4xl font-bold font-headline bg-gradient-to-r from-[#D84E55] to-[#FF6B6B] bg-clip-text text-transparent">
                  BusHive Coins
                </h1>
                <p className="text-muted-foreground mt-2">Earn coins, save on every bus ticket</p>
              </div>
              <div className="flex items-center gap-3">
                <Avatar className="h-14 w-14 border-4 border-white shadow-xl">
                  <AvatarImage src={user.photoURL || ''} />
                  <AvatarFallback className="bg-gradient-to-r from-[#D84E55] to-[#FF6B6B] text-white text-lg font-headline">
                    {user.displayName?.[0]?.toUpperCase() || 'T'}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <div className="font-semibold font-headline">{user.displayName?.split(' ')[0] || 'Traveler'}</div>
                  <div className="text-sm text-muted-foreground">Ready to earn?</div>
                </div>
              </div>
            </div>
            <Separator className="bg-gradient-to-r from-transparent via-[#D84E55]/20 to-transparent" />
          </div>

          {/* Main Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            
            {/* Left Column - Main Content */}
            <div className="lg:col-span-2 space-y-8">
              
              {/* Balance Card */}
              <motion.div {...fadeIn}>
                <Card className="relative overflow-hidden border-none shadow-2xl bg-gradient-to-br from-[#D84E55]/10 via-[#D84E55]/5 to-orange-500/5">
                  <div className="absolute top-0 right-0 w-96 h-96 bg-gradient-to-br from-[#D84E55]/10 to-transparent rounded-full -translate-y-48 translate-x-48" />
                  
                  <CardHeader className="relative">
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle className="text-2xl font-headline flex items-center gap-3">
                          <div className="p-2 rounded-lg bg-gradient-to-r from-[#FFA726] to-[#FF9800] shadow-md">
                            <Coins className="w-6 h-6 text-white" />
                          </div>
                          Your Travel Coins
                        </CardTitle>
                        <CardDescription>Use coins to save on bus tickets</CardDescription>
                      </div>
                      <Badge variant="outline" className="border-green-500/30 text-green-600 font-headline">
                        <TrendingUp className="w-3 h-3 mr-1" />
                        Active • Expires in {COIN_EXPIRY_DAYS} days
                      </Badge>
                    </div>
                  </CardHeader>
                  
                  <CardContent className="relative space-y-6">
                    {/* Main Balance */}
                    <div className="flex items-end justify-between">
                      <div>
                        <div className="text-5xl font-bold tracking-tight font-headline bg-gradient-to-r from-[#D84E55] to-[#FF6B6B] bg-clip-text text-transparent">
                          {availableCoins.toLocaleString()}
                        </div>
                        <div className="flex items-center gap-2 mt-2">
                          <div className="flex items-center gap-1">
                            <Coins className="w-5 h-5 text-[#FFA726]" />
                            <span className="text-lg font-semibold font-headline">Travel Coins</span>
                          </div>
                          <span className="text-muted-foreground">•</span>
                          <span className="text-lg font-semibold text-green-600 font-headline">
                            = {formatCurrency(availableCoins)}
                          </span>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-2xl font-bold font-headline text-[#D84E55]">100 coins = ₹1</div>
                        <div className="text-sm text-muted-foreground">No discount limits</div>
                      </div>
                    </div>

                    {/* Stats Grid */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div className="bg-white/60 backdrop-blur-sm p-4 rounded-xl border border-white/30 shadow-sm">
                        <div className="flex items-center gap-3">
                          <div className="p-2 rounded-lg bg-blue-500/10">
                            <Ticket className="w-5 h-5 text-blue-500" />
                          </div>
                          <div>
                            <div className="text-xs text-muted-foreground">Today's Ads</div>
                            <div className="font-semibold font-headline">{earningStats.adsWatchedToday}/{DAILY_AD_LIMIT}</div>
                          </div>
                        </div>
                      </div>
                      
                      <div className="bg-white/60 backdrop-blur-sm p-4 rounded-xl border border-white/30 shadow-sm">
                        <div className="flex items-center gap-3">
                          <div className="p-2 rounded-lg bg-green-500/10">
                            <Route className="w-5 h-5 text-green-500" />
                          </div>
                          <div>
                            <div className="text-xs text-muted-foreground">Total Trips</div>
                            <div className="font-semibold font-headline">{earningStats.ticketsPurchased}</div>
                          </div>
                        </div>
                      </div>
                      
                      <div className="bg-white/60 backdrop-blur-sm p-4 rounded-xl border border-white/30 shadow-sm">
                        <div className="flex items-center gap-3">
                          <div className="p-2 rounded-lg bg-purple-500/10">
                            <Percent className="w-5 h-5 text-purple-500" />
                          </div>
                          <div>
                            <div className="text-xs text-muted-foreground">Total Saved</div>
                            <div className="font-semibold font-headline">₹{earningStats.totalSavings}</div>
                          </div>
                        </div>
                      </div>
                      
                      <div className="bg-white/60 backdrop-blur-sm p-4 rounded-xl border border-white/30 shadow-sm">
                        <div className="flex items-center gap-3">
                          <div className="p-2 rounded-lg bg-[#FFA726]/10">
                            <Trophy className="w-5 h-5 text-[#FFA726]" />
                          </div>
                          <div>
                            <div className="text-xs text-muted-foreground">Total Earned</div>
                            <div className="font-semibold font-headline">{earningStats.totalCoinsEarned.toLocaleString()}</div>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Quick Action */}
                    <div className="pt-4 border-t border-white/30">
                      <Link href="/search?origin=Punalur&destination=Bangalore">
                        <Button 
                          size="lg" 
                          className="w-full bg-gradient-to-r from-[#D84E55] to-[#FF6B6B] hover:from-[#D84E55]/90 hover:to-[#FF6B6B] shadow-lg hover:shadow-xl font-headline"
                        >
                          <Bus className="w-5 h-5 mr-2" />
                          Book Bus &amp; Save {formatCurrency(availableCoins)}
                        </Button>
                      </Link>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>

              {/* Earning Dashboard */}
              <motion.div {...fadeIn} transition={{ delay: 0.1 }}>
                <Tabs defaultValue="earn" className="w-full">
                  <TabsList className="grid w-full grid-cols-3 bg-white/50 backdrop-blur-sm font-headline">
                    <TabsTrigger value="earn" className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-[#D84E55] data-[state=active]:to-[#FF6B6B]">
                      <Zap className="w-4 h-4 mr-2" />
                      Earn Coins
                    </TabsTrigger>
                    <TabsTrigger value="how" className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-blue-500 data-[state=active]:to-blue-600">
                      <Ticket className="w-4 h-4 mr-2" />
                      How to Use
                    </TabsTrigger>
                    <TabsTrigger value="bonus" className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-[#FFA726] data-[state=active]:to-[#FF9800]">
                      <Gift className="w-4 h-4 mr-2" />
                      Travel Bonuses
                    </TabsTrigger>
                  </TabsList>
                  
                  {/* Earn Coins Tab */}
                  <TabsContent value="earn" className="space-y-4 mt-6">
                    <Card className="border border-[#D84E55]/20">
                      <CardContent className="pt-6">
                        <div className="space-y-6">
                          {/* Quick Earn Ad */}
                          <div className="bg-gradient-to-r from-[#D84E55]/5 to-[#FF6B6B]/5 border border-[#D84E55]/30 rounded-2xl p-6">
                            <div className="flex items-center justify-between mb-6">
                              <div>
                                <h3 className="text-lg font-semibold font-headline flex items-center gap-2">
                                  <PlayCircle className="w-5 h-5 text-[#D84E55]" />
                                  Watch Short Ads
                                </h3>
                                <p className="text-sm text-muted-foreground">Watch short videos to earn bus ticket discounts</p>
                              </div>
                              <Badge className="bg-gradient-to-r from-[#D84E55] to-[#FF6B6B] text-white font-headline">
                                {DAILY_AD_LIMIT - earningStats.adsWatchedToday} left today
                              </Badge>
                            </div>
                            
                            <div className="space-y-4">
                              {/* Available Ads */}
                              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
                                {ads.map((ad) => (
                                  <div 
                                    key={ad.id} 
                                    className="bg-white/60 backdrop-blur-sm p-4 rounded-xl border hover:border-[#D84E55]/50 transition-colors cursor-pointer"
                                    onClick={() => earningStats.adsWatchedToday < DAILY_AD_LIMIT && startAd()}
                                  >
                                    <div className="text-center">
                                      <div className="text-3xl mb-2">{ad.image}</div>
                                      <h4 className="font-medium text-sm mb-1 font-headline">{ad.title}</h4>
                                      <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground mb-2">
                                        <Clock className="w-3 h-3" />
                                        {ad.duration}s
                                      </div>
                                      <Badge className="bg-gradient-to-r from-green-500 to-green-600 text-white font-headline">
                                        +{ad.reward} coins
                                      </Badge>
                                    </div>
                                  </div>
                                ))}
                              </div>

                              {/* Watch Button */}
                              <Button
                                size="lg"
                                className="w-full h-14 text-lg font-semibold font-headline bg-gradient-to-r from-[#D84E55] to-[#FF6B6B] hover:from-[#D84E55]/90 hover:to-[#FF6B6B] shadow-lg"
                                disabled={earningStats.adsWatchedToday >= DAILY_AD_LIMIT || adProgress.isShowing}
                                onClick={startAd}
                              >
                                {earningStats.adsWatchedToday >= DAILY_AD_LIMIT ? (
                                  <>
                                    <Clock className="w-5 h-5 mr-2" />
                                    Daily Limit Reached
                                  </>
                                ) : adProgress.isShowing ? (
                                  <>
                                    <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                                    Watching Ad...
                                  </>
                                ) : (
                                  <>
                                    <PlayCircle className="w-5 h-5 mr-2" />
                                    Watch Ad to Earn Coins
                                  </>
                                )}
                              </Button>

                              <div className="text-center text-sm text-muted-foreground">
                                <div className="flex items-center justify-center gap-2">
                                  <CheckCircle className="w-4 h-4 text-green-500" />
                                  <span>Coins expire after {COIN_EXPIRY_DAYS / 30} months</span>
                                </div>
                              </div>
                            </div>
                          </div>

                          {/* Other Earning Methods */}
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <Card className="hover:shadow-lg transition-shadow cursor-pointer border-blue-500/20">
                              <CardContent className="pt-6">
                                <div className="flex items-start justify-between">
                                  <div>
                                    <div className="flex items-center gap-2 mb-2">
                                      <div className="p-2 rounded-lg bg-blue-500/10">
                                        <Star className="w-5 h-5 text-blue-500" />
                                      </div>
                                      <h4 className="font-semibold font-headline">Rate Your Trip</h4>
                                    </div>
                                    <p className="text-sm text-muted-foreground mb-3">Review your bus journey</p>
                                    <Badge className="bg-gradient-to-r from-blue-500 to-blue-600 text-white font-headline">
                                      +50 coins per review
                                    </Badge>
                                  </div>
                                  <Button size="sm" variant="outline">Rate Now</Button>
                                </div>
                              </CardContent>
                            </Card>

                            <Card className="hover:shadow-lg transition-shadow cursor-pointer border-green-500/20">
                              <CardContent className="pt-6">
                                <div className="flex items-start justify-between">
                                  <div>
                                    <div className="flex items-center gap-2 mb-2">
                                      <div className="p-2 rounded-lg bg-green-500/10">
                                        <Users className="w-5 h-5 text-green-500" />
                                      </div>
                                      <h4 className="font-semibold font-headline">Invite Friends</h4>
                                    </div>
                                    <p className="text-sm text-muted-foreground mb-3">Get coins when friends book</p>
                                    <Badge className="bg-gradient-to-r from-green-500 to-green-600 text-white font-headline">
                                      +200 coins per friend
                                    </Badge>
                                  </div>
                                  <Button size="sm" variant="outline">Invite</Button>
                                </div>
                              </CardContent>
                            </Card>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </TabsContent>

                  {/* How to Use Tab */}
                  <TabsContent value="how" className="mt-6">
                    <Card className="bg-gradient-to-br from-[#D84E55]/5 to-[#FF6B6B]/5 border-[#D84E55]/20">
                      <CardContent className="pt-6">
                        <div className="space-y-6">
                          <div className="text-center mb-8">
                            <div className="p-3 rounded-full bg-gradient-to-r from-[#D84E55] to-[#FF6B6B] w-20 h-20 mx-auto flex items-center justify-center mb-4">
                              <Ticket className="w-10 h-10 text-white" />
                            </div>
                            <h3 className="text-2xl font-bold font-headline">How to Use Travel Coins</h3>
                            <p className="text-muted-foreground">Redeem coins for bus ticket discounts</p>
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            <div className="text-center space-y-3">
                              <div className="p-4 rounded-xl bg-white/60 backdrop-blur-sm border border-white/30 w-16 h-16 mx-auto flex items-center justify-center">
                                <span className="text-2xl font-bold font-headline text-[#D84E55]">1</span>
                              </div>
                              <h4 className="font-semibold font-headline">Earn Coins</h4>
                              <p className="text-sm text-muted-foreground">Watch ads, rate trips, invite friends</p>
                            </div>

                            <div className="text-center space-y-3">
                              <div className="p-4 rounded-xl bg-white/60 backdrop-blur-sm border border-white/30 w-16 h-16 mx-auto flex items-center justify-center">
                                <span className="text-2xl font-bold font-headline text-[#D84E55]">2</span>
                              </div>
                              <h4 className="font-semibold font-headline">Search Bus</h4>
                              <p className="text-sm text-muted-foreground">Select route, date & bus operator</p>
                            </div>

                            <div className="text-center space-y-3">
                              <div className="p-4 rounded-xl bg-white/60 backdrop-blur-sm border border-white/30 w-16 h-16 mx-auto flex items-center justify-center">
                                <span className="text-2xl font-bold font-headline text-[#D84E55]">3</span>
                              </div>
                              <h4 className="font-semibold font-headline">Apply Coins</h4>
                              <p className="text-sm text-muted-foreground">Use coins at checkout for discount</p>
                            </div>
                          </div>

                          <div className="bg-white/60 backdrop-blur-sm rounded-xl p-6 border border-white/30 mt-8">
                            <h4 className="font-semibold mb-3 flex items-center gap-2 font-headline">
                              <Shield className="w-5 h-5 text-[#D84E55]" />
                              Discount Rules
                            </h4>
                            <ul className="space-y-2 text-sm">
                              <li className="flex items-center gap-2">
                                <CheckCircle className="w-4 h-4 text-green-500" />
                                <span>100 coins = ₹1 discount on ticket price</span>
                              </li>
                              <li className="flex items-center gap-2">
                                <CheckCircle className="w-4 h-4 text-green-500" />
                                <span>Maximum 50% discount per ticket</span>
                              </li>
                              <li className="flex items-center gap-2">
                                <CheckCircle className="w-4 h-4 text-green-500" />
                                <span>Coins expire after 60 days</span>
                              </li>
                              <li className="flex items-center gap-2">
                                <CheckCircle className="w-4 h-4 text-green-500" />
                                <span>Can be combined with other bus offers</span>
                              </li>
                            </ul>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </TabsContent>

                  {/* Travel Bonuses Tab */}
                  <TabsContent value="bonus" className="mt-6">
                    <Card className="border border-[#FFA726]/20">
                      <CardContent className="pt-6">
                        <div className="space-y-6">
                          <h3 className="text-xl font-bold font-headline flex items-center gap-2">
                            <Gift className="w-6 h-6 text-[#FFA726]" />
                            Special Travel Bonuses
                          </h3>
                          
                          {[
                            { 
                              title: 'Weekend Travel Bonus', 
                              description: 'Book tickets for Friday-Sunday travel',
                              reward: '+100 bonus coins',
                              icon: '🎯',
                              color: 'from-purple-500 to-purple-600'
                            },
                            { 
                              title: 'Early Morning Bonus', 
                              description: 'Buses before 7 AM',
                              reward: '+50% extra coins',
                              icon: '🌅',
                              color: 'from-blue-500 to-blue-600'
                            },
                            { 
                              title: 'Group Travel', 
                              description: 'Book 4+ tickets together',
                              reward: '+200 bonus coins',
                              icon: '👥',
                              color: 'from-green-500 to-green-600'
                            },
                            { 
                              title: 'Long Route Bonus', 
                              description: 'Routes over 500 km',
                              reward: '+150 bonus coins',
                              icon: '🛣️',
                              color: 'from-[#D84E55] to-[#FF6B6B]'
                            },
                          ].map((offer, index) => (
                            <div key={index} className="flex items-center justify-between p-4 rounded-xl border hover:bg-muted/50 transition-colors">
                              <div className="flex items-center gap-4">
                                <div className="text-2xl">{offer.icon}</div>
                                <div>
                                  <h4 className="font-medium font-headline">{offer.title}</h4>
                                  <p className="text-sm text-muted-foreground">{offer.description}</p>
                                </div>
                              </div>
                              <Badge className={cn("bg-gradient-to-r text-white font-headline", offer.color)}>
                                {offer.reward}
                              </Badge>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  </TabsContent>
                </Tabs>
              </motion.div>
            </div>

            {/* Right Column - Sidebar */}
            <div className="space-y-8">
              
              {/* Upcoming Trips */}
              <motion.div {...fadeIn} transition={{ delay: 0.2 }}>
                <Card className="border border-blue-500/20">
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-lg font-headline flex items-center gap-2">
                        <Calendar className="w-5 h-5 text-blue-500" />
                        Upcoming Trips
                      </CardTitle>
                      <Badge variant="outline" className="text-xs font-headline">
                        {upcomingTrips.length} bookings
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      {upcomingTrips.length > 0 ? (
                        upcomingTrips.map((trip) => (
                          <div key={trip.id} className="p-3 rounded-lg border hover:bg-blue-50/50 transition-colors">
                            <div className="flex items-start gap-3">
                              <div className="w-12 h-12 bg-gradient-to-br from-blue-500/20 to-blue-500/10 rounded-md flex items-center justify-center">
                                <Bus className="w-5 h-5 text-blue-500" />
                              </div>
                              <div className="flex-1">
                                <h4 className="font-medium text-sm line-clamp-1 font-headline">{trip.from} → {trip.to}</h4>
                                <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
                                  <Clock3 className="w-3 h-3" />
                                  {trip.time} • {trip.date}
                                </div>
                                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                  <MapPin className="w-3 h-3" />
                                  {trip.operator}
                                </div>
                                <div className="flex items-center justify-between mt-2">
                                  <div className="text-xs font-headline">
                                    {trip.seats} seat{trip.seats > 1 ? 's' : ''}
                                  </div>
                                  {trip.coinsApplied > 0 && (
                                    <Badge variant="secondary" className="text-xs font-headline">
                                      -{trip.coinsApplied} coins
                                    </Badge>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="text-center py-6 text-muted-foreground">
                          <Calendar className="w-12 h-12 mx-auto mb-3 opacity-50" />
                          <p className="text-sm font-headline">No upcoming trips</p>
                          <p className="text-xs">Book buses to see them here</p>
                        </div>
                      )}
                    </div>
                    
                    <Link href="/my-trips">
                      <Button variant="outline" className="w-full mt-4 font-headline">
                        View All Trips
                        <ChevronRight className="w-4 h-4 ml-2" />
                      </Button>
                    </Link>
                  </CardContent>
                </Card>
              </motion.div>

              {/* How Coins Work */}
              <motion.div {...fadeIn} transition={{ delay: 0.3 }}>
                <Card className="border border-[#D84E55]/20">
                  <CardHeader>
                    <CardTitle className="text-lg font-headline flex items-center gap-2">
                      <Info className="w-5 h-5 text-[#D84E55]" />
                      How Coins Work
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-3">
                      <div className="flex items-start gap-3">
                        <div className="p-1.5 rounded-md bg-[#D84E55]/10">
                          <Coins className="w-4 h-4 text-[#D84E55]" />
                        </div>
                        <div>
                          <div className="font-medium text-sm font-headline">100 coins = ₹1 discount</div>
                          <div className="text-xs text-muted-foreground">No maximum discount limit</div>
                        </div>
                      </div>
                      
                      <div className="flex items-start gap-3">
                        <div className="p-1.5 rounded-md bg-blue-500/10">
                          <Clock className="w-4 h-4 text-blue-500" />
                        </div>
                        <div>
                          <div className="font-medium text-sm font-headline">Coins expire after 6 months</div>
                          <div className="text-xs text-muted-foreground">Earned coins are valid for 180 days</div>
                        </div>
                      </div>
                      
                      <div className="flex items-start gap-3">
                        <div className="p-1.5 rounded-md bg-green-500/10">
                          <Ticket className="w-4 h-4 text-green-500" />
                        </div>
                        <div>
                          <div className="font-medium text-sm font-headline">Use on any bus ticket</div>
                          <div className="text-xs text-muted-foreground">Apply coins during checkout</div>
                        </div>
                      </div>
                      
                      <div className="flex items-start gap-3">
                        <div className="p-1.5 rounded-md bg-purple-500/10">
                          <Users className="w-4 h-4 text-purple-500" />
                        </div>
                        <div>
                          <div className="font-medium text-sm font-headline">Share with family</div>
                          <div className="text-xs text-muted-foreground">Use coins for family bookings</div>
                        </div>
                      </div>
                    </div>
                    
                    <Separator />
                    
                    <div className="text-center">
                      <p className="text-sm font-medium mb-2 font-headline">Your coins can save you:</p>
                      <div className="text-2xl font-bold text-green-600 font-headline">
                        {formatCurrency(availableCoins)}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1 font-headline">
                        on your next bus ticket
                      </p>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>

              {/* Recent Activity */}
              <motion.div {...fadeIn} transition={{ delay: 0.4 }}>
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-lg font-headline flex items-center gap-2">
                      <History className="w-5 h-5 text-[#D84E55]" />
                      Recent Activity
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3 max-h-[300px] overflow-y-auto pr-2">
                      {transactions.slice(0, 5).map((transaction) => (
                        <div key={transaction.id} className="flex items-center justify-between p-3 rounded-lg hover:bg-red-50/50 transition-colors">
                          <div className="flex items-center gap-3">
                            <div className={cn("p-2 rounded-lg", 
                              transaction.type === 'ticket_purchase' ? 'bg-red-500/10 text-red-500' :
                              transaction.type === 'coin_earned' ? 'bg-green-500/10 text-green-500' :
                              'bg-[#FFA726]/10 text-[#FFA726]'
                            )}>
                              {transaction.type === 'ticket_purchase' ? <Ticket className="w-4 h-4" /> :
                               transaction.type === 'coin_earned' ? <Coins className="w-4 h-4" /> :
                               <Gift className="w-4 h-4" />}
                            </div>
                            <div className="max-w-[140px]">
                              <div className="font-medium text-sm truncate font-headline">{transaction.route}</div>
                              <div className="text-xs text-muted-foreground">
                                {formatDate(transaction.timestamp)}
                              </div>
                            </div>
                          </div>
                          <div className={cn("font-semibold text-sm", transaction.amount > 0 ? 'text-green-600' : 'text-red-600')}>
                            {transaction.amount > 0 ? '+' : ''}{transaction.amount}
                          </div>
                        </div>
                      ))}
                      
                      {transactions.length === 0 && (
                        <div className="text-center py-6 text-muted-foreground">
                          <History className="w-10 h-10 mx-auto mb-3 opacity-50" />
                          <p className="text-sm font-headline">No transactions yet</p>
                          <p className="text-xs">Start earning to see activity</p>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            </div>
          </div>

          {/* Daily Progress */}
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
            className="mt-12"
          >
            <Card className="border border-[#D84E55]/20">
              <CardContent className="pt-6">
                <div className="flex flex-col md:flex-row items-center justify-between gap-6">
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold flex items-center gap-2">
                      <Target className="w-5 h-5 text-[#D84E55]" />
                      Today's Progress
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      Watch {DAILY_AD_LIMIT} ads daily to maximize your coins
                    </p>
                    
                    <div className="mt-4 space-y-2">
                      <div className="flex justify-between text-sm">
                        <span>Ads watched today</span>
                        <span className="font-semibold">{earningStats.adsWatchedToday}/{DAILY_AD_LIMIT}</span>
                      </div>
                      <Progress 
                        value={(earningStats.adsWatchedToday / DAILY_AD_LIMIT) * 100} 
                        className="h-2 bg-gray-200"
                      />
                    </div>
                  </div>
                  
                  <div className="text-center">
                    <div className="text-2xl font-bold text-[#D84E55] font-headline">
                      +{coinsEarnedToday}
                    </div>
                    <div className="text-sm text-muted-foreground">Coins earned today</div>
                    <Button 
                      size="sm" 
                      className="mt-3 bg-gradient-to-r from-[#D84E55] to-[#FF6B6B]"
                      onClick={startAd}
                      disabled={earningStats.adsWatchedToday >= DAILY_AD_LIMIT || adProgress.isShowing}
                    >
                      <PlayCircle className="w-4 h-4 mr-2" />
                      Watch Ad
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>

          {/* CTA Section */}
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6 }}
            className="mt-8 text-center"
          >
            <Link href="/search?origin=Punalur&destination=Bangalore">
              <Button 
                size="lg" 
                className="px-12 py-6 text-lg font-headline bg-gradient-to-r from-[#D84E55] to-[#FF6B6B] hover:from-[#D84E55]/90 hover:to-[#FF6B6B] shadow-xl hover:shadow-2xl"
              >
                <Bus className="w-6 h-6 mr-3" />
                Book Buses & Use Your Coins
              </Button>
            </Link>
            <p className="text-sm text-muted-foreground mt-4 font-headline">
              Use your {availableCoins.toLocaleString()} coins for up to {formatCurrency(availableCoins)} discount on bus tickets
            </p>
          </motion.div>
        </motion.div>
      </div>
    </div>
  );
}
