'use client'

import { useEffect } from 'react'
import { initRecordingRetryService } from '@/lib/recording-retry-service'

/**
 * Client component that initializes the recording retry service on mount.
 * Add this to the dashboard layout to ensure pending uploads are retried.
 */
export function RecordingRetryInit() {
  useEffect(() => {
    initRecordingRetryService()
  }, [])

  // This component renders nothing - it just initializes the service
  return null
}
