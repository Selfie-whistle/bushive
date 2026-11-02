
'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useFirebase } from '@/firebase';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword } from 'firebase/auth';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { FirebaseError } from 'firebase/app';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Eye, EyeOff, Bus, Sparkles } from 'lucide-react';
import { motion } from 'framer-motion';
import { dataService } from '@/lib/data/client-service';

const userLoginSchema = z.object({
  emailOrPhone: z.string().min(1, { message: 'Email or Phone Number is required.' }),
  password: z.string().min(1, { message: 'Password is required.' }),
});

const roleLoginSchema = z.object({
  email: z.string().email({ message: 'Invalid email address.' }),
  password: z.string().min(1, 'Password is required.'),
});

type UserFormValues = z.infer<typeof userLoginSchema>;
type RoleFormValues = z.infer<typeof roleLoginSchema>;

function RoleLoginForm({ role }: { role: 'Admin' | 'Cabin Crew' }) {
    const router = useRouter();
    const { auth } = useFirebase();
    const { toast } = useToast();
    const [isLoading, setIsLoading] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    
    const form = useForm<RoleFormValues>({
        resolver: zodResolver(roleLoginSchema),
        defaultValues: {
            email: '',
            password: '',
        },
    });

    const handleLogin = async (data: RoleFormValues) => {
        setIsLoading(true);
        try {
            const userCredential = await signInWithEmailAndPassword(auth, data.email, data.password);
            
            if (role === 'Admin') {
                const isAdmin = await dataService.isAdmin(userCredential.user.uid);
                if (isAdmin) {
                    toast({ title: 'Admin Login Successful' });
                    router.push('/admin');
                } else {
                    throw new Error("You do not have admin privileges.");
                }
            } else if (role === 'Cabin Crew') {
                 const isCrew = await dataService.isCabinCrew(data.email);
                 if (isCrew) {
                    toast({ title: 'Cabin Crew Login Successful' });
                    router.push('/cabin-crew');
                } else {
                    throw new Error("Invalid credentials for Cabin Crew.");
                }
            }

        } catch (error) {
            let errorMessage = 'An unexpected error occurred.';
            if (error instanceof FirebaseError) {
              switch(error.code) {
                case 'auth/user-not-found':
                  errorMessage = 'User not found. Please register first.';
                  break;
                case 'auth/invalid-credential':
                  errorMessage = 'Incorrect credentials. Please try again.';
                  break;
                default:
                  errorMessage = error.message;
              }
            } else if (error instanceof Error) {
                errorMessage = error.message;
            }
            toast({
              variant: 'destructive',
              title: `${role} Login Failed`,
              description: errorMessage,
            });
        } finally {
          setIsLoading(false);
        }
    };
    
    return (
        <Form {...form}>
            <form onSubmit={form.handleSubmit(handleLogin)} className="space-y-4">
                <FormField control={form.control} name="email" render={({ field }) => (
                    <FormItem>
                        <FormLabel>Email</FormLabel>
                        <FormControl><Input placeholder={`${role} Email`} {...field} /></FormControl>
                        <FormMessage />
                    </FormItem>
                )} />
                <FormField control={form.control} name="password" render={({ field }) => (
                    <FormItem>
                        <FormLabel>Password</FormLabel>
                        <FormControl>
                            <div className="relative">
                                <Input placeholder="••••••••" type={showPassword ? 'text' : 'password'} {...field} />
                                <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute inset-y-0 right-0 pr-3 flex items-center text-sm leading-5">
                                    {showPassword ? <EyeOff className="h-5 w-5 text-gray-500" /> : <Eye className="h-5 w-5 text-gray-500" />}
                                </button>
                            </div>
                        </FormControl>
                        <FormMessage />
                    </FormItem>
                )} />
                <div className="flex flex-col sm:flex-row gap-2">
                    <Button type="submit" disabled={isLoading} className="w-full">{isLoading ? 'Logging in...' : 'Login'}</Button>
                    {role === 'Admin' && (
                      <Button asChild className="w-full" variant="secondary">
                        <Link href="/register/admin">Register</Link>
                      </Button>
                    )}
                    {role === 'Cabin Crew' && (
                      <Button asChild className="w-full" variant="secondary">
                        <Link href="/admin/cabin-crew/register">Register</Link>
                      </Button>
                    )}
                </div>
            </form>
        </Form>
    );
}

