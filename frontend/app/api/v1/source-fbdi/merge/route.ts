import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 300; // 5 minutes timeout

export async function POST(req: NextRequest) {
  try {
    const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://backend:8000';
    let formData: FormData | undefined;
    try {
      formData = await req.formData();
    } catch {
      formData = new FormData();
    }

    const backendRes = await fetch(`${backendUrl}/api/v1/source-fbdi/merge`, {
      method: 'POST',
      body: formData,
    });

    if (!backendRes.ok) {
      const errText = await backendRes.text();
      return new NextResponse(errText, {
        status: backendRes.status,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const data = await backendRes.json();
    return NextResponse.json(data);
  } catch (error: any) {
    console.error('API Route /api/v1/source-fbdi/merge error:', error);
    return NextResponse.json(
      { detail: error.message || 'Error occurred while running merge' },
      { status: 500 }
    );
  }
}
