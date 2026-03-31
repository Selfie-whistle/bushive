'use client';

import React, { useState } from 'react';
import Image from 'next/image';
import { X } from 'lucide-react';

/**
 * User-facing horizontal image gallery for bus & operator photos.
 * Used on search results / bus detail pages.
 */
export function BusImageGallery({
  images = [],
  operatorImages = [],
}: {
  images?: string[];
  operatorImages?: string[];
}) {
  const [lightbox, setLightbox] = useState<string | null>(null);
  const all = [...(images || []), ...(operatorImages || [])];
  
  console.log('BusImageGallery debug:', { 
    imagesCount: images?.length, 
    operatorImagesCount: operatorImages?.length,
    totalImages: all.length,
    urls: all
  });

  if (all.length === 0) return null;

  return (
    <>
      {/* Horizontal scroll strip */}
      <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide">
        {all.map((url, i) => (
          <button
            key={i}
            onClick={() => setLightbox(url)}
            className="relative flex-shrink-0 w-40 h-28 rounded-xl overflow-hidden border border-gray-200 shadow-sm hover:scale-105 transition-transform"
          >
            <Image
              src={url}
              alt={`Bus image ${i + 1}`}
              fill
              className="object-cover"
              sizes="160px"
            />
          </button>
        ))}
      </div>

      {/* Lightbox */}
      {lightbox && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
          onClick={() => setLightbox(null)}
        >
          <button
            onClick={() => setLightbox(null)}
            className="absolute top-4 right-4 text-white bg-black/50 rounded-full p-1"
          >
            <X className="h-6 w-6" />
          </button>
          <div
            className="relative max-w-3xl w-full aspect-video rounded-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <Image
              src={lightbox}
              alt="Bus image"
              fill
              className="object-contain"
            />
          </div>
        </div>
      )}
    </>
  );
}
