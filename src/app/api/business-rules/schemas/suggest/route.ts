import { NextRequest, NextResponse } from 'next/server';

const BACKEND_URL = 'http://localhost:8888/labamap/api/v1/ecommerce/business-rules/schemas/suggest';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const ruleType = searchParams.get('ruleType');
    const purpose = searchParams.get('purpose');

    if (!ruleType) {
      return NextResponse.json(
        { success: false, error: 'ruleType parameter is required' },
        { status: 400 }
      );
    }

    // Build query string
    const params = new URLSearchParams({ ruleType });
    if (purpose) {
      params.append('purpose', purpose);
    }

    const url = `${BACKEND_URL}?${params.toString()}`;
    console.log('[Suggest API] Calling backend:', url);

    const response = await fetch(url);
    const data = await response.json();

    console.log('[Suggest API] Backend response:', data.success ? 'success' : 'failed');

    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error('[Suggest API] Error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to get schema suggestion' },
      { status: 500 }
    );
  }
}
