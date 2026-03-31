import { NextResponse } from 'next/server';
import { adminDb, adminAuth } from '@/lib/firebase-admin';
import type { Bus } from '@/lib/types';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ busId: string }> }
) {
  try {
    const { busId } = await params;
    const authHeader = request.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json(
        { success: false, message: 'Unauthorized' },
        { status: 401 }
      );
    }

    const token = authHeader.split('Bearer ')[1];
    const decoded = await adminAuth.verifyIdToken(token);

    const busRef = adminDb.collection('buses').doc(busId);
    const busSnap = await busRef.get();

    if (!busSnap.exists) {
      return NextResponse.json(
        { success: false, message: 'Bus not found' },
        { status: 404 }
      );
    }

    const busData = busSnap.data() as Bus;
    if (busData.cabinCrewId !== decoded.email) {
      return NextResponse.json(
        { success: false, message: 'Forbidden' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { lat, lng, heading, speed, accuracy, timestamp } = body;

    if (lat === null || lng === null) {
      await busRef.set(
        { liveLocation: null, locationName: null, lastUpdatedAt: Date.now() },
        { merge: true }
      );
      return NextResponse.json({ success: true });
    }

    if (typeof lat !== 'number' || typeof lng !== 'number') {
      return NextResponse.json(
        { success: false, message: 'Invalid coordinates' },
        { status: 400 }
      );
    }

    const safeHeading = typeof heading === 'number' && !Number.isNaN(heading)
        ? Math.round(heading)
        : null;

    await busRef.set(
      {
        liveLocation: {
          lat,
          lng,
          heading: safeHeading,
          speed: typeof speed === 'number' ? speed : null,
          accuracy: typeof accuracy === 'number' ? accuracy : null,
          timestamp: timestamp ?? Date.now(),
        },
        lastUpdatedAt: Date.now(),
      },
      { merge: true }
    );

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Live tracking error:', error);
    if (error.code === 'auth/id-token-expired') {
        return NextResponse.json({ success: false, message: 'Authentication token expired. Please log in again.'}, { status: 401 });
    }
    return NextResponse.json(
      { success: false, message: 'Internal server error' },
      { status: 500 }
    );
  }
}
