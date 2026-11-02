import React, { useState, useEffect } from 'react';
import { motion, useMotionValue, useTransform, useAnimation } from 'framer-motion';
import { ChevronRight, Check, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SlideToBoardProps {
  onComplete: () => Promise<void> | void;
  text?: string;
  completedText?: string;
  className?: string;
}

export function SlideToBoard({ onComplete, text = "Slide to Board", completedText = "Boarded", className }: SlideToBoardProps) {
  const [isLoading, setIsLoading] = useState(false);
  const containerRef = React.useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(150);
  
  const x = useMotionValue(0);
  const controls = useAnimation();

  useEffect(() => {
    if (containerRef.current) {
      setContainerWidth(containerRef.current.offsetWidth);
    }
  }, []);

  const handleDragEnd = async (event: any, info: any) => {
    if (isLoading) return; // Prevent drag while loading
    
    // If dragged more than 70% of the way, complete it
    const threshold = containerWidth * 0.7;
    if (info.offset.x > threshold) {
      await controls.start({ x: containerWidth - 40 /* button width */, transition: { duration: 0.2 } });
      setIsLoading(true);
      try {
        await onComplete();
      } catch (error) {
         // If it fails, snap back
         setIsLoading(false);
         controls.start({ x: 0, transition: { type: 'spring', stiffness: 300, damping: 20 } });
      }
      // Note: We don't need to manually show "Boarded" because the parent will re-render and unmount this component 
      // when the backend updates `passenger.boarded`.
    } else {
      // Snap back
      controls.start({ x: 0, transition: { type: 'spring', stiffness: 300, damping: 20 } });
    }
  };

  // Change background color opacity as it slides
  const bgOpacity = useTransform(x, [0, containerWidth - 40], [1, 0]);
  const textOpacity = useTransform(x, [0, containerWidth / 3], [1, 0]);

  if (isLoading) {
    return (
      <div 
        className={cn("relative h-10 w-40 bg-gray-100 rounded-full overflow-hidden flex items-center justify-center border border-gray-200 shadow-inner", className)}
      >
        <Loader2 className="w-5 h-5 text-green-600 animate-spin" />
        <span className="text-sm font-bold text-gray-500 ml-2">Loading...</span>
      </div>
    );
  }

  return (
    <div 
      ref={containerRef}
      className={cn("relative h-10 w-40 bg-green-50 rounded-full overflow-hidden flex items-center justify-start border border-green-200 shadow-inner group", className)}
    >
      {/* Live shimmer effect across the track */}
      <motion.div 
        animate={{ x: ['-100%', '300%'] }}
        transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
        className="absolute top-0 bottom-0 w-1/2 bg-gradient-to-r from-transparent via-green-200/50 to-transparent skew-x-12 pointer-events-none"
      />

      <motion.div style={{ opacity: textOpacity }} className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <span className="text-xs font-bold text-green-700 ml-4">{text}</span>
      </motion.div>
      
      <motion.div
        style={{ opacity: bgOpacity }}
        className="absolute inset-0 bg-green-100/50 pointer-events-none"
      />

      <motion.div
        drag="x"
        dragConstraints={{ left: 0, right: containerWidth - 40 }}
        dragElastic={0.1}
        onDragEnd={handleDragEnd}
        animate={controls}
        style={{ x }}
        className="h-10 w-10 bg-green-600 rounded-full flex items-center justify-center cursor-grab active:cursor-grabbing shadow-[0_0_10px_rgba(22,163,74,0.5)] z-10 hover:bg-green-700 transition-colors"
      >
        <motion.div
            animate={{ x: [0, 3, 0] }}
            transition={{ duration: 1.5, repeat: Infinity }}
        >
            <ChevronRight className="w-5 h-5 text-white" />
        </motion.div>
      </motion.div>
    </div>
  );
}
