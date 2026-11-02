'use client';

import React, { useEffect, useState } from 'react';
import { dataService } from '@/lib/data/client-service';
import { PremiumSubscription } from '@/lib/types';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Wallet, Trophy, Utensils, AlertCircle, Info } from 'lucide-react';

interface PremiumStatusProps {
  userId: string;
}

export function PremiumStatus({ userId }: PremiumStatusProps) {
  const [subscription, setSubscription] = useState<PremiumSubscription | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const sub = await dataService.getPremiumSubscription(userId);
      setSubscription(sub);
      setLoading(false);
    }
    load();
  }, [userId]);

  if (loading || !subscription || subscription.status !== 'active') return null;

  const tripProgress = (subscription.currentYearTrips / 8) * 100;

  return (
    <Card className="overflow-hidden border-none shadow-lg bg-gradient-to-br from-indigo-900 to-slate-900 text-white mb-6">
      <CardContent className="p-6">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
          <div className="flex-1 space-y-4 w-full">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-yellow-400/20 rounded-lg">
                <Trophy className="w-5 h-5 text-yellow-400" />
              </div>
              <div>
                <h3 className="font-bold text-lg">Premium Membership - Year {subscription.currentYear}/4</h3>
                <p className="text-indigo-200 text-sm">Trip Progress: {subscription.currentYearTrips}/8 this year</p>
              </div>
            </div>
            <Progress value={tripProgress} className="h-2 bg-white/10" indicatorClassName="bg-yellow-400" />
          </div>

          <div className="flex-1 flex items-center justify-end">
            <div className="p-4 bg-white/5 rounded-2xl border border-white/10 backdrop-blur-sm">
              <p className="text-xs text-indigo-300 uppercase tracking-wider font-bold mb-1">Current Year Benefit</p>
              <h4 className="text-xl font-black text-white">Flat 20% Off <span className="text-sm font-medium text-indigo-200">on every trip</span></h4>
            </div>
          </div>
        </div>

        <div className="mt-6 pt-4 border-t border-white/10 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="flex items-start gap-3 text-xs text-indigo-100/70">
            <Info className="w-4 h-4 shrink-0" />
            <p>Discount applies per booking (max 20%), not per passenger. Valid for 32 trips every year.</p>
          </div>
          {(subscription.currentYearTrips % 4 >= 3 || (subscription.currentYearTrips > 0 && subscription.currentYearTrips % 4 === 0)) && (
            <div className="flex items-center gap-2 text-xs font-bold text-yellow-400 bg-yellow-400/10 px-3 py-1.5 rounded-full w-fit ml-auto">
              <Utensils className="w-4 h-4" />
              {subscription.currentYearTrips % 4 === 3 ? "Next trip includes a FREE meal!" : "Meal code available on your ticket"}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
