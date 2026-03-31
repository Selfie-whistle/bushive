
'use client';

import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useRouter } from 'next/navigation';
import { useFirebase } from '@/firebase';
import { createUserWithEmailAndPassword, updateProfile } from 'firebase/auth';
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
import { Eye, EyeOff, UserPlus, ArrowLeft } from 'lucide-react';
import { dataService } from '@/lib/data/client-service';
import type { Bus } from '@/lib/types';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const crewRegisterSchema = z.object({
  email: z.string().email({ message: 'A valid email address is required.' }),
  password: z.string().min(8, { message: 'Password must be at least 8 characters.' }),
  busNumber: z.string().min(1, { message: 'Bus number is required.'}),
});

type FormValues = z.infer<typeof crewRegisterSchema>;

export default function CabinCrewRegisterPage() {
  const router = useRouter();
  const { auth, user } = useFirebase();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(crewRegisterSchema),
    defaultValues: {
      email: '',
      password: '',
      busNumber: '',
    },
  });

  const onSubmit = async (data: FormValues) => {
    setIsLoading(true);
    try {
        const busId = data.busNumber.replace(/\s+/g, '');
        const busToUpdate = await dataService.getBusById(busId);
        if (!busToUpdate) {
            throw new Error("Bus with the provided number not found.");
        }

      const userCredential = await createUserWithEmailAndPassword(auth, data.email, data.password);
      
      await updateProfile(userCredential.user, {
        displayName: `${busToUpdate.travelsName} Crew`,
      });

      await dataService.addBus({ ...busToUpdate, cabinCrewId: data.email });

      toast({
        title: 'Cabin Crew Account Created',
        description: `Crew member assigned to bus ${busToUpdate.busNumber}.`,
      });
      router.push('/admin/cabin-crew');

    } catch (error) {
      let errorMessage = 'An unexpected error occurred.';
      if (error instanceof FirebaseError) {
        switch(error.code) {
          case 'auth/email-already-in-use':
            errorMessage = 'This email is already registered.';
            break;
          default:
            errorMessage = error.message;
        }
      } else if (error instanceof Error) {
        errorMessage = error.message;
      }
      toast({
        variant: 'destructive',
        title: 'Registration Failed',
        description: errorMessage,
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="container flex min-h-[calc(100vh-10rem)] items-center justify-center py-12">
      <Card className="w-full max-w-md">
        <CardHeader>
           <Button variant="ghost" size="sm" onClick={() => router.push('/admin/cabin-crew')} className="w-fit p-0 h-auto mb-2">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Cabin Crew
          </Button>
          <CardTitle className="flex items-center gap-2">
            <UserPlus />
            Register New Cabin Crew
          </CardTitle>
          <CardDescription>Assign a new login to a specific bus in your fleet.</CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
               <FormField
                control={form.control}
                name="busNumber"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Bus Number</FormLabel>
                    <FormControl>
                      <Input placeholder="Enter the bus registration number" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Login Email</FormLabel>
                    <FormControl><Input placeholder="crew.member@example.com" {...field} /></FormControl>
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
                      <div className="relative">
                        <Input
                          placeholder="••••••••"
                          type={showPassword ? 'text' : 'password'}
                          {...field}
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute inset-y-0 right-0 flex items-center pr-3 text-sm leading-5"
                        >
                          {showPassword ? (
                            <EyeOff className="h-5 w-5 text-gray-500" />
                          ) : (
                            <Eye className="h-5 w-5 text-gray-500" />
                          )}
                        </button>
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button type="submit" disabled={isLoading} className="w-full">
                {isLoading ? 'Registering...' : 'Register & Assign Crew'}
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
