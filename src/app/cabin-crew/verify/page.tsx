'use client';

import React, { useState } from 'react';
import { useFirebase } from '@/firebase';
import { dataService } from '@/lib/data/client-service';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { Utensils, CheckCircle2, XCircle, Loader2 } from 'lucide-react';

export default function MealVerificationPage() {
  const { user } = useFirebase();
  const { toast } = useToast();
  const [code, setCode] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim()) return;

    setIsVerifying(true);
    setResult(null);

    try {
      const res = await dataService.verifyMealCode(code, user?.email || 'unknown-crew');
      setResult(res);
      if (res.success) {
        toast({
          title: "Success",
          description: res.message,
        });
        setCode('');
      } else {
        toast({
          title: "Error",
          description: res.message,
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error("Verification failed", error);
      toast({
        title: "Error",
        description: "An unexpected error occurred during verification.",
        variant: "destructive",
      });
    } finally {
      setIsVerifying(false);
    }
  };

  return (
    <div className="container max-w-lg mx-auto py-12 px-4">
      <Card className="shadow-xl border-none bg-white">
        <CardHeader className="text-center pb-8">
          <div className="mx-auto w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mb-4">
            <Utensils className="w-8 h-8 text-primary" />
          </div>
          <CardTitle className="text-2xl font-bold">Meal Verification</CardTitle>
          <CardDescription>
            Enter the unique meal code from the passenger's ticket to verify and mark as served.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleVerify} className="space-y-6">
            <div className="space-y-2">
              <Input
                placeholder="Enter Code (e.g. MEAL-XXXXXX)"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                className="text-center text-xl font-mono tracking-widest h-14"
                disabled={isVerifying}
              />
            </div>
            
            <Button 
              type="submit" 
              className="w-full h-14 text-lg font-bold shadow-lg transition-all hover:scale-[1.02]"
              disabled={isVerifying || !code.trim()}
            >
              {isVerifying ? (
                <>
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  Verifying...
                </>
              ) : (
                "Verify & Serve Meal"
              )}
            </Button>
          </form>

          {result && (
            <div className={`mt-8 p-4 rounded-xl flex items-center gap-4 animate-in fade-in slide-in-from-top-4 duration-300 ${
              result.success ? 'bg-green-50 text-green-700 border border-green-100' : 'bg-red-50 text-red-700 border border-red-100'
            }`}>
              {result.success ? (
                <CheckCircle2 className="w-6 h-6 shrink-0" />
              ) : (
                <XCircle className="w-6 h-6 shrink-0" />
              )}
              <p className="font-semibold">{result.message}</p>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="mt-12 text-center text-slate-400 text-sm">
        <p>© BusHive Cabin Crew Console</p>
        <p className="mt-1 italic">Authorized Personnel Only</p>
      </div>
    </div>
  );
}
