'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  Hand,
  ListMusic,
  LogOut,
  MessageCircle,
  Mic,
  MicOff,
  Play,
  SlidersHorizontal,
  Smile,
  Square,
  Theater,
  Users,
  Video,
  VideoOff,
  Wifi,
  WifiOff,
} from 'lucide-react'
import { useRecitalRoom } from '@/lib/recital/use-recital-room'
import { REACTIONS, type RecitalPresence } from '@/lib/recital/protocol'
import type { RecitalJoinGrant, RecitalPerformance } from '@/types/recital.types'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { ParticipantTile } from './ParticipantTile'
import { ChatPanel } from './ChatPanel'
import { ProgramPanel } from './ProgramPanel'
import { MicPopover } from './MicPopover'
import { ReactionsOverlay } from './ReactionsOverlay'
import { AudioSink } from './VideoSurface'
import type { JoinMedia } from './GreenRoom'

interface StageProps {
  grant: RecitalJoinGrant
  media: JoinMedia
  onLeft: () => void
}

type SideTab = 'chat' | 'program'

export function Stage({ grant, media, onLeft }: StageProps) {
  const room = useRecitalRoom({
    grant,
    pipeline: media.pipeline,
    cameraTrack: media.cameraTrack,
    initialMuted: media.muted,
    initialVideoOff: media.videoOff,
  })
  const { me, liveState, isHost, remoteParticipants, remoteStreams, actions, host } = room

  const [sideTab, setSideTab] = useState<SideTab>('chat')
  const [sideOpen, setSideOpen] = useState(true)
  const [micOpen, setMicOpen] = useState(false)
  const [reactionsOpen, setReactionsOpen] = useState(false)
  const [confirm, setConfirm] = useState<null | 'leave' | 'end' | 'mute-all'>(null)
  const [pendingRemove, setPendingRemove] = useState<RecitalPresence | null>(null)

  useEffect(() => {
    actions.setChatOpen(sideOpen && sideTab === 'chat')
  }, [actions, sideOpen, sideTab])

  const everyone = useMemo(() => [me, ...remoteParticipants], [me, remoteParticipants])
  const presentIds = useMemo(() => new Set(everyone.map((p) => p.id)), [everyone])

  // Who is in the big frame: the performer, else the host, else whoever is here.
  const spotlightId = useMemo(() => {
    const performerId = liveState.current?.performerParticipantId
    if (liveState.phase === 'performing' && performerId && presentIds.has(performerId)) return performerId
    const hostPresence = everyone.find((p) => p.role === 'host')
    return hostPresence?.id ?? me.id
  }, [everyone, liveState, me.id, presentIds])

  const spotlight = everyone.find((p) => p.id === spotlightId) ?? me
  const others = everyone.filter((p) => p.id !== spotlightId)

  const streamFor = (id: string) => (id === me.id ? mediaStreamForMe(media) : remoteStreams.get(id) ?? null)

  const phaseLabel =
    liveState.phase === 'performing' && liveState.current
      ? `Now performing · ${liveState.current.performerName} — ${liveState.current.songTitle}`
      : liveState.phase === 'intermission'
      ? 'Intermission'
      : liveState.phase === 'ended'
      ? 'The recital has ended'
      : 'Gathering · waiting for the host to begin'

  const putOnStageAdHoc = async (p: RecitalPresence) => {
    // Host clicked a tile: create a program entry on the fly and start it.
    try {
      const res = await fetch(`/api/recitals/${grant.recital.id}/performances`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${grant.token}` },
        body: JSON.stringify({ performerName: p.name, participantId: p.id, songTitle: 'Performance' }),
      })
      if (!res.ok) throw new Error()
      const data = await res.json()
      await host.setPerformer(data.performance as RecitalPerformance)
    } catch {
      actions.pushToast("Couldn't put them on stage. Try again.", 'warning')
    }
  }

  const leave = async () => {
    await actions.leave()
    onLeft()
  }

  // ------------------------------------------------------------ end states

  if (room.status === 'ended' || room.status === 'removed' || room.status === 'error') {
    const title = room.status === 'ended' ? 'The recital has ended' : room.status === 'removed' ? 'You were removed from the recital' : 'Something went wrong'
    const body =
      room.status === 'ended'
        ? 'Thank you for being part of it. Recordings are saved with the host.'
        : room.status === 'removed'
        ? 'If you think this was a mistake, reach out to your host.'
        : room.errorMessage || 'Please try again.'
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="glass-card-luxe p-8 max-w-md w-full text-center animate-fade-in">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-[#CEB466]/15 border border-[#CEB466]/30 flex items-center justify-center mb-4">
            <Theater className="w-6 h-6 text-[#CEB466]" />
          </div>
          <h1 className="text-2xl font-bold text-white font-luxury">{title}</h1>
          <p className="text-sm text-gray-300 mt-2">{body}</p>
          <div className="mt-6 flex items-center justify-center gap-3">
            <button type="button" onClick={leave} className="px-4 py-2.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/10 text-gray-200 text-xs font-semibold transition-colors">
              Close
            </button>
            {isHost && (
              <Link href={`/dashboard/recitals/${grant.recital.id}`} className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-[#CEB466] via-[#e2c974] to-[#CEB466] text-[#171229] text-xs font-bold shadow-lg shadow-[#CEB466]/20 hover:brightness-110">
                View recordings
              </Link>
            )}
          </div>
        </div>
      </div>
    )
  }

  // ---------------------------------------------------------------- layout

  const controlBtn = (active: boolean, danger?: boolean) =>
    `p-3.5 sm:p-4 rounded-full transition-colors ${
      danger ? 'bg-red-500 text-white hover:bg-red-600' : active ? 'bg-[#CEB466] text-[#171229]' : 'bg-gray-700 text-white hover:bg-gray-600'
    }`

  return (
    <div className="h-[100dvh] flex flex-col overflow-hidden">
      {/* Top bar */}
      <header className="h-14 shrink-0 flex items-center gap-3 px-3 sm:px-5 border-b border-white/10 bg-[#0f0b1e]/60 backdrop-blur-xl">
        <div className="w-8 h-8 rounded-xl bg-[#CEB466]/15 border border-[#CEB466]/30 flex items-center justify-center shrink-0">
          <Theater className="w-4 h-4 text-[#CEB466]" />
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="text-sm sm:text-base font-bold text-white font-luxury truncate leading-tight">{grant.recital.title}</h1>
          <p className="text-[11px] text-gray-400 truncate">
            {liveState.phase === 'performing' && <span className="inline-block w-1.5 h-1.5 rounded-full bg-[#CEB466] mr-1.5 animate-pulse align-middle" />}
            {phaseLabel}
          </p>
        </div>
        <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/[0.05] border border-white/10 text-[11px] text-gray-300">
          <Users className="w-3.5 h-3.5 text-[#CEB466]" />
          {everyone.length}
        </div>
        <div
          className={`hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[11px] ${
            room.net === 'bad'
              ? 'bg-red-500/10 border-red-500/30 text-red-200'
              : room.net === 'warning'
              ? 'bg-amber-500/10 border-amber-500/30 text-amber-100'
              : 'bg-white/[0.05] border-white/10 text-gray-300'
          }`}
          title="Your connection"
        >
          {room.net === 'bad' ? <WifiOff className="w-3.5 h-3.5" /> : <Wifi className="w-3.5 h-3.5" />}
          {room.net === 'bad' ? 'Weak connection' : room.net === 'warning' ? 'Connection dipping' : room.status === 'connected' ? 'Connected' : 'Connecting…'}
        </div>
        {isHost && (
          <div className="flex items-center gap-2">
            {liveState.phase === 'lobby' && (
              <button
                type="button"
                onClick={() => host.startRecital()}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-gradient-to-r from-[#CEB466] via-[#e2c974] to-[#CEB466] text-[#171229] text-xs font-bold shadow-lg shadow-[#CEB466]/20 hover:brightness-110 active:scale-95 transition-all"
              >
                <Play className="w-3.5 h-3.5" /> Begin recital
              </button>
            )}
            {liveState.phase === 'performing' && (
              <button
                type="button"
                onClick={() => host.endPerformance('done')}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-500/20 border border-emerald-500/30 text-emerald-100 text-xs font-bold hover:bg-emerald-500/30 transition-colors"
              >
                <Square className="w-3.5 h-3.5" /> Finish performance
              </button>
            )}
            {liveState.phase !== 'lobby' && (
              <button
                type="button"
                onClick={() => setConfirm('end')}
                className="hidden sm:inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/10 text-gray-200 text-xs font-semibold transition-colors"
              >
                End recital
              </button>
            )}
          </div>
        )}
      </header>

      {/* Body */}
      <div className="flex-1 min-h-0 flex">
        {/* Stage column */}
        <div className="flex-1 min-w-0 flex flex-col p-3 sm:p-4 gap-3 relative">
          <ReactionsOverlay reactions={room.reactions} />

          {/* Spotlight */}
          <div className="flex-1 min-h-0 relative">
            <ParticipantTile
              participant={spotlight}
              stream={streamFor(spotlight.id)}
              isLocal={spotlight.id === me.id}
              isSpotlight
              connection={room.peerStatus.get(spotlight.id)}
              className="absolute inset-0"
            />
            {liveState.phase === 'performing' && liveState.current && (
              <div className="absolute top-3 left-3 flex items-center gap-2 px-3 py-1.5 rounded-full bg-black/55 backdrop-blur-md border border-[#CEB466]/40">
                <span className="w-1.5 h-1.5 rounded-full bg-[#CEB466] animate-pulse" />
                <span className="text-xs text-white font-semibold">{liveState.current.performerName}</span>
                <span className="text-xs text-gray-300 hidden sm:inline">· {liveState.current.songTitle}</span>
              </div>
            )}
            {room.isPerformer && (
              <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-2 px-4 py-2 rounded-full bg-[#CEB466] text-[#171229] text-xs font-bold shadow-lg shadow-[#CEB466]/30">
                You&apos;re on stage
                {room.localRecording.status === 'recording' && <span className="w-2 h-2 rounded-full bg-red-600 animate-pulse" />}
              </div>
            )}
            {room.localRecording.status === 'uploading' && (
              <div className="absolute bottom-3 right-3 px-3 py-1.5 rounded-full bg-black/60 border border-white/10 text-[11px] text-gray-200">
                Saving your performance… {Math.round(room.localRecording.progress * 100)}%
              </div>
            )}
            {liveState.phase === 'lobby' && !isHost && (
              <div className="absolute bottom-3 left-1/2 -translate-x-1/2 px-3.5 py-1.5 rounded-full bg-black/55 backdrop-blur-md border border-white/10 text-[11px] text-gray-200">
                Make yourself comfortable. The host will begin shortly.
              </div>
            )}
          </div>

          {/* Everyone else */}
          {others.length > 0 && (
            <div className="shrink-0">
              <div className="flex items-center gap-2 mb-1.5 px-0.5">
                <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500">In the room</span>
                <span className="text-[10px] text-gray-600">{others.length}</span>
              </div>
              <div className="flex gap-2 overflow-x-auto scrollbar-none pb-1">
                {others.map((p) => (
                  <ParticipantTile
                    key={p.id}
                    participant={p}
                    stream={streamFor(p.id)}
                    isLocal={p.id === me.id}
                    connection={room.peerStatus.get(p.id)}
                    showHostMenu={isHost}
                    onMute={() => host.muteParticipant(p.id)}
                    onLowerHand={() => host.lowerHand(p.id)}
                    onRemove={() => setPendingRemove(p)}
                    onPutOnStage={() => void putOnStageAdHoc(p)}
                    className="w-36 sm:w-44 aspect-video shrink-0"
                  />
                ))}
              </div>
            </div>
          )}

          {/* Controls */}
          <div className="shrink-0 h-[4.5rem] rounded-2xl border border-white/10 bg-gray-900/50 backdrop-blur-xl flex items-center justify-center gap-2 sm:gap-3 px-3 relative">
            <div className="relative flex items-center">
              <button type="button" onClick={actions.toggleMute} className={controlBtn(false, me.isMuted)} title={me.isMuted ? 'Unmute' : 'Mute'}>
                {me.isMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
              </button>
              <button
                type="button"
                onClick={() => setMicOpen((v) => !v)}
                className="-ml-2 mt-6 p-1 rounded-full bg-gray-800 border border-white/10 text-gray-300 hover:text-white"
                title="Mic adjustment"
                aria-label="Mic adjustment"
              >
                <SlidersHorizontal className="w-3 h-3" />
              </button>
              <MicPopover open={micOpen} onClose={() => setMicOpen(false)} preference={room.micPreference} onPreferenceChange={actions.setMicPreference} reading={room.levels} />
            </div>
            <button type="button" onClick={actions.toggleVideo} disabled={!media.cameraTrack} className={controlBtn(false, me.isVideoOff)} title={me.isVideoOff ? 'Turn on camera' : 'Turn off camera'}>
              {me.isVideoOff ? <VideoOff className="w-5 h-5" /> : <Video className="w-5 h-5" />}
            </button>
            {!isHost && (
              <button type="button" onClick={actions.toggleHand} className={controlBtn(me.handRaised)} title={me.handRaised ? 'Lower hand' : 'Raise hand'}>
                <Hand className="w-5 h-5" />
              </button>
            )}
            <div className="relative">
              <button type="button" onClick={() => setReactionsOpen((v) => !v)} className={controlBtn(reactionsOpen)} title="Applaud">
                <Smile className="w-5 h-5" />
              </button>
              {reactionsOpen && (
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-3 flex items-center gap-1 px-2 py-1.5 modal-solid rounded-full border border-[#CEB466]/40 shadow-2xl animate-slide-up">
                  {REACTIONS.map((emoji) => (
                    <button key={emoji} type="button" onClick={() => actions.sendReaction(emoji)} className="text-2xl px-1.5 py-1 rounded-full hover:bg-white/10 transition-transform hover:scale-125 active:scale-95">
                      {emoji}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="w-px h-8 bg-white/10 mx-1" />

            <button type="button" onClick={() => { setSideTab('chat'); setSideOpen((o) => !(o && sideTab === 'chat')) }} className={`${controlBtn(sideOpen && sideTab === 'chat')} relative`} title="Chat">
              <MessageCircle className="w-5 h-5" />
              {room.unreadChat > 0 && !(sideOpen && sideTab === 'chat') && (
                <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 rounded-full text-[10px] flex items-center justify-center text-white font-bold">{Math.min(9, room.unreadChat)}</span>
              )}
            </button>
            <button type="button" onClick={() => { setSideTab('program'); setSideOpen((o) => !(o && sideTab === 'program')) }} className={controlBtn(sideOpen && sideTab === 'program')} title="Program">
              <ListMusic className="w-5 h-5" />
            </button>
            {isHost && (
              <button type="button" onClick={() => setConfirm('mute-all')} className={controlBtn(false)} title="Mute everyone">
                <Users className="w-5 h-5" />
              </button>
            )}

            <div className="w-px h-8 bg-white/10 mx-1" />

            <button type="button" onClick={() => setConfirm('leave')} className={controlBtn(false, true)} title="Leave">
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Side panel: chat / program */}
        <aside
          className={`${sideOpen ? 'flex' : 'hidden'} lg:flex flex-col w-full max-w-[22rem] xl:max-w-[24rem] border-l border-white/10 bg-[#0f0b1e]/60 backdrop-blur-xl absolute lg:static top-14 bottom-0 right-0 z-20 lg:z-auto`}
        >
          <div className="flex items-center border-b border-white/10 px-2 pt-2">
            {(['chat', 'program'] as SideTab[]).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => { setSideTab(tab); setSideOpen(true) }}
                className={`relative px-3.5 py-2 text-xs font-semibold rounded-t-xl transition-colors ${
                  sideTab === tab ? 'text-[#CEB466] bg-white/[0.05]' : 'text-gray-400 hover:text-white'
                }`}
              >
                {tab === 'chat' ? 'Community chat' : 'Program'}
                {tab === 'chat' && room.unreadChat > 0 && sideTab !== 'chat' && (
                  <span className="ml-1.5 px-1.5 py-0.5 rounded-full bg-[#CEB466] text-[#171229] text-[9px] font-extrabold">{Math.min(9, room.unreadChat)}</span>
                )}
                {sideTab === tab && <span className="absolute bottom-0 inset-x-3 h-0.5 bg-[#CEB466] rounded-full" />}
              </button>
            ))}
            <button type="button" onClick={() => setSideOpen(false)} className="ml-auto lg:hidden px-3 py-2 text-xs text-gray-400 hover:text-white">Close</button>
          </div>
          <div className="flex-1 min-h-0">
            {sideTab === 'chat' ? (
              <ChatPanel messages={room.chat} meId={me.id} onSend={actions.sendChat} />
            ) : (
              <ProgramPanel
                recitalId={grant.recital.id}
                authToken={grant.token}
                performances={room.performances}
                roster={room.roster}
                presentIds={presentIds}
                liveState={liveState}
                isHost={isHost}
                mode="live"
                onStart={(p) => void host.setPerformer(p)}
                onFinish={(outcome) => void host.endPerformance(outcome)}
                onChanged={() => void actions.refreshProgram()}
              />
            )}
          </div>
        </aside>
      </div>

      {/* Toasts */}
      <div className="pointer-events-none fixed bottom-24 left-1/2 -translate-x-1/2 z-50 flex flex-col items-center gap-2 px-4 w-full max-w-md">
        {room.toasts.map((t) => (
          <div
            key={t.id}
            className={`px-4 py-2.5 rounded-xl border text-xs shadow-2xl animate-slide-up backdrop-blur-xl ${
              t.tone === 'success'
                ? 'bg-[#CEB466]/15 border-[#CEB466]/40 text-[#f5e1a3]'
                : t.tone === 'warning'
                ? 'bg-amber-500/15 border-amber-500/40 text-amber-100'
                : 'bg-[#1b1233]/90 border-white/10 text-gray-100'
            }`}
          >
            {t.text}
          </div>
        ))}
      </div>

      <AudioSink streams={remoteStreams} outputDeviceId={media.speakerDeviceId} />

      <ConfirmDialog
        isOpen={confirm === 'leave'}
        title="Leave the recital?"
        message={isHost ? 'The room stays open for everyone else. You can come back from your dashboard.' : 'You can rejoin with the same link any time.'}
        confirmText="Leave"
        destructive
        onConfirm={() => { setConfirm(null); void leave() }}
        onCancel={() => setConfirm(null)}
      />
      <ConfirmDialog
        isOpen={confirm === 'end'}
        title="End the recital for everyone?"
        message="This closes the room. Recordings are kept and you can review them from your dashboard."
        confirmText="End recital"
        destructive
        onConfirm={() => { setConfirm(null); void host.endRecital() }}
        onCancel={() => setConfirm(null)}
      />
      <ConfirmDialog
        isOpen={confirm === 'mute-all'}
        title="Mute everyone?"
        message="Everyone except the performer will be muted. They can unmute themselves afterwards."
        confirmText="Mute everyone"
        onConfirm={() => { setConfirm(null); host.muteAll() }}
        onCancel={() => setConfirm(null)}
      />
      <ConfirmDialog
        isOpen={!!pendingRemove}
        title={`Remove ${pendingRemove?.name ?? ''}?`}
        message="They will leave the room immediately. They can rejoin with the link unless you cancel the recital."
        confirmText="Remove"
        destructive
        onConfirm={() => { if (pendingRemove) host.removeParticipant(pendingRemove.id); setPendingRemove(null) }}
        onCancel={() => setPendingRemove(null)}
      />
    </div>
  )
}

let cachedLocalStream: { track: MediaStreamTrack | null; stream: MediaStream } | null = null
function mediaStreamForMe(media: JoinMedia): MediaStream | null {
  const track = media.cameraTrack
  if (!track) return null
  if (cachedLocalStream && cachedLocalStream.track === track) return cachedLocalStream.stream
  cachedLocalStream = { track, stream: new MediaStream([track]) }
  return cachedLocalStream.stream
}
