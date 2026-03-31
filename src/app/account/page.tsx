
'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import { Frown, CalendarIcon, LogOut, Trash2, Building, Camera } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { useFirebase } from '@/firebase';
import { handleSignOut } from '@/lib/auth';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Textarea } from '@/components/ui/textarea';
import { dataService } from '@/lib/data/client-service';
import { updateProfile, deleteUser } from 'firebase/auth';
import { Progress } from '@/components/ui/progress';
import { useUserProfile } from '@/hooks/use-user-profile';
import { produce } from 'immer';
import { FirebaseError } from 'firebase/app';


const profileSchema = z.object({
  displayName: z.string().min(2, 'Username must be at least 2 characters.'),
  email: z.string().email('Invalid email address.').optional().or(z.literal('')),
  phoneNumber: z.string().optional(),
  dob: z.date().optional(),
  age: z.number().optional().or(z.literal('')),
});

const adminProfileSchema = z.object({
    operatorName: z.string().min(2, 'Operator name is required.'),
    travelsName: z.string().min(2, 'Travels name is required.'),
    phoneNumber: z.string().min(10, 'Phone number is required.'),
    email: z.string().email('A valid email is required.'),
    address: z.string().min(10, 'Address is required.'),
    photoURL: z.string().url('Must be a valid URL.').optional().or(z.literal('')),
});

type ProfileFormValues = z.infer<typeof profileSchema>;
type AdminProfileFormValues = z.infer<typeof adminProfileSchema>;

