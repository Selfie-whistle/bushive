
// This file is deprecated and no longer used.
// Routing is now handled client-side with leaflet-routing-machine.
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  return NextResponse.json({ routes: [] });
}
