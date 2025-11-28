import { NextRequest, NextResponse } from 'next/server';

const BACKEND_URL = 'http://localhost:8888/labamap/api/v1/ecommerce/business-rules/schemas';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const queryString = searchParams.toString();
    const url = queryString ? `${BACKEND_URL}?${queryString}` : BACKEND_URL;

    const response = await fetch(url);
    const data = await response.json();

    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      { success: false, error: 'Failed to fetch configuration schemas' },
      { status: 500 }
    );
  }
}
