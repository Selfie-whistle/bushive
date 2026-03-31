
'use client';

import { useEffect, useState, useCallback } from "react";
import { dataService } from "@/lib/data/client-service";
import type { Schedule } from "@/lib/types";

export function useSchedule(scheduleId: string | undefined) {
  const [schedule, setSchedule] = useState<Schedule | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
      if (!scheduleId) {
          setSchedule(null);
          setIsLoading(false);
          return;
      }
      setIsLoading(true);
      try {
        const scheduleData = await dataService.getSchedule(scheduleId);
        setSchedule(scheduleData || null);
      } catch (error) {
        console.error("Failed to fetch schedule:", error);
        setSchedule(null);
      } finally {
        setIsLoading(false);
      }
  }, [scheduleId]);

  useEffect(() => {
    if (!scheduleId) {
        setSchedule(null);
        setIsLoading(false);
        return;
    }
    
    setIsLoading(true);
    
    const unsubscribe = dataService.onScheduleSnapshot(scheduleId, (newSchedule) => {
        setSchedule(newSchedule);
        setIsLoading(false);
    });

    return () => unsubscribe();
  }, [scheduleId]);
  
  return { schedule, isLoading, refresh };
}
