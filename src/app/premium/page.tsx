'use client';

import React from 'react';
import Link from 'next/link';
import { Check, Crown, Shield, Zap, Star, ArrowLeft, GraduationCap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Outfit } from 'next/font/google';
import { useFirebase } from '@/firebase';
import { dataService } from '@/lib/data/client-service';
import { useToast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';


const outfit = Outfit({ subsets: ['latin'] });

export default function PremiumPage() {
  const { user } = useFirebase();
  const { toast } = useToast();
  const [loadingPlan, setLoadingPlan] = React.useState<string | null>(null);

  const handleJoin = async (plan: any) => {
    if (!user) {
      toast({
        title: "Sign in required",
        description: "Please sign in to purchase a premium plan.",
        variant: "destructive"
      });
      return;
    }

    setLoadingPlan(plan.name);
    try {
      const priceValue = parseInt(plan.price.replace('₹', ''));
      await dataService.buyPremiumSubscription(user.uid, priceValue);
      toast({
        title: "Welcome to Premium!",
        description: `You have successfully joined the ${plan.name} plan.`,
      });
    } catch (error) {
      console.error("Subscription failed", error);
      toast({
        title: "Purchase failed",
        description: "An error occurred. Please try again.",
        variant: "destructive"
      });
    } finally {
      setLoadingPlan(null);
    }
  };

  const plans = [
    {
      name: "Scholar Pass",
      price: "₹999",
      period: " / 4 Years",
      description: "The ultimate student companion. Engineered for the long trips back home.",
      features: [
        "32 Total Trips (8/Year)",
        "Flat 20% Discount / Booking",
        "Free Meal every 4th Trip",
        "Semester Move: Unlimited Luggage",
        "Exam Season: ₹500 Reward Bonus",
        "3x Reward Points (Best Rate)"
      ],
      icon: <GraduationCap className="w-6 h-6 text-violet-500" />,
      color: "from-violet-200 via-indigo-400 to-purple-600",
      textColor: "text-indigo-950",
      buttonVariant: "outline" as const,
      badge: "STUDENT SPECIAL"
    },
    {
      name: "Executive",
      price: "₹2499",
      period: " / 4 Years",
      description: "The classic Bushive experience. Priority and comfort combined.",
      features: [
        "32 Total Trips (8/Year)",
        "Flat 20% Discount / Booking",
        "Free Meal every 4th Trip",
        "Priority Boarding",
        "Standard Lounge Access",
        "2x Reward Points"
      ],
      icon: <Crown className="w-8 h-8 text-yellow-500" />,
      color: "from-yellow-200 via-amber-500 to-yellow-700",
      textColor: "text-amber-950",
      buttonVariant: "default" as const,
      popular: true
    },
    {
      name: "Royalty",
      price: "₹4999",
      period: " / 4 Years",
      description: "Unmatched luxury. The ultimate way to travel with Bushive.",
      features: [
        "32 Total Trips (8/Year)",
        "Flat 20% Discount / Booking",
        "Free Meal every 4th Trip",
        "Elite Lounge Access",
        "Private Sleeper Upgrades",
        "Dedicated Travel Concierge"
      ],
      icon: <Zap className="w-6 h-6 text-indigo-500" />,
      color: "from-indigo-300 via-purple-500 to-indigo-800",
      textColor: "text-indigo-950",
      buttonVariant: "outline" as const,
      badge: "ELITE TRAVELER"
    }
  ];

  return (
    <div className={`min-h-screen bg-slate-50 py-12 px-4 sm:px-6 lg:px-8 ${outfit.className}`}>
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center mb-8">
          <Link href="/">
            <Button variant="ghost" className="group">
              <ArrowLeft className="w-4 h-4 mr-2 group-hover:-translate-x-1 transition-transform" />
              Back to Home
            </Button>
          </Link>
        </div>

        <div className="text-center mb-16">
          <h1 className="text-4xl font-black text-slate-900 sm:text-5xl md:text-6xl tracking-tight font-headline italic">
            Elevate Your <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-indigo-600">Journey</span>
          </h1>
          <p className="mt-4 max-w-2xl mx-auto text-xl text-slate-600 font-medium">
            Choose a premium membership and enjoy exclusive benefits, luxury comfort, and total flexibility on every trip.
          </p>
        </div>

        {/* Plans Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {plans.map((plan) => (
            <Card 
              key={plan.name} 
              className={`relative flex flex-col border-none shadow-xl transition-all duration-300 hover:scale-105 ${plan.popular ? 'ring-2 ring-amber-500' : ''} ${plan.badge ? 'ring-2 ring-violet-500' : ''}`}
            >
              {(plan.popular || plan.badge) && (
                <div className={`absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 text-white px-4 py-1 rounded-full text-sm font-bold shadow-md bg-gradient-to-r ${plan.popular ? 'from-amber-500 to-yellow-500' : 'from-violet-500 to-indigo-600'}`}>
                  {plan.popular ? 'MOST POPULAR' : plan.badge}
                </div>
              )}
              
              <CardHeader className={`rounded-t-xl bg-gradient-to-br ${plan.color} p-8 text-center`}>
                <div className="flex justify-center mb-4">
                  <div className="p-3 bg-white/20 backdrop-blur-md rounded-2xl shadow-inner">
                    {plan.icon}
                  </div>
                </div>
                <CardTitle className={`text-3xl font-bold ${plan.textColor} font-headline`}>{plan.name}</CardTitle>
                <div className="mt-4 flex items-baseline justify-center">
                  <span className={`text-5xl font-extrabold tracking-tight ${plan.textColor}`}>{plan.price}</span>
                  <span className={`ml-1 text-xl font-medium ${plan.textColor} opacity-80`}>{plan.period}</span>
                </div>
                <CardDescription className={`${plan.textColor} opacity-90 font-medium mt-4 line-clamp-2`}>
                  {plan.description}
                </CardDescription>
              </CardHeader>

              <CardContent className="flex-1 p-8 bg-white">
                <ul className="space-y-4">
                  {plan.features.map((feature, i) => (
                    <li key={i} className="flex items-start">
                      <div className="flex-shrink-0">
                        <Check className="h-5 w-5 text-green-500" />
                      </div>
                      <p className="ml-3 text-base text-slate-600 font-medium">
                        {feature}
                      </p>
                    </li>
                  ))}
                </ul>
              </CardContent>

              <CardFooter className="p-8 bg-white rounded-b-xl pt-0">
                 <Button 
                  className={`w-full py-6 text-lg font-bold shadow-lg ${plan.popular ? 'bg-amber-600 hover:bg-amber-700' : ''}`}
                  variant={plan.buttonVariant}
                  onClick={() => handleJoin(plan)}
                  disabled={loadingPlan === plan.name}
                >
                  {loadingPlan === plan.name ? (
                    <>
                      <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                      Processing...
                    </>
                  ) : (
                    `Join ${plan.name}`
                  )}
                </Button>

              </CardFooter>
            </Card>
          ))}
        </div>

        {/* Rules Section */}
        <div className="mt-24 max-w-4xl mx-auto bg-white p-10 rounded-3xl shadow-2xl border border-slate-100">
          <h2 className="text-3xl font-black text-slate-900 mb-8 font-headline italic">Premium Membership Rules</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-10 text-left">
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-bold text-primary flex items-center gap-2">
                  <Shield className="w-5 h-5" />
                  Plan Structure
                </h3>
                <p className="text-slate-600 mt-2 font-medium">Valid for 4 years with a limit of 8 trips per year (32 trips total). Perfectly balanced for your seasonal travel needs.</p>
              </div>
              <div>
                <h3 className="text-lg font-bold text-primary flex items-center gap-2">
                  <Zap className="w-5 h-5" />
                  Unlimited Savings
                </h3>
                <p className="text-slate-600 mt-2 font-medium">No annual wallet limits. Get a guaranteed discount on every single trip, automatically applied at checkout.</p>
              </div>
            </div>
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-bold text-primary flex items-center gap-2">
                  <Star className="w-5 h-5" />
                  20% Discount System
                </h3>
                <p className="text-slate-600 mt-2 font-medium">Enjoy a flat 20% discount on your booking amount. The more you travel, the more you save with Bushive Premium.</p>
              </div>
              <div>
                <h3 className="text-lg font-bold text-primary flex items-center gap-2">
                  <Crown className="w-5 h-5" />
                  Meal Benefits
                </h3>
                <p className="text-slate-600 mt-2 font-medium">Enjoy a complimentary premium meal on every 4th trip of the year. Your comfort is our priority on every journey.</p>
              </div>
            </div>
          </div>
          <div className="mt-10 pt-8 border-t border-slate-100">
            <p className="text-sm text-slate-400 font-medium italic">
              * Membership is non-refundable once any trip in a set of 4 is completed. No ID verification required.
            </p>
          </div>
        </div>

        {/* Bottom Section */}
        <div className="mt-20 text-center">
          <div className="inline-flex items-center gap-2 px-6 py-2 bg-white rounded-full shadow-md border border-slate-200 mb-8">
            <Star className="w-4 h-4 text-yellow-500 fill-yellow-500" />
            <span className="text-sm font-semibold text-slate-700">Trusted by over 50,000 premium members</span>
          </div>
          <p className="text-slate-500 max-w-xl mx-auto">
            All plans are valid for 4 years with 8 trips every year. Guaranteed 20% savings on every booking.
          </p>
        </div>
      </div>
    </div>
  );
}
