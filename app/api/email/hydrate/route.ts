import { NextRequest, NextResponse } from "next/server"

/**
 * Provider body hydrate (Graph/Gmail) is not used on the SendGrid-only VAAA install.
 * Bodies are stored at send/inbound time.
 */
export async function POST(_request: NextRequest) {
  return NextResponse.json({
    success: true,
    hydrated: false,
    message: "Hydrate is not required for SendGrid accounts",
  })
}
