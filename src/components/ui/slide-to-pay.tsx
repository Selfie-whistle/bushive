'use client';

import React, { useState, useRef, useEffect } from 'react';
import { motion, useAnimation, useMotionValue, useTransform } from 'framer-motion';
import { ArrowRight, Check } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SlideToPayProps {
  onSuccess: () => void;
  disabled?: boolean;
  text?: string;
  successText?: string;
}

export function SlideToPay({
  onSuccess,
  disabled = false,
  text = 'Slide to Pay',
  successText = 'Processing...',
}: SlideToPayProps) {
  const [isSuccess, setIsSuccess] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const dragX = useMotionValue(0);
  const controls = useAnimation();

  const handleWidth = () => {
    if (containerRef.current) {
      setContainerWidth(containerRef.current.offsetWidth);
    }
  };

  useEffect(() => {
    handleWidth();
    window.addEventListener('resize', handleWidth);
    
    // Give it a small delay and re-check width to ensure layout is done
    const timeoutId = setTimeout(handleWidth, 100);
    return () => {
        window.removeEventListener('resize', handleWidth);
        clearTimeout(timeoutId);
    }
  }, []);

  const slideThreshold = Math.max(0, containerWidth - 56); // 56 is approx the width of the thumb + padding

  const handleDragEnd = async (event: any, info: any) => {
    if (disabled || isSuccess) return;

    if (info.offset.x >= slideThreshold * 0.75) {
      setIsSuccess(true);
      controls.start({ x: slideThreshold });
      onSuccess();
    } else {
      controls.start({ x: 0 });
    }
  };

  const bgOpacity = useTransform(dragX, [0, slideThreshold], [0, 1]);
  const textOpacity = useTransform(dragX, [0, slideThreshold / 2], [1, 0]);

  return (
    <div
      ref={containerRef}
      className={cn(
        "relative flex items-center h-14 w-full md:w-80 rounded-full overflow-hidden bg-indigo-50 border border-indigo-100 select-none shadow-inner",
        disabled && "opacity-50 cursor-not-allowed"
      )}
    >
      {/* Background gradient that fills up as you slide */}
      <motion.div 
        className="absolute inset-0 bg-gradient-to-r from-indigo-500 to-purple-600"
        style={{ opacity: bgOpacity }}
      />
      
      {/* Success Text */}
      <div className={cn(
        "absolute inset-0 flex items-center justify-center font-bold text-white transition-opacity duration-300",
        isSuccess ? "opacity-100" : "opacity-0"
      )}>
        <Check className="w-5 h-5 mr-2" />
        {successText}
      </div>

      {/* Default Text */}
      <motion.div 
        className="absolute inset-0 flex items-center justify-center font-bold text-indigo-600 pointer-events-none"
        style={{ opacity: isSuccess ? 0 : textOpacity }}
      >
        <span className="ml-8 uppercase tracking-widest text-sm">{text}</span>
        
        {/* Animated Arrows */}
        <div className="flex ml-2 opacity-60">
           <motion.div animate={{ x: [0, 4, 0], opacity: [0.3, 1, 0.3] }} transition={{ repeat: Infinity, duration: 1.5, delay: 0 }}>
              <ArrowRight className="w-4 h-4" />
           </motion.div>
           <motion.div animate={{ x: [0, 4, 0], opacity: [0.3, 1, 0.3] }} transition={{ repeat: Infinity, duration: 1.5, delay: 0.2 }} className="-ml-2">
              <ArrowRight className="w-4 h-4" />
           </motion.div>
           <motion.div animate={{ x: [0, 4, 0], opacity: [0.3, 1, 0.3] }} transition={{ repeat: Infinity, duration: 1.5, delay: 0.4 }} className="-ml-2">
              <ArrowRight className="w-4 h-4" />
           </motion.div>
        </div>
      </motion.div>

      {/* Sliding Thumb */}
      <motion.div
        drag={disabled || isSuccess ? false : "x"}
        dragConstraints={{ left: 0, right: slideThreshold > 0 ? slideThreshold : 0 }}
        dragElastic={0.05}
        dragMomentum={false}
        onDragEnd={handleDragEnd}
        animate={controls}
        style={{ x: dragX }}
        className={cn(
            "absolute left-1 top-1 bottom-1 w-12 bg-white rounded-full shadow-[0_3px_8px_rgba(0,0,0,0.15)] flex items-center justify-center z-10 transition-colors duration-300",
            disabled ? "cursor-not-allowed" : "cursor-grab active:cursor-grabbing",
            isSuccess && "bg-transparent shadow-none"
        )}
      >
        {isSuccess ? (
            <div className="w-10 h-10 bg-white rounded-full flex items-center justify-center shadow-sm">
                <Check className="w-5 h-5 text-purple-600" />
            </div>
        ) : (
            <ArrowRight className="w-5 h-5 text-indigo-600" />
        )}
      </motion.div>
    </div>
  );
}
