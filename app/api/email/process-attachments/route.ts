import { NextRequest, NextResponse } from "next/server"

/**
 * Attachment AI processing is a sales-CRM Nimbus feature.
 * VAAA stores attachments via inbound/send paths; deep analysis is not enabled.
 */
export async function POST(_request: NextRequest) {
  return NextResponse.json({
    success: true,
    processed: 0,
    skipped: true,
    message: "Attachment AI processing is not enabled for Voice Alchemy Academy",
  })
}