export default function LoginPage() {
  const router = useRouter();
  const { auth } = useFirebase();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const userForm = useForm<UserFormValues>({
    resolver: zodResolver(userLoginSchema),
    defaultValues: { emailOrPhone: '', password: '' },
  });

  const handleLoginSuccess = async (user: any) => {
    const isAdmin = await dataService.isAdmin(user.uid);
    if (isAdmin) {
      router.push('/admin');
      return;
    }
    const isCrew = await dataService.isCabinCrew(user.email);
    if (isCrew) {
      router.push('/cabin-crew');
      return;
    }
    router.push('/');
  };

  const onSubmit = async (data: UserFormValues) => {
    setIsLoading(true);
    let email = data.emailOrPhone;
    const isPhoneNumber = /^\d{10}$/.test(email);
    const isEmail = z.string().email().safeParse(email).success;

    if (!isPhoneNumber && !isEmail) {
        toast({
            variant: 'destructive',
            title: 'Invalid Input',
            description: 'Please enter a valid 10-digit phone number or an email address.',
        });
        setIsLoading(false);
        return;
    }

    if (isPhoneNumber) {
      email = `${email}@example.com`;
    }
    
    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, data.password);
      toast({
        title: 'Login Successful',
        description: "Welcome back!",
      });
      await handleLoginSuccess(userCredential.user);
    } catch (error) {
      if (error instanceof FirebaseError && error.code === 'auth/user-not-found') {
        try {
            const userCredential = await createUserWithEmailAndPassword(auth, email, data.password);
             toast({
                title: 'Account Created',
                description: 'Welcome! You have been signed up and logged in.',
            });
            await handleLoginSuccess(userCredential.user);
        } catch (creationError: any) {
             toast({
                variant: 'destructive',
                title: 'Sign Up Failed',
                description: creationError.message || 'An unknown error occurred during sign up.',
            });
        }
      } else {
        let errorMessage = 'An unexpected error occurred.';
        if (error instanceof FirebaseError) {
          switch (error.code) {
            case 'auth/invalid-credential':
            case 'auth/wrong-password':
              errorMessage = 'Incorrect email, phone, or password. Please try again.';
              break;
            default:
              errorMessage = 'Failed to log in. Please check your credentials.';
          }
        }
        console.error(error);
        toast({
          variant: 'destructive',
          title: 'Login Failed',
          description: errorMessage,
        });
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="relative min-h-[calc(100vh-4rem)] flex items-center justify-center py-12 px-4 overflow-hidden">
      {/* Animated Background */}
      <div className="absolute inset-0 bg-gradient-to-br from-red-50 via-white to-rose-50 -z-20" />
      <div className="absolute inset-0 overflow-hidden pointer-events-none opacity-60 mix-blend-multiply z-0">
          <motion.div 
              animate={{ rotate: 360, scale: [1, 1.2, 1], x: [0, 40, -20, 0], y: [0, 30, -30, 0] }} 
              transition={{ duration: 15, repeat: Infinity, ease: "linear" }}
              className="absolute top-[-10%] left-[-10%] w-[50vw] h-[50vw] rounded-full bg-red-200/50 blur-[100px]"
          />
          <motion.div 
              animate={{ rotate: -360, scale: [1, 1.3, 1], x: [0, -30, 40, 0], y: [0, -40, 50, 0] }} 
              transition={{ duration: 18, repeat: Infinity, ease: "linear" }}
              className="absolute bottom-[-10%] right-[-10%] w-[45vw] h-[45vw] rounded-full bg-rose-200/40 blur-[100px]"
          />
      </div>

      <motion.div 
        initial={{ opacity: 0, y: 30, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
        className="w-full max-w-md relative z-10"
      >
        <Card className="w-full bg-white/80 backdrop-blur-xl border border-white shadow-[0_8px_30px_rgb(0,0,0,0.12)] rounded-3xl overflow-hidden ring-1 ring-black/5">
          <CardHeader className="text-center pb-2 pt-8">
            <motion.div 
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: "spring", delay: 0.2, duration: 0.6 }}
                className="w-16 h-16 bg-gradient-to-tr from-red-600 to-rose-500 rounded-2xl mx-auto flex items-center justify-center mb-4 shadow-lg text-white"
            >
                <Bus className="w-8 h-8" />
            </motion.div>
            <CardTitle className="text-3xl font-black text-gray-900 tracking-tight">Welcome Back</CardTitle>
            <CardDescription className="text-base text-gray-500 font-medium mt-2">Sign in to your BusHive account.</CardDescription>
          </CardHeader>
          <CardContent className="px-6 md:px-8 pb-8 pt-4">
            <Form {...userForm}>
              <form onSubmit={userForm.handleSubmit(onSubmit)} className="space-y-5">
                <FormField control={userForm.control} name="emailOrPhone" render={({ field }) => (
                    <FormItem>
                      <FormLabel className="font-bold text-gray-700">Email or Phone</FormLabel>
                      <FormControl>
                          <Input className="h-12 bg-white/50 border-gray-200 focus-visible:ring-red-500 focus-visible:border-red-500 rounded-xl" placeholder="you@example.com or 9876543210" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField control={userForm.control} name="password" render={({ field }) => (
                    <FormItem>
                      <FormLabel className="font-bold text-gray-700">Password</FormLabel>
                      <FormControl>
                          <div className="relative">
                              <Input className="h-12 bg-white/50 border-gray-200 focus-visible:ring-red-500 focus-visible:border-red-500 rounded-xl pr-10" placeholder="••••••••" type={showPassword ? 'text' : 'password'} {...field} />
                               <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute inset-y-0 right-0 pr-3 flex items-center text-sm leading-5">
                                  {showPassword ? <EyeOff className="h-5 w-5 text-gray-400 hover:text-red-600 transition-colors" /> : <Eye className="h-5 w-5 text-gray-400 hover:text-red-600 transition-colors" />}
                              </button>
                          </div>
                      </FormControl>
                      <div className="text-right pt-1"><Link href="/reset-password" className="text-sm font-semibold text-red-600 hover:text-red-800 transition-colors">Forgot password?</Link></div>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <Button type="submit" disabled={isLoading} className="w-full h-12 text-base font-bold bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-700 hover:to-rose-700 shadow-md rounded-xl transition-all hover:scale-[1.02] active:scale-[0.98]">
                    {isLoading ? 'Logging in...' : 'Login'}
                </Button>
                <div className="text-center text-sm font-medium text-gray-500 mt-6">
                  Don't have an account?{' '}
                  <Link href="/signup" className="font-black text-red-600 hover:text-red-800 transition-colors">Sign up here</Link>
                </div>
              </form>
            </Form>
          </CardContent>
          <div className="bg-gray-50/50 p-4 border-t border-gray-100 flex flex-wrap justify-center items-center gap-2 text-xs font-semibold text-gray-400">
              <Dialog>
                  <DialogTrigger asChild>
                      <button className="hover:text-red-600 transition-colors">Admin Login</button>
                  </DialogTrigger>
                  <DialogContent className="sm:max-w-[425px]">
                      <DialogHeader>
                          <DialogTitle>Admin Login</DialogTitle>
                          <DialogDescription>Access the administration panel.</DialogDescription>
                      </DialogHeader>
                      <div className="py-4">
                          <RoleLoginForm role="Admin" />
                      </div>
                  </DialogContent>
              </Dialog>
               <span className="opacity-50">•</span>
               <Link href="/register/admin" className="hover:text-red-600 transition-colors">Create Admin</Link>
               <span className="opacity-50">•</span>
               <Dialog>
                  <DialogTrigger asChild>
                      <button className="hover:text-red-600 transition-colors">Cabin Crew Login</button>
                  </DialogTrigger>
                  <DialogContent className="sm:max-w-[425px]">
                      <DialogHeader>
                          <DialogTitle>Cabin Crew Login</DialogTitle>
                          <DialogDescription>Access the trip management console.</DialogDescription>
                      </DialogHeader>
                      <div className="py-4">
                          <RoleLoginForm role="Cabin Crew" />
                      </div>
                  </DialogContent>
              </Dialog>
          </div>
        </Card>
      </motion.div>
    </div>
  );
}
