import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://backend:8000';
    const backendRes = await fetch(`${backendUrl}/api/v1/source-fbdi/download`);

    if (!backendRes.ok) {
      return new NextResponse('File not found', { status: backendRes.status });
    }

    const blob = await backendRes.blob();
    return new NextResponse(blob, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': 'attachment; filename="merged_source_fbdi.xlsx"',
      },
    });
  } catch (error: any) {
    console.error('API Route /api/v1/source-fbdi/download error:', error);
    return NextResponse.json({ detail: error.message || 'Download error' }, { status: 500 });
  }
}
