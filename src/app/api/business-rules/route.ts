import { NextRequest, NextResponse } from 'next/server';

const BACKEND_URL = 'http://localhost:8888/labamap/api/v1/ecommerce/business-rules';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);

    // Don't filter by enabled status - we want to see both enabled and disabled rules
    // Remove 'enabled' parameter if it exists to get all rules
    searchParams.delete('enabled');

    const queryString = searchParams.toString();
    const url = queryString ? `${BACKEND_URL}?${queryString}` : BACKEND_URL;

    const response = await fetch(url);
    const data = await response.json();

    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      { success: false, error: 'Failed to fetch business rules' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const response = await fetch(BACKEND_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: 'Failed to create business rule' },
      { status: 500 }
    );
  }
}
