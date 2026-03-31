
"use client";
import type { Bus } from "@/lib/types";
import { useEffect, useState } from "react";
import { dataService } from "@/lib/data/client-service";
import Image from "next/image";
import { BusImageGallery } from "@/components/bus-image-gallery";
import { ImageIcon } from "lucide-react";

export default function BusesPage() {
  const [allBuses, setAllBuses] = useState<Bus[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchBuses() {
        const busData = await dataService.getBuses();
        setAllBuses(busData);
        setLoading(false);
    }
    fetchBuses();
  }, []);


  if (loading) return <p className="p-6">Loading buses...</p>;

  if (!allBuses.length) return <p className="p-6">No buses found.</p>;

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-2xl font-bold mb-4">🚌 Available Buses ({allBuses.length})</h1>

        <div className="space-y-4">
          {allBuses.map((bus) => (
            <div key={bus.id} className="p-4 border rounded-xl shadow-sm bg-white hover:shadow-md transition flex flex-col md:flex-row gap-4">
              <div className="relative w-full md:w-32 h-32 md:h-auto shrink-0 bg-muted rounded-lg overflow-hidden flex items-center justify-center">
                {(bus.images?.[0] || bus.operatorImages?.[0]) ? (
                  <Image 
                    src={bus.images?.[0] || bus.operatorImages?.[0] || ''} 
                    alt={bus.travelsName}
                    fill
                    className="object-cover"
                  />
                ) : (
                  <ImageIcon className="w-8 h-8 text-muted-foreground/30" />
                )}
              </div>
              <div className="flex-grow">
                <h2 className="text-lg font-semibold text-blue-600">{bus.travelsName}</h2>
                <p className="text-sm">Bus No: {bus.busNumber}</p>
                <p className="text-sm">Operator: {bus.operator}</p>
                <p className="text-sm">Service: {bus.origin} → {bus.destination}</p>
                <p className="text-sm mb-3">Total Seats: {bus.totalSeats}</p>
                
                <div className="border-t pt-3">
                   <p className="text-xs font-bold uppercase text-muted-foreground mb-2">Gallery</p>
                   <BusImageGallery images={bus.images} operatorImages={bus.operatorImages} />
                </div>
              </div>
            </div>
          ))}
        </div>
    </div>
  );
}
