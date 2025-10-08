/**
 * Rules Statistics API Endpoint
 * Provides rule execution statistics and monitoring data
 */

import { NextRequest, NextResponse } from 'next/server';
import { rulesEngine } from '@/services/RulesEngineService';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const ruleId = searchParams.get('ruleId');
    
    const stats = rulesEngine.getRuleStats(ruleId || undefined);
    
    return NextResponse.json({
      stats,
      count: stats.length,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('[API] Rules stats error:', error);
    return NextResponse.json(
      { 
        error: 'Failed to retrieve rule statistics',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const ruleId = searchParams.get('ruleId');
    
    // Reset statistics
    rulesEngine.getRuleStats(); // This triggers the monitor's resetStats method
    
    return NextResponse.json({
      message: ruleId 
        ? `Statistics reset for rule: ${ruleId}`
        : 'All rule statistics reset',
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('[API] Rules stats reset error:', error);
    return NextResponse.json(
      { 
        error: 'Failed to reset rule statistics',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}