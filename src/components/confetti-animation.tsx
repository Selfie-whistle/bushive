'use client';

import React, { useEffect, useRef } from 'react';

interface ConfettiAnimationProps {
  onComplete: () => void;
}

const ConfettiAnimation: React.FC<ConfettiAnimationProps> = ({ onComplete }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const animationFrameId = useRef<number>();

  type ConfettiParticle = {
    x: number;
    y: number;
    w: number;
    h: number;
    color: string;
    tilt: number;
    tiltAngle: number;
    tiltAngleIncrement: number;
    rotation: number;
    rotationSpeed: number;
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    const duration = 3000; // 3 seconds
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    const confettiCount = 120;
    const confetti: ConfettiParticle[] = [];

    for (let i = 0; i < confettiCount; i++) {
        confetti.push({
            x: Math.random() * canvas.width,
            y: Math.random() * -canvas.height, // start above the screen
            w: Math.random() * 8 + 4,
            h: Math.random() * 12 + 6,
            color: `hsl(${Math.random()*360}, 70%, 60%)`,
            tilt: Math.random() * 10 - 10,
            tiltAngle: 0,
            tiltAngleIncrement: Math.random() * 0.07 + 0.05,
            rotation: Math.random() * 2 * Math.PI,
            rotationSpeed: Math.random() * 0.1 - 0.05
        });
    }

    const startTime = performance.now();

    const animate = () => {
      const now = performance.now();
      const elapsed = now - startTime;

      if (elapsed > duration) {
        onComplete();
        return;
      }
      
      const ctx = canvasRef.current?.getContext('2d');
      if (!ctx || !canvasRef.current) {
        onComplete();
        return;
      }
      
      ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);

      confetti.forEach(c => {
        // Confetti motion
        c.tiltAngle += c.tiltAngleIncrement;
        c.y += (c.h / 4); // fall speed
        c.x += Math.sin(c.tiltAngle) * 2;
        c.tilt = Math.sin(c.tiltAngle) * 10;
        c.rotation += c.rotationSpeed;

        // Draw rectangle as confetti
        ctx.save();
        ctx.translate(c.x, c.y);
        ctx.rotate(c.rotation);
        ctx.fillStyle = c.color;
        ctx.fillRect(-c.w/2, -c.h/2, c.w, c.h);
        ctx.restore();
      });

      animationFrameId.current = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      if (animationFrameId.current) {
        cancelAnimationFrame(animationFrameId.current);
      }
    };
  }, [onComplete]);

  return (
    <div className="promo-overlay" ref={overlayRef}>
        <div className="promo-text">PROMO CODE APPLIED</div>
        <canvas ref={canvasRef} className="confetti-container" />
    </div>
  );
};

export default ConfettiAnimation;