export default function AccountPage() {
  const router = useRouter();
  const { auth, user, isUserLoading } = useFirebase();
  const { toast } = useToast();
  const [isDeleting, setIsDeleting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  
  const { userProfile, isLoading: isProfileLoading, updateUserProfile } = useUserProfile(user?.uid);

  useEffect(() => {
    async function checkAdminStatus() {
        if (user) {
            const adminStatus = await dataService.isAdmin(user.uid);
            setIsAdmin(adminStatus);
        }
    }
    checkAdminStatus();
  }, [user]);


  const form = useForm<ProfileFormValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      displayName: '',
      email: '',
      phoneNumber: '',
      dob: undefined,
      age: '',
    },
  });

  const adminForm = useForm<AdminProfileFormValues>({
    resolver: zodResolver(adminProfileSchema),
    defaultValues: {
        operatorName: '',
        travelsName: '',
        phoneNumber: '',
        email: '',
        address: '',
        photoURL: '',
    }
  });

  const dob = form.watch('dob');

  useEffect(() => {
    if (dob) {
      const today = new Date();
      let age = today.getFullYear() - dob.getFullYear();
      const m = today.getMonth() - dob.getMonth();
      if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) {
        age--;
      }
      form.setValue('age', age);
    } else {
      form.setValue('age', '');
    }
  }, [dob, form]);


  const isPhoneUser = useMemo(() => user?.email?.endsWith('@example.com'), [user]);

  useEffect(() => {
    if (!user || !userProfile) return;

    if (isAdmin) {
      adminForm.reset({
        operatorName: userProfile.operatorName || '',
        travelsName: user.displayName || userProfile.travelsName || '',
        phoneNumber: userProfile.phoneNumber || '',
        email: user.email || '',
        address: userProfile.address || '',
        photoURL: user.photoURL || userProfile.photoURL || '',
      });
    } else {
      form.reset({
        displayName: user.displayName || '',
        email: isPhoneUser ? userProfile.email || '' : user.email || '',
        phoneNumber: isPhoneUser ? user.email?.split('@')[0] : userProfile.phoneNumber || '',
        dob: userProfile.dob ? new Date(userProfile.dob) : undefined,
      });
    }
  }, [user, userProfile, isPhoneUser, isAdmin, adminForm, form]);

  const handleProfileUpdate = async (data: ProfileFormValues | AdminProfileFormValues) => {
    if (!auth.currentUser || !userProfile) return;
    setIsSaving(true);
    try {
      // Use Immer for safe nested updates
      const nextProfileState = produce(userProfile, draft => {
        if (isAdmin) {
          const adminData = data as AdminProfileFormValues;
          draft.operatorName = adminData.operatorName;
          draft.travelsName = adminData.travelsName;
          draft.phoneNumber = adminData.phoneNumber;
          draft.address = adminData.address;
          draft.photoURL = adminData.photoURL;
        } else {
          const userData = data as ProfileFormValues;
          draft.displayName = userData.displayName;
          if (isPhoneUser) draft.email = userData.email;
          draft.dob = userData.dob ? userData.dob.toISOString() : undefined;
        }
      });
      
      await updateUserProfile(nextProfileState);

      // Also update the core Firebase Auth profile if needed
      await updateProfile(auth.currentUser, {
        displayName: (data as any).travelsName || (data as any).displayName,
        photoURL: (data as any).photoURL,
      });

      await auth.currentUser.reload();

      toast({
        title: 'Profile Updated',
        description: 'Your changes have been saved.',
      });
    } catch(e: any) {
        toast({
            title: "Update Failed",
            description: e.message,
            variant: "destructive"
        });
    } finally {
        setIsSaving(false);
    }
  };
  
  const handleImageUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    if (!user || !event.target.files || event.target.files.length === 0 || !auth.currentUser) return;
    
    const file = event.target.files[0];
    setUploadProgress(0);

    try {
      const downloadURL = await dataService.uploadImage(file, `avatars/${user.uid}`, (progress) => {
        setUploadProgress(progress);
      });
      
      adminForm.setValue('photoURL', downloadURL, { shouldValidate: true });
      
      toast({ title: 'Success', description: 'Image URL updated. Save changes to finalize.' });
    } catch (error) {
      console.error("Image upload failed:", error);
      toast({
        title: 'Upload Failed',
        description: 'Could not upload the image. Please try again.',
        variant: 'destructive',
      });
    } finally {
        setTimeout(() => setUploadProgress(null), 1500); // Clear progress bar after a delay
    }
  };


  const handleDeleteAccount = async () => {
    if (!auth.currentUser) return;
    setIsDeleting(true);
    try {
        await dataService.deleteUserAccount(auth.currentUser.uid);
        await deleteUser(auth.currentUser);
        toast({
            title: "Account Deleted",
            description: "Your account has been permanently removed.",
        });
        router.push('/');
    } catch (e: any) {
        console.error("Deletion failed:", e);
        if (e instanceof FirebaseError && e.code === 'auth/requires-recent-login') {
            toast({
                title: "Action Required",
                description: "This is a sensitive action. Please log out and log back in again before deleting your account.",
                variant: "destructive",
                duration: 7000,
            });
        } else {
            toast({
                title: "Deletion Failed",
                description: e.message || 'Could not delete your account. Please try again or contact support.',
                variant: "destructive"
            });
        }
    } finally {
        setIsDeleting(false);
    }
  };
  
  const onSignOut = async () => {
    await handleSignOut(auth);
    router.push('/');
  }

  if (isUserLoading || isProfileLoading) {
    return <div className="container mx-auto px-4 py-8">Loading account details...</div>;
  }

  if (!user) {
    return (
        <div className="container mx-auto px-4 py-8">
            <Card className="max-w-2xl mx-auto text-center">
                <CardHeader>
                    <Frown className="w-16 h-16 mx-auto text-destructive" />
                    <CardTitle>Access Denied</CardTitle>
                </CardHeader>
                <CardContent>
                    <p className="text-muted-foreground">You must be logged in to view this page.</p>
                </CardContent>
                 <CardContent>
                    <Button onClick={() => router.push('/login')}>Go to Login</Button>
                </CardContent>
            </Card>
        </div>
    );
  }

  const renderAdminForm = () => (
    <Card>
        <CardHeader>
            <CardTitle>Admin Profile</CardTitle>
            <CardDescription>Manage your operator and contact information.</CardDescription>
        </CardHeader>
        <CardContent>
            <Form {...adminForm}>
                <form onSubmit={adminForm.handleSubmit(handleProfileUpdate)} className="space-y-6">
                    <div className="flex items-center gap-6">
                        <Avatar className="h-24 w-24">
                            <AvatarImage src={adminForm.watch('photoURL') || user.photoURL || undefined} alt={adminForm.watch('operatorName')} />
                            <AvatarFallback><Building /></AvatarFallback>
                        </Avatar>
                        <div className="flex-grow space-y-2">
                           <FormField control={adminForm.control} name="photoURL" render={({ field }) => (
                               <FormItem>
                                   <FormLabel>Profile Photo URL</FormLabel>
                                   <FormControl><Input placeholder="https://example.com/logo.png" {...field} /></FormControl>
                                   <FormMessage />
                               </FormItem>
                           )} />
                           <input
                             type="file"
                             ref={fileInputRef}
                             onChange={handleImageUpload}
                             className="hidden"
                             accept="image/png, image/jpeg, image/gif"
                           />
                           <Button type="button" variant="outline" onClick={() => fileInputRef.current?.click()} disabled={uploadProgress !== null}>
                             <Camera className="mr-2"/> {uploadProgress !== null ? 'Uploading...' : 'Upload Image'}
                           </Button>
                           {uploadProgress !== null && (
                                <div className="space-y-1">
                                    <Progress value={uploadProgress} className="w-full h-2"/>
                                    <p className="text-xs text-muted-foreground text-center">{Math.round(uploadProgress)}%</p>
                                </div>
                            )}
                        </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <FormField control={adminForm.control} name="operatorName" render={({ field }) => (
                           <FormItem><FormLabel>Operator Name</FormLabel><FormControl><Input placeholder="Your Company Inc." {...field} /></FormControl><FormMessage /></FormItem>
                        )} />
                        <FormField control={adminForm.control} name="travelsName" render={({ field }) => (
                           <FormItem><FormLabel>Travels Name</FormLabel><FormControl><Input placeholder="Your Brand Name" {...field} /></FormControl><FormMessage /></FormItem>
                        )} />
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                       <FormField control={adminForm.control} name="email" render={({ field }) => (
                           <FormItem><FormLabel>Email</FormLabel><FormControl><Input placeholder="contact@example.com" {...field} disabled /></FormControl><FormMessage /></FormItem>
                       )} />
                       <FormField control={adminForm.control} name="phoneNumber" render={({ field }) => (
                           <FormItem><FormLabel>Phone Number</FormLabel><FormControl><Input placeholder="+91..." {...field} /></FormControl><FormMessage /></FormItem>
                       )} />
                    </div>
                    <FormField control={adminForm.control} name="address" render={({ field }) => (
                       <FormItem><FormLabel>Address</FormLabel><FormControl><Textarea placeholder="Your office address" {...field} /></FormControl><FormMessage /></FormItem>
                    )} />
                    <Button type="submit" disabled={isSaving}>
                        {isSaving ? 'Saving...' : 'Save and Update'}
                    </Button>
                </form>
            </Form>
        </CardContent>
    </Card>
  );

  const renderUserForm = () => (
    <Card>
      <CardHeader>
        <CardTitle>User Details</CardTitle>
        <CardDescription>View and manage your personal information.</CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleProfileUpdate)} className="space-y-4">
            <FormField
              control={form.control}
              name="displayName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Username</FormLabel>
                  <FormControl>
                    <Input placeholder="Your username" {...field} />
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
                  <FormLabel>Email {isPhoneUser ? '(Optional)' : ''}</FormLabel>
                  <FormControl>
                    <Input placeholder="your.email@example.com" {...field} disabled={!isPhoneUser} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="phoneNumber"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Phone Number</FormLabel>
                  <FormControl>
                    <Input placeholder="Your phone number" {...field} disabled />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="flex items-end gap-4">
              <FormField
                control={form.control}
                name="dob"
                render={({ field }) => (
                  <FormItem className="flex flex-col w-1/2">
                    <FormLabel>Date of Birth</FormLabel>
                    <Popover>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button
                            variant={'outline'}
                            className={cn(
                              'w-full pl-3 text-left font-normal',
                              !field.value && 'text-muted-foreground'
                            )}
                          >
                            {field.value ? (
                              format(field.value, 'PPP')
                            ) : (
                              <span>Pick a date</span>
                            )}
                            <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          captionLayout="dropdown-buttons"
                          fromYear={1900}
                          toYear={new Date().getFullYear()}
                          selected={field.value}
                          onSelect={field.onChange}
                          disabled={(date) =>
                            date > new Date() || date < new Date('1900-01-01')
                          }
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                    <FormMessage />
                  </FormItem>
                )}
              />
               <FormField
                control={form.control}
                name="age"
                render={({ field }) => (
                  <FormItem className="w-1/2">
                    <FormLabel>Age</FormLabel>
                    <FormControl>
                      <Input placeholder="Your age" {...field} value={field.value ?? ''} disabled />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <Button type="submit" disabled={isSaving}>
              {isSaving ? 'Saving...' : 'Save and Update'}
            </Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  );

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="max-w-2xl mx-auto space-y-8">
        <h1 className="text-3xl font-bold">My Account</h1>
        
        {isAdmin ? renderAdminForm() : renderUserForm()}

        <div className="flex flex-col sm:flex-row gap-4">
            <AlertDialog>
                <AlertDialogTrigger asChild>
                    <Button variant="outline" className="w-full">
                        <LogOut className="mr-2" /> Log Out
                    </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                    <AlertDialogHeader>
                    <AlertDialogTitle>Are you sure you want to log out?</AlertDialogTitle>
                    <AlertDialogDescription>
                        You will be returned to the home page.
                    </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={onSignOut}>
                        Log Out
                    </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
             <AlertDialog>
                <AlertDialogTrigger asChild>
                    <Button variant="destructive" className="w-full">
                       <Trash2 className="mr-2" /> Delete My Account
                    </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                    <AlertDialogHeader>
                    <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                    <AlertDialogDescription>
                        This action cannot be undone. This will permanently delete your
                        account and remove your data from our servers.
                    </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                        onClick={handleDeleteAccount}
                        disabled={isDeleting}
                    >
                        {isDeleting ? 'Deleting...' : 'Delete My Account'}
                    </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>

      </div>
    </div>
  );
}
