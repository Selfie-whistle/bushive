
'use server';

// This file is no longer the primary source of truth for locations on the client.
// The data is now fetched directly on the client via the dataService.
// This file can be kept for server-side utilities or removed if not needed.

export const uniqueOrigins: string[] = [];
export const uniqueDestinations: string[] = [];
