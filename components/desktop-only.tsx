'use client'

import { useState, useEffect, ReactNode } from 'react'
import { Monitor, Smartphone } from 'lucide-react'

interface DesktopOnlyProps {
  children: ReactNode
  featureName: string
}

export function DesktopOnly({ children, featureName }: DesktopOnlyProps) {
  const [isMobile, setIsMobile] = useState(false)
  const [isChecked, setIsChecked] = useState(false)

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768)
      setIsChecked(true)
    }

    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  // Don't render anything until we've checked
  if (!isChecked) {
    return null
  }

  if (isMobile) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center p-6">
        <div className="glass-card p-8 max-w-md text-center">
          <div className="w-16 h-16 rounded-2xl bg-yellow-500/20 flex items-center justify-center mx-auto mb-6">
            <Monitor className="w-8 h-8 text-yellow-400" />
          </div>
          <h2 className="text-xl font-bold text-white mb-3">Desktop Required</h2>
          <p className="text-gray-400 mb-6">
            The <span className="text-yellow-400 font-medium">{featureName}</span> feature requires a larger screen for the best experience. Please access this page from a desktop or tablet device.
          </p>
          <div className="flex items-center justify-center gap-2 text-sm text-gray-500">
            <Smartphone className="w-4 h-4" />
            <span>Mobile device detected</span>
          </div>
        </div>
      </div>
    )
  }

  return <>{children}</>
}
