"use client"

import { cn } from "@/lib/utils"

type SeatStatus = "available" | "male" | "female" | "sold" | "selected"

type Seat = {
  id: string
  status: SeatStatus
  price?: number
}

const lower = {
  single: [
    { id: "L1", status: "sold" },
    { id: "L4", status: "male" },
  ],
  double: [
    [
      { id: "L3", status: "available", price: 1400 },
      { id: "L6", status: "available", price: 1400 },
    ],
    [
      { id: "L2", status: "available", price: 1400 },
      { id: "L5", status: "available", price: 1400 },
    ],
  ],
}

const upper = {
  single: [
    { id: "U1", status: "sold" },
    { id: "U4", status: "female" },
  ],
  double: [
    [
      { id: "U3", status: "available", price: 1500 },
      { id: "U6", status: "sold" },
    ],
    [
      { id: "U2", status: "available", price: 1500 },
      { id: "U5", status: "sold" },
    ],
  ],
}

export function HorizontalSleeperLayout() {
  return (
    <div className="bg-slate-50 rounded-xl p-6">
      <h2 className="text-lg font-semibold mb-6">Seat Layout</h2>

      <div className="grid grid-cols-2 gap-12">
        <Berth title="Lower Berth" data={lower} />
        <Berth title="Upper Berth" data={upper} />
      </div>
    </div>
  )
}

function Berth({
  title,
  data,
}: {
  title: string
  data: {
    single: Seat[]
    double: Seat[][]
  }
}) {
  return (
    <div>
      <h3 className="text-sm font-semibold mb-4">{title}</h3>

      <div className="flex gap-8">
        {/* SINGLE BERTH COLUMN */}
        <div className="flex flex-col gap-4">
          {data.single.map((seat) => (
            <SeatBox key={seat.id} seat={seat} />
          ))}
        </div>

        {/* DOUBLE BERTH COLUMN */}
        <div className="flex flex-col gap-4">
          {data.double.map((row, i) => (
            <div key={i} className="flex gap-3">
              {row.map((seat) => (
                <SeatBox key={seat.id} seat={seat} />
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function SeatBox({ seat }: { seat: Seat }) {
  return (
    <div className="text-center">
      <div
        className={cn(
          "w-14 h-10 rounded-md border-2 flex items-center justify-center text-xs font-semibold",
          seatColor(seat.status)
        )}
      >
        {seat.id}
      </div>

      {seat.price && seat.status === "available" && (
        <p className="text-[11px] mt-1 text-muted-foreground">₹{seat.price}</p>
      )}

      {seat.status !== "available" && (
        <p className="text-[11px] mt-1 text-gray-400">Sold</p>
      )}
    </div>
  )
}

function seatColor(status: SeatStatus) {
  switch (status) {
    case "available":
      return "bg-white border-green-600"
    case "male":
      return "bg-blue-500 border-blue-500 text-white"
    case "female":
      return "bg-pink-500 border-pink-500 text-white"
    case "selected":
      return "bg-red-600 border-red-600 text-white"
    case "sold":
      return "bg-gray-200 border-gray-300 text-gray-500"
  }
}
