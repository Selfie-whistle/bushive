'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { useFirebase } from '@/firebase';
import { handleSignOut } from '@/lib/auth';
import {
  Bus,
  LayoutDashboard,
  Ticket,
  MapPin,
  IndianRupee,
  Star,
  Users,
  LogOut,
  Menu,
  Settings,
  ChevronRight,
  ShieldCheck,
  CreditCard,
  ShieldAlert
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { AdminGlobalMonitor } from '@/components/admin-global-monitor';

const NAV_ITEMS = [
  { title: 'Dashboard', icon: LayoutDashboard, href: '/admin' },
  { title: 'Bookings', icon: Ticket, href: '/admin/bookings' },
  { title: 'Book tickets', icon: CreditCard, href: '/admin/generate-tickets' },
  { title: 'Live Tracking', icon: MapPin, href: '/admin/track' },
  { title: 'Fleet & Trips', icon: Bus, href: '/admin/trips' },
  { title: 'Reports', icon: IndianRupee, href: '/admin/reports' },
  { title: 'Reviews', icon: Star, href: '/admin/reviews' },
  { title: 'Cabin Crew', icon: Users, href: '/admin/cabin-crew' },
  { title: 'Emergency Logs', icon: ShieldAlert, href: '/admin/emergency-reports' },
];

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { auth, user } = useFirebase();
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  const onSignOut = async () => {
    await handleSignOut(auth);
    router.push('/');
  };

  return (
    <div className="min-h-screen bg-slate-50/50 flex flex-col md:flex-row overflow-hidden font-sans selection:bg-rose-100 selection:text-rose-900">
      
      {/* Mobile Header */}
      <div className="md:hidden flex items-center justify-between p-4 bg-white/80 backdrop-blur-md border-b border-slate-200/50 sticky top-0 z-50">
        <div className="flex items-center gap-2">
          <div className="bg-gradient-to-br from-rose-500 to-amber-500 p-2 rounded-lg text-white shadow-sm">
            <Bus className="w-5 h-5" />
          </div>
          <span className="font-bold text-lg text-slate-900">Admin</span>
        </div>
        <Button variant="ghost" size="icon" onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="text-slate-600 hover:text-slate-900 hover:bg-slate-100">
          <Menu className="w-6 h-6" />
        </Button>
      </div>

      {/* Sidebar */}
      <AnimatePresence mode="wait">
        {(isSidebarOpen || (typeof window !== 'undefined' && window.innerWidth >= 768)) && (
          <motion.aside
            initial={{ x: -300, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: -300, opacity: 0 }}
            transition={{ type: "spring", bounce: 0, duration: 0.4 }}
            className={cn(
              "fixed inset-y-0 left-0 z-40 w-72 bg-white/80 backdrop-blur-xl border-r border-slate-200/60 shadow-[4px_0_24px_rgba(0,0,0,0.02)]",
              "flex flex-col md:relative md:translate-x-0 transition-transform duration-300",
              !isSidebarOpen ? "-translate-x-full" : "translate-x-0"
            )}
          >
            {/* Sidebar Header */}
            <div className="h-20 flex items-center px-6 border-b border-slate-100/50">
              <Link href="/admin" className="flex items-center gap-3 group">
                <div className="bg-gradient-to-br from-rose-500 to-amber-500 p-2.5 rounded-xl text-white shadow-lg shadow-rose-500/20 group-hover:scale-105 transition-transform">
                  <Bus className="w-6 h-6" />
                </div>
                <div>
                  <h2 className="font-bold text-xl text-slate-800 tracking-tight">Bushive</h2>
                  <p className="text-xs font-medium text-slate-500 flex items-center gap-1">
                    <ShieldCheck className="w-3 h-3 text-rose-500" /> Operator Panel
                  </p>
                </div>
              </Link>
            </div>

            {/* Navigation */}
            <nav className="flex-1 overflow-y-auto p-4 space-y-1.5 custom-scrollbar">
              <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-4 px-2 mt-2">Menu</div>
              {NAV_ITEMS.map((item) => {
                const isActive = pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => {
                        if (typeof window !== 'undefined' && window.innerWidth < 768) setIsSidebarOpen(false);
                    }}
                    className={cn(
                      "flex items-center justify-between px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 group relative overflow-hidden",
                      isActive
                        ? "text-white shadow-lg shadow-rose-500/30"
                        : "text-slate-600 hover:text-slate-900 hover:bg-slate-100/80"
                    )}
                  >
                    {isActive && (
                      <motion.div 
                        layoutId="activeNavIndicator" 
                        className="absolute inset-0 bg-gradient-to-r from-rose-500 to-amber-500 rounded-xl"
                        initial={false}
                        transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                      />
                    )}
                    <div className="flex items-center gap-3 relative z-10">
                      <item.icon className={cn("w-5 h-5 transition-colors", isActive ? "text-white" : "text-slate-400 group-hover:text-slate-600")} />
                      {item.title}
                    </div>
                    {isActive && <ChevronRight className="w-4 h-4 relative z-10 text-white/80" />}
                  </Link>
                );
              })}
            </nav>

            {/* Sidebar Footer */}
            <div className="p-4 border-t border-slate-100/50 bg-slate-50/30">
              <div className="flex items-center gap-3 px-2 mb-4">
                <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-rose-100 to-amber-100 flex items-center justify-center text-rose-700 font-bold border border-rose-200/50 shadow-sm">
                  {user?.displayName?.charAt(0) || 'A'}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-800 truncate">{user?.displayName || 'Admin'}</p>
                  <p className="text-xs text-slate-500 truncate">{user?.email || 'admin@bushive'}</p>
                </div>
              </div>
              
              <Button 
                variant="outline" 
                className="w-full justify-start text-slate-600 hover:text-rose-600 hover:bg-rose-50 hover:border-rose-100 transition-colors"
                onClick={onSignOut}
              >
                <LogOut className="w-4 h-4 mr-2" />
                Sign Out
              </Button>
            </div>
          </motion.aside>
        )}
      </AnimatePresence>

      {/* Main Content Area */}
      <main className="flex-1 relative h-screen overflow-y-auto">
        {/* Animated Light Effects */}
        <div className="fixed inset-0 pointer-events-none -z-10 overflow-hidden">
          <div className="absolute inset-0 bg-slate-50/90" />
          <motion.div
            animate={{
              scale: [1, 1.2, 1],
              opacity: [0.3, 0.5, 0.3],
            }}
            transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
            className="absolute -top-64 -right-64 w-[500px] h-[500px] bg-rose-400/30 rounded-full blur-[120px]"
          />
          <motion.div
            animate={{
              scale: [1, 1.5, 1],
              opacity: [0.2, 0.4, 0.2],
            }}
            transition={{ duration: 10, repeat: Infinity, ease: "easeInOut", delay: 2 }}
            className="absolute top-1/3 -left-64 w-[400px] h-[400px] bg-blue-400/20 rounded-full blur-[100px]"
          />
          <motion.div
            animate={{
              scale: [1, 1.3, 1],
              opacity: [0.2, 0.5, 0.2],
            }}
            transition={{ duration: 9, repeat: Infinity, ease: "easeInOut", delay: 4 }}
            className="absolute -bottom-64 right-1/4 w-[600px] h-[600px] bg-emerald-400/20 rounded-full blur-[150px]"
          />
        </div>
        
        <AdminGlobalMonitor />
        {children}
      </main>

      {/* Mobile overlay */}
      {isSidebarOpen && (
        <div 
          className="fixed inset-0 bg-slate-900/20 backdrop-blur-sm z-30 md:hidden"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}
    </div>
  );
}
