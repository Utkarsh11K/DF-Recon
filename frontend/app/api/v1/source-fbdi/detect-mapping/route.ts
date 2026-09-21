import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  try {
    const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || '';
    let formData: FormData | undefined;
    try {
      formData = await req.formData();
    } catch {
      formData = new FormData();
    }

    const backendRes = await fetch(`${backendUrl}/api/v1/source-fbdi/detect-mapping`, {
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
    console.error('API Route /api/v1/source-fbdi/detect-mapping error:', error);
    return NextResponse.json(
      { detail: error.message || 'Error detecting mappings' },
      { status: 500 }
    );
  }
}
