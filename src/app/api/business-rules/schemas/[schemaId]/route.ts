import { NextRequest, NextResponse } from 'next/server';

const BACKEND_URL = 'http://localhost:8888/labamap/api/v1/ecommerce/business-rules/schemas';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ schemaId: string }> }
) {
  try {
    const { schemaId } = await params;
    const response = await fetch(`${BACKEND_URL}/${schemaId}`);
    const data = await response.json();

    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      { success: false, error: 'Failed to fetch schema' },
      { status: 500 }
    );
  }
}
