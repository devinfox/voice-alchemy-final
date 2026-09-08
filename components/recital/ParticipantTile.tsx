'use client'

import { useState } from 'react'
import { Hand, MicOff, MoreHorizontal, VideoOff, Star, UserX, Volume2 } from 'lucide-react'
import type { RecitalPresence } from '@/lib/recital/protocol'
import type { PeerConnectionStatus } from '@/lib/recital/mesh'
import { VideoSurface } from './VideoSurface'

interface ParticipantTileProps {
  participant: RecitalPresence
  stream: MediaStream | null
  isLocal?: boolean
  isSpotlight?: boolean
  connection?: PeerConnectionStatus
  showHostMenu?: boolean
  onMute?: () => void
  onRemove?: () => void
  onLowerHand?: () => void
  onPutOnStage?: () => void
  className?: string
}

function initials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase())
    .join('')
}

export function ParticipantTile({
  participant,
  stream,
  isLocal = false,
  isSpotlight = false,
  connection,
  showHostMenu = false,
  onMute,
  onRemove,
  onLowerHand,
  onPutOnStage,
  className = '',
}: ParticipantTileProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const hasVideo = !!stream && stream.getVideoTracks().some((t) => t.readyState === 'live' && !t.muted) && !participant.isVideoOff
  const connecting = !isLocal && connection && connection !== 'connected'
  const dotColor =
    participant.net === 'bad' ? 'bg-red-400' : participant.net === 'warning' ? 'bg-amber-400' : participant.net === 'good' ? 'bg-emerald-400' : 'bg-gray-500'

  return (
    <div
      className={`relative overflow-hidden rounded-2xl bg-[#120d24] border ${
        isSpotlight ? 'border-[#CEB466]/60 shadow-[0_0_40px_rgba(206,180,102,0.15)]' : 'border-white/10'
      } ${className}`}
    >
      {hasVideo ? (
        <VideoSurface stream={stream} mirror={isLocal} className="absolute inset-0 w-full h-full" fit={isSpotlight ? 'contain' : 'cover'} />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-[#1f1839] to-[#0f0b1e]">
          <div
            className={`${isSpotlight ? 'w-28 h-28 text-4xl' : 'w-12 h-12 text-sm'} rounded-full bg-[#CEB466]/20 border border-[#CEB466]/40 text-[#e0c97d] font-semibold flex items-center justify-center`}
          >
            {initials(participant.name) || '♪'}
          </div>
        </div>
      )}

      {connecting && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/40 text-xs text-gray-300">Connecting…</div>
      )}

      {/* Name bar */}
      <div className="absolute bottom-0 inset-x-0 flex items-center gap-1.5 px-2 py-1.5 bg-gradient-to-t from-black/70 to-transparent">
        <span className={`inline-block w-1.5 h-1.5 rounded-full ${dotColor}`} title="Connection" />
        <span className={`truncate ${isSpotlight ? 'text-sm' : 'text-xs'} text-white`}>
          {participant.name}
          {isLocal && ' (you)'}
        </span>
        {participant.role === 'host' && <span className="text-[10px] text-[#CEB466] font-medium">Host</span>}
        <span className="ml-auto flex items-center gap-1">
          {participant.clipping && <Volume2 className="w-3.5 h-3.5 text-amber-400" aria-label="Too close to the mic" />}
          {participant.handRaised && <Hand className="w-3.5 h-3.5 text-[#CEB466]" aria-label="Hand raised" />}
          {participant.isMuted && <MicOff className="w-3.5 h-3.5 text-gray-300" aria-label="Muted" />}
          {participant.isVideoOff && <VideoOff className="w-3.5 h-3.5 text-gray-300" aria-label="Camera off" />}
        </span>
      </div>

      {showHostMenu && !isLocal && (
        <div className="absolute top-1.5 right-1.5">
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            className="rounded-md bg-black/50 p-1 text-gray-200 hover:bg-black/70"
            aria-label={`Options for ${participant.name}`}
          >
            <MoreHorizontal className="w-4 h-4" />
          </button>
          {menuOpen && (
            <div className="absolute right-0 mt-1 w-44 rounded-lg border border-white/10 bg-[#1a1530] shadow-xl py-1 z-20 text-xs">
              {onPutOnStage && (
                <button type="button" className="flex w-full items-center gap-2 px-3 py-2 hover:bg-white/10 text-white" onClick={() => { setMenuOpen(false); onPutOnStage() }}>
                  <Star className="w-3.5 h-3.5 text-[#CEB466]" /> Put on stage
                </button>
              )}
              {onMute && !participant.isMuted && (
                <button type="button" className="flex w-full items-center gap-2 px-3 py-2 hover:bg-white/10 text-white" onClick={() => { setMenuOpen(false); onMute() }}>
                  <MicOff className="w-3.5 h-3.5" /> Mute
                </button>
              )}
              {onLowerHand && participant.handRaised && (
                <button type="button" className="flex w-full items-center gap-2 px-3 py-2 hover:bg-white/10 text-white" onClick={() => { setMenuOpen(false); onLowerHand() }}>
                  <Hand className="w-3.5 h-3.5" /> Lower hand
                </button>
              )}
              {onRemove && (
                <button type="button" className="flex w-full items-center gap-2 px-3 py-2 hover:bg-white/10 text-red-300" onClick={() => { setMenuOpen(false); onRemove() }}>
                  <UserX className="w-3.5 h-3.5" /> Remove from recital
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
