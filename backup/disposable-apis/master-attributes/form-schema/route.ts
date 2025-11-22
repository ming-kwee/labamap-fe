/**
 * Dynamic Form Schema Generation API
 * Generates form schemas based on business-controlled master attributes
 */

import { NextRequest, NextResponse } from 'next/server';
import { FormSchemaGenerator } from '@/services/FormSchemaGenerator';
import { FormGenerationContext, DynamicFormSchema } from '@/types/dynamicForm';

const formSchemaGenerator = new FormSchemaGenerator();

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { context } = body;

    if (!context) {
      return NextResponse.json(
        { error: 'Form generation context is required' },
        { status: 400 }
      );
    }

    // Create form generation context
    const formContext: FormGenerationContext = {
      userId: context.userId || 'anonymous',
      organizationId: context.organizationId || 'default',
      userRole: context.userRole || 'BUSINESS_USER',
      targetChannels: context.targetChannels || [],
      productCategory: context.productCategory,
      permissions: context.permissions || [],
      requestId: crypto.randomUUID(),
      timestamp: Date.now()
    };

    console.log('[API] Form schema generation - context:', formContext);
    
    // Generate dynamic form schema
    const schema: DynamicFormSchema = await formSchemaGenerator.generateSchema(formContext);
    
    console.log('[API] Generated schema with', schema.fields.length, 'fields');
    console.log('[API] Conditional fields:', schema.fields.filter(f => f.conditionalVisibility).map(f => ({
      name: f.fieldName,
      showWhen: f.conditionalVisibility?.showWhen
    })));

    return NextResponse.json({
      success: true,
      formSchema: schema,
      metadata: {
        generatedAt: new Date().toISOString(),
        generatedFor: formContext,
        schemaVersion: '1.0.0'
      }
    });

  } catch (error) {
    console.error('[API] Form schema generation error:', error);
    return NextResponse.json(
      { 
        error: 'Failed to generate form schema',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId') || 'anonymous';
    const organizationId = searchParams.get('organizationId') || 'default';
    const userRole = searchParams.get('userRole') || 'BUSINESS_USER';
    const category = searchParams.get('category') || undefined;
    const channels = searchParams.get('channels')?.split(',') || [];

    const formContext: FormGenerationContext = {
      userId,
      organizationId,
      userRole: userRole as 'BUSINESS_USER' | 'ADMIN_USER' | 'DEVELOPER' | 'VIEW_ONLY',
      targetChannels: channels,
      productCategory: category,
      permissions: [],
      requestId: crypto.randomUUID(),
      timestamp: Date.now()
    };

    const schema: DynamicFormSchema = await formSchemaGenerator.generateSchema(formContext);

    return NextResponse.json({
      success: true,
      formSchema: schema,
      metadata: {
        generatedAt: new Date().toISOString(),
        generatedFor: formContext,
        schemaVersion: '1.0.0'
      }
    });

  } catch (error) {
    console.error('[API] Form schema generation error:', error);
    return NextResponse.json(
      { 
        error: 'Failed to generate form schema',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}