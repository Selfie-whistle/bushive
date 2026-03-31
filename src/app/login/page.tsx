
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
import { Eye, EyeOff } from 'lucide-react';
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
    <div className="container flex min-h-[calc(100vh-10rem)] items-center justify-center py-12">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Welcome Back</CardTitle>
          <CardDescription>Sign in to your BusHive account.</CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...userForm}>
            <form onSubmit={userForm.handleSubmit(onSubmit)} className="space-y-4">
              <FormField control={userForm.control} name="emailOrPhone" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email or Phone</FormLabel>
                    <FormControl><Input placeholder="you@example.com or 9876543210" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField control={userForm.control} name="password" render={({ field }) => (
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
                    <div className="text-right pt-1"><Link href="/reset-password" className="text-sm font-medium text-link underline-offset-4 hover:underline">Forgot password?</Link></div>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button type="submit" disabled={isLoading} className="w-full">{isLoading ? 'Logging in...' : 'Login'}</Button>
              <div className="text-center text-sm text-muted-foreground">
                Don't have an account?{' '}
                <Link href="/signup" className="font-bold text-link underline">Sign up here</Link>
              </div>
            </form>
          </Form>
        </CardContent>
        <div className="p-6 pt-0 text-xs text-right text-muted-foreground">
            <Dialog>
                <DialogTrigger asChild>
                    <Button variant="link" className="p-0 h-auto">Admin Login</Button>
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
             <span className="mx-1">/</span>
             <Dialog>
                <DialogTrigger asChild>
                    <Button variant="link" className="p-0 h-auto">Cabin Crew Login</Button>
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
    </div>
  );
}
