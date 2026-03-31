"use client"

import * as React from "react"
import { DayPicker } from "react-day-picker"
import { ChevronLeft, ChevronRight } from "lucide-react"
import "react-day-picker/dist/style.css"

export function Calendar(
  props: React.ComponentProps<typeof DayPicker>
) {
  return (
    <div style={{ width: 360 }}>
      <DayPicker
        {...props}
        showOutsideDays
        styles={{
          table: {
            width: "100%",
            borderCollapse: "collapse",
            display: "grid",
            gridTemplateColumns: "repeat(7, 1fr)",
          },
          head_row: {
            display: "contents",
          },
          head_cell: {
            textAlign: "center",
            fontSize: 12,
            fontWeight: 500,
            color: "#6b7280",
            marginBottom: 6,
          },
          row: {
            display: "contents",
          },
          cell: {
            display: "flex",
            justifyContent: "center",
            padding: 4,
          },
        }}
        className="bg-white rounded-xl p-4 text-sm shadow-lg"
        classNames={{
          caption: "relative flex justify-center items-center mb-2",
          caption_label: "text-base font-semibold",
          nav: "absolute right-2 flex gap-2",
          nav_button:
            "h-8 w-8 rounded-full hover:bg-gray-100 flex items-center justify-center",
          day: "h-11 w-11 rounded-lg hover:bg-gray-100",
          day_selected:
            "bg-red-600 text-white hover:bg-red-600",
          day_today:
            "ring-2 ring-red-600 ring-offset-2",
          day_disabled:
            "text-gray-300 cursor-not-allowed",
          day_outside:
            "text-gray-400 opacity-50",
        }}
        components={{
          IconLeft: () => <ChevronLeft className="h-4 w-4" />,
          IconRight: () => <ChevronRight className="h-4 w-4" />,
        }}
      />
    </div>
  )
}
