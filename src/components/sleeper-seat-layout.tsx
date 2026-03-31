"use client"

import { cn } from "@/lib/utils"

type SeatStatus = "available" | "male" | "female" | "sold" | "selected"

type Seat = {
  id: string
  status: SeatStatus
  price?: number
}

const lower: Seat[][] = [
  [{ id: "L1", status: "sold" }, { id: "L2", status: "available", price: 1400 }, { id: "L3", status: "available", price: 1400 }],
  [{ id: "L4", status: "male" }, { id: "L5", status: "available", price: 1400 }, { id: "L6", status: "available", price: 1400 }],
  [{ id: "L7", status: "female" }, { id: "L8", status: "available", price: 1400 }, { id: "L9", status: "sold" }],
]

const upper: Seat[][] = [
  [{ id: "U1", status: "sold" }, { id: "U2", status: "available", price: 1500 }, { id: "U3", status: "available", price: 1500 }],
  [{ id: "U4", status: "female" }, { id: "U5", status: "sold" }, { id: "U6", status: "sold" }],
  [{ id: "U7", status: "sold" }, { id: "U8", status: "sold" }, { id: "U9", status: "sold" }],
]

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

function Berth({ title, data }: { title: string; data: Seat[][] }) {
  return (
    <div>
      <h3 className="text-sm font-semibold mb-4">{title}</h3>

      <div className="space-y-4">
        {data.map((row, i) => (
          <div key={i} className="flex items-center gap-6">

            {/* Single berth */}
            <SeatBox seat={row[0]} single />

            {/* Double berth */}
            <div className="flex gap-2">
              <SeatBox seat={row[1]} />
              <SeatBox seat={row[2]} />
            </div>

          </div>
        ))}
      </div>
    </div>
  )
}

function SeatBox({ seat, single }: { seat: Seat; single?: boolean }) {
  return (
    <div className="text-center">
      <div
        className={cn(
          "rounded-lg border-2 flex items-center justify-center text-xs font-semibold",
          single ? "w-20 h-10" : "w-16 h-10",
          seatColor(seat.status)
        )}
      >
        {seat.id}
      </div>

      {seat.price && seat.status === "available" && (
        <p className="text-xs mt-1 text-muted-foreground">₹{seat.price}</p>
      )}

      {seat.status !== "available" && (
        <p className="text-xs mt-1 text-gray-400">Sold</p>
      )}
    </div>
  )
}

function seatColor(status: SeatStatus) {
  switch (status) {
    case "available":
      return "border-green-600 bg-white"
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
