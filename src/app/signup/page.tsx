'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useFirebase } from '@/firebase';
import { createUserWithEmailAndPassword } from 'firebase/auth';
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
import { Checkbox } from '@/components/ui/checkbox';

const signUpSchema = z.object({
  phoneNumber: z.string().length(10, { message: 'Phone number must be 10 digits.' }),
  password: z
    .string()
    .min(8, { message: 'Password must be at least 8 characters.' })
    .regex(/[A-Z]/, { message: 'Password must contain at least one uppercase letter.' })
    .regex(/[a-z]/, { message: 'Password must contain at least one lowercase letter.' })
    .regex(/\d/, { message: 'Password must contain at least one number.' }),
});

type FormValues = z.infer<typeof signUpSchema>;

export default function SignUpPage() {
  const router = useRouter();
  const { auth } = useFirebase();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [passwordValue, setPasswordValue] = useState('');

  const form = useForm<FormValues>({
    resolver: zodResolver(signUpSchema),
    defaultValues: {
      phoneNumber: '',
      password: '',
    },
  });

  const has8Chars = passwordValue.length >= 8;
  const hasNumber = /\d/.test(passwordValue);
  const hasCapital = /[A-Z]/.test(passwordValue);
  const hasSmall = /[a-z]/.test(passwordValue);

  const onSubmit = async (data: FormValues) => {
    setIsLoading(true);

    const dummyEmail = `${data.phoneNumber}@example.com`;

    try {
      await createUserWithEmailAndPassword(auth, dummyEmail, data.password);
      toast({
        title: 'Account Created',
        description: "You're now logged in.",
      });
      router.push('/');
    } catch (error) {
      if (error instanceof FirebaseError && error.code === 'auth/email-already-in-use') {
        toast({
          variant: 'destructive',
          title: 'Account Already Exists',
          description: 'Redirecting you to the login page.',
        });
        router.push('/login');
        return; 
      }
      
      console.error(error);
      let errorMessage = 'An unexpected error occurred.';
      if (error instanceof FirebaseError) {
        errorMessage = error.message;
      }
      toast({
        variant: 'destructive',
        title: 'Sign Up Failed',
        description: errorMessage,
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="container flex min-h-[calc(100vh-10rem)] items-center justify-center py-12">
      <Card className="w-[400px]">
        <CardHeader>
          <CardTitle>Create an account</CardTitle>
          <CardDescription>Join us! It only takes a minute.</CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="phoneNumber"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Phone Number</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="Your phone number"
                        {...field}
                        type="tel"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Password</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="••••••••"
                        {...field}
                        type="password"
                        onChange={(e) => {
                          field.onChange(e);
                          setPasswordValue(e.target.value);
                        }}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="space-y-2">
                <div className="flex items-center space-x-2">
                  <Checkbox id="has-8-chars" checked={has8Chars} disabled />
                  <label
                    htmlFor="has-8-chars"
                    className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                  >
                    Passwords should contain minimum 8 characters
                  </label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox id="has-capital" checked={hasCapital} disabled />
                  <label
                    htmlFor="has-capital"
                    className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                  >
                    Passwords should contain a capital letter
                  </label>
                </div>
                 <div className="flex items-center space-x-2">
                  <Checkbox id="has-small" checked={hasSmall} disabled />
                  <label
                    htmlFor="has-small"
                    className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                  >
                    Passwords should contain a small letter
                  </label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox id="has-number" checked={hasNumber} disabled />
                  <label
                    htmlFor="has-number"
                    className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                  >
                    Passwords should contain a number
                  </label>
                </div>
              </div>
               <div className="text-center text-sm text-muted-foreground">
                  Or,{' '}
                  <Link href="/signup/email" className="font-bold text-link underline">
                    sign up with email
                  </Link>
                </div>
              <Button type="submit" disabled={isLoading} className="w-full">
                {isLoading ? 'Creating Account...' : 'Sign Up'}
              </Button>
              <div className="text-center text-sm text-muted-foreground">
                Already have an account?{' '}
                <Link href="/login" className="font-bold text-link underline">
                  Login here
                </Link>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
