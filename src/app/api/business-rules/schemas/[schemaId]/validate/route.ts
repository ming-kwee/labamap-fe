import { NextRequest, NextResponse } from 'next/server';

const BACKEND_URL = 'http://localhost:8888/labamap/api/v1/ecommerce/business-rules/schemas';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ schemaId: string }> }
) {
  try {
    const { schemaId } = await params;
    const body = await request.json();

    const response = await fetch(`${BACKEND_URL}/${schemaId}/validate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    return NextResponse.json(
      { valid: false, errors: ['Failed to validate configuration'], warnings: [], message: 'Validation service unavailable' },
      { status: 500 }
    );
  }
}
