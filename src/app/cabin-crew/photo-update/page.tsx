'use client';

import React, { useState, useEffect, Suspense, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, Upload, Camera, ImageIcon, ImagePlus, Info } from 'lucide-react';
import { format } from 'date-fns';

import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { dataService } from '@/lib/data/client-service';
import type { Bus } from '@/lib/types';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

function PhotoUpdateContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const busId = searchParams.get('busId');
  const { toast } = useToast();

  const [bus, setBus] = useState<Bus | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!busId) {
      toast({ title: 'Error', description: 'Bus ID is missing.', variant: 'destructive' });
      router.back();
      return;
    }
    
    dataService.getBusById(busId).then(fetchedBus => {
      if (fetchedBus) {
        setBus(fetchedBus);
      } else {
        toast({ title: 'Error', description: 'Bus not found.', variant: 'destructive' });
        router.back();
      }
    });
  }, [busId, router, toast]);

  const processImage = async (file: File): Promise<File | null> => {
    const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;
    if (Date.now() - file.lastModified > TWENTY_FOUR_HOURS) {
      toast({
        title: 'Image Too Old',
        description: `The image "${file.name}" was taken more than 24 hours ago. Please upload recent images only.`,
        variant: 'destructive',
      });
      return null;
    }

    return new Promise((resolve) => {
      const img = new Image();
      const objectUrl = URL.createObjectURL(file);
      
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        
        if (!ctx) {
          resolve(file); // fallback
          return;
        }

        // Draw original image
        ctx.drawImage(img, 0, 0);

        // Add Watermark
        const dateStr = format(new Date(), "dd MMM yyyy, HH:mm");
        const text = `Bushive Live: ${dateStr}`;
        
        const fontSize = Math.max(14, Math.floor(img.width * 0.03));
        ctx.font = `bold ${fontSize}px sans-serif`;
        
        const textMetrics = ctx.measureText(text);
        const padding = fontSize * 0.5;
        const bgWidth = textMetrics.width + padding * 2;
        const bgHeight = fontSize + padding * 2;
        
        const x = img.width - bgWidth - padding;
        const y = img.height - bgHeight - padding;

        ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
        ctx.fillRect(x, y, bgWidth, bgHeight);

        ctx.fillStyle = '#ffffff';
        ctx.textBaseline = 'top';
        ctx.fillText(text, x + padding, y + padding);

        canvas.toBlob((blob) => {
          URL.revokeObjectURL(objectUrl);
          if (blob) {
            const watermarkedFile = new File([blob], `watermarked_${file.name}`, { type: file.type });
            resolve(watermarkedFile);
          } else {
            resolve(file);
          }
        }, file.type, 0.9);
      };

      img.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        resolve(null);
      };

      img.src = objectUrl;
    });
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const selectedFiles = Array.from(e.target.files);
      const processedFiles: File[] = [];
      
      for (const file of selectedFiles) {
        if (!file.type.startsWith('image/')) {
          toast({ title: 'Invalid File', description: `${file.name} is not an image.`, variant: 'destructive' });
          continue;
        }
        
        const processed = await processImage(file);
        if (processed) {
          processedFiles.push(processed);
        }
      }
      
      setFiles(prev => [...prev, ...processedFiles]);
      // Reset input so the same file can be selected again if needed
      e.target.value = '';
    }
  };

  const removeFile = (indexToRemove: number) => {
    setFiles(prev => prev.filter((_, idx) => idx !== indexToRemove));
  };

  const handleUpload = async () => {
    if (!busId || !bus || files.length === 0) return;

    setUploading(true);
    setProgress(0);
    
    try {
      const uploadedUrls: string[] = [];
      const totalFiles = files.length;

      for (let i = 0; i < totalFiles; i++) {
        const file = files[i];
        const url = await dataService.uploadBusImage(busId, file, (fileProgress) => {
           // Calculate total progress across all files
           const currentTotalProgress = ((i * 100) + fileProgress) / totalFiles;
           setProgress(currentTotalProgress);
        });
        uploadedUrls.push(url);
      }

      // Append to existing images
      const existingImages = bus.images || [];
      const newImagesList = [...existingImages, ...uploadedUrls];
      
      await dataService.updateBusImages(busId, newImagesList);
      
      toast({
        title: 'Success',
        description: `Successfully uploaded ${files.length} photo(s).`,
      });
      
      setFiles([]);
      setProgress(100);
      
      // Navigate back after short delay
      setTimeout(() => {
        router.push('/cabin-crew');
      }, 1500);
      
    } catch (error) {
      console.error('Error uploading photos:', error);
      toast({
        title: 'Upload Failed',
        description: 'There was an error uploading the photos. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setUploading(false);
    }
  };

  if (!bus) {
    return (
      <div className="container mx-auto p-4 max-w-md flex justify-center items-center h-64">
        <div className="w-10 h-10 border-4 border-teal-500/20 border-t-teal-500 rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-6 max-w-lg">
      <div className="flex items-center gap-4 mb-6">
        <Button variant="ghost" size="icon" onClick={() => router.back()}>
          <ArrowLeft />
        </Button>
        <div>
          <h1 className="text-2xl font-bold font-headline">Live Photo Update</h1>
          <p className="text-muted-foreground">{bus.travelsName} • {bus.busNumber}</p>
        </div>
      </div>

      <Alert className="mb-6 bg-blue-50 border-blue-200">
        <Info className="h-5 w-5 text-blue-600" />
        <AlertTitle className="text-blue-800 font-bold">Why upload live photos?</AlertTitle>
        <AlertDescription className="text-blue-700 text-sm mt-1">
          <ul className="list-disc pl-4 space-y-1 mt-2">
            <li><strong>Rules:</strong> Images must be taken within the last 24 hours. Old images will be automatically rejected.</li>
            <li><strong>Watermark:</strong> The system will automatically add a trusted time watermark to your photo.</li>
            <li><strong>Impact:</strong> Buses with frequent, high-quality live image updates rank higher in customer searches and get more bookings!</li>
          </ul>
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Camera className="w-5 h-5 text-teal-600" />
            Upload Bus Photos
          </CardTitle>
          <CardDescription>
            Show passengers exactly how the bus looks right now.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          
          <div className="grid grid-cols-2 gap-4">
            <Button 
              type="button"
              variant="outline" 
              className="h-24 flex flex-col gap-2 border-dashed border-2 bg-slate-50 hover:bg-slate-100"
              onClick={() => cameraInputRef.current?.click()}
              disabled={uploading}
            >
              <Camera className="w-8 h-8 text-teal-600" />
              <span className="font-semibold">Take Photo</span>
            </Button>
            
            <Button 
              type="button"
              variant="outline" 
              className="h-24 flex flex-col gap-2 border-dashed border-2 bg-slate-50 hover:bg-slate-100"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
            >
              <ImagePlus className="w-8 h-8 text-blue-600" />
              <span className="font-semibold">Choose File</span>
            </Button>
          </div>

          <input 
            type="file" 
            accept="image/*" 
            capture="environment"
            className="hidden" 
            ref={cameraInputRef}
            onChange={handleFileChange}
          />
          <input 
            type="file" 
            accept="image/*" 
            multiple
            className="hidden" 
            ref={fileInputRef}
            onChange={handleFileChange}
          />

          {files.length > 0 && (
            <div className="bg-slate-50 p-4 rounded-lg border space-y-2">
              <h4 className="text-sm font-medium text-slate-700 flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <ImageIcon className="w-4 h-4" />
                  Selected Photos ({files.length})
                </span>
                <Button variant="ghost" size="sm" onClick={() => setFiles([])} className="h-6 px-2 text-xs text-red-600">Clear All</Button>
              </h4>
              <ul className="text-sm text-slate-500 space-y-2 mt-2">
                {files.map((file, idx) => (
                  <li key={idx} className="flex justify-between items-center bg-white p-2 border rounded">
                    <span className="truncate max-w-[200px]">{file.name}</span>
                    <Button variant="ghost" size="icon" className="h-6 w-6 text-red-500 hover:text-red-700 hover:bg-red-50" onClick={() => removeFile(idx)}>✕</Button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {uploading && (
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Uploading...</span>
                <span>{Math.round(progress)}%</span>
              </div>
              <Progress value={progress} className="h-2" />
            </div>
          )}

        </CardContent>
        <CardFooter>
          <Button 
            className="w-full bg-teal-600 hover:bg-teal-700" 
            onClick={handleUpload}
            disabled={files.length === 0 || uploading}
          >
            {uploading ? 'Uploading...' : 'Upload Photos'}
            {!uploading && <Upload className="w-4 h-4 ml-2" />}
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}

export default function PhotoUpdatePage() {
  return (
    <Suspense fallback={<div className="p-8 text-center">Loading...</div>}>
      <PhotoUpdateContent />
    </Suspense>
  );
}
