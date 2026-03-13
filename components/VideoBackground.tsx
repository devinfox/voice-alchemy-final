'use client'

import { useEffect, useRef, useState } from 'react'

export function VideoBackground() {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [isLoaded, setIsLoaded] = useState(false)

  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    video.oncanplay = () => {
      setIsLoaded(true)
      video.play().catch(console.error)
    }

    video.load()
  }, [])

  return (
    <>
      {/* Fixed container for video background */}
      <div
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          zIndex: 0,
          overflow: 'hidden',
        }}
      >
        {/* Static fallback image */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            backgroundImage: 'url(/homepage/still.png)',
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            backgroundRepeat: 'no-repeat',
          }}
        />

        {/* Video - fades in when loaded */}
        <video
          ref={videoRef}
          autoPlay
          muted
          loop
          playsInline
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            opacity: isLoaded ? 1 : 0,
            transition: 'opacity 1.5s ease-in-out',
          }}
        >
          <source src="/homepage/video-optimized.mp4" type="video/mp4" />
        </video>

        {/* Overlay gradient for readability */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            background: `
              linear-gradient(rgba(255, 255, 255, 0.015) 1px, transparent 1px),
              linear-gradient(90deg, rgba(255, 255, 255, 0.015) 1px, transparent 1px),
              radial-gradient(ellipse 80% 60% at 50% 0%, rgba(99, 60, 150, 0.25) 0%, transparent 50%),
              radial-gradient(ellipse 60% 50% at 80% 50%, rgba(206, 180, 102, 0.12) 0%, transparent 50%),
              linear-gradient(180deg,
                rgba(23, 18, 41, 0.75) 0%,
                rgba(23, 18, 41, 0.6) 30%,
                rgba(23, 18, 41, 0.7) 70%,
                rgba(23, 18, 41, 0.85) 100%
              )
            `,
            backgroundSize: '60px 60px, 60px 60px, 100% 100%, 100% 100%, 100% 100%',
            pointerEvents: 'none',
          }}
        />
      </div>
    </>
  )
}
