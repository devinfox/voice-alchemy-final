'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  Hand, Hourglass, LogOut, MessageCircle, Mic, MicOff, Play, Presentation, ScreenShare, ScreenShareOff,
  SlidersHorizontal, Smile, Square, UserCheck, UserMinus, Users, Video, VideoOff, Wifi, WifiOff,
} from 'lucide-react'
import { useTrainingRoom } from '@/lib/training/use-training-room'
import { REACTIONS, type RecitalPresence } from '@/lib/recital/protocol'
import type { TrainingJoinGrant } from '@/types/training.types'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { ParticipantTile } from '@/components/recital/ParticipantTile'
import { ChatPanel } from '@/components/recital/ChatPanel'
import { MicPopover } from '@/components/recital/MicPopover'
import { ReactionsOverlay } from '@/components/recital/ReactionsOverlay'
import { AudioSink, VideoSurface } from '@/components/recital/VideoSurface'
import type { JoinMedia } from '@/components/recital/GreenRoom'

interface Props {
  grant: TrainingJoinGrant
  media: JoinMedia
  onLeft: () => void
}

type SideTab = 'chat' | 'people'

export function TrainingStage({ grant, media, onLeft }: Props) {
  const room = useTrainingRoom({ grant, pipeline: media.pipeline, cameraTrack: media.cameraTrack, initialMuted: media.muted, initialVideoOff: media.videoOff })
  const { me, isHost, remoteParticipants, remoteStreams, remoteScreens, actions, host, liveState } = room

  const [sideTab, setSideTab] = useState<SideTab>(isHost ? 'people' : 'chat')
  const [sideOpen, setSideOpen] = useState(true)
  const [micOpen, setMicOpen] = useState(false)
  const [reactionsOpen, setReactionsOpen] = useState(false)
  const [confirm, setConfirm] = useState<null | 'leave' | 'end' | 'mute-all'>(null)
  const [pendingRemove, setPendingRemove] = useState<RecitalPresence | null>(null)

  useEffect(() => {
    actions.setChatOpen(sideOpen && sideTab === 'chat')
  }, [actions, sideOpen, sideTab])

  const admittedRemote = useMemo(() => remoteParticipants.filter((p) => !p.waiting), [remoteParticipants])
  const waiting = useMemo(() => remoteParticipants.filter((p) => p.waiting), [remoteParticipants])
  const everyone = useMemo(() => [me, ...admittedRemote], [me, admittedRemote])

  const hostPresence = everyone.find((p) => p.role === 'host') ?? null
  const screenOwner = everyone.find((p) => p.sharingScreen) ?? null
  const screenStream = screenOwner ? (screenOwner.id === me.id ? room.localScreen : remoteScreens.get(screenOwner.id) ?? null) : null
  const spotlight = hostPresence ?? me
  const others = everyone.filter((p) => p.id !== spotlight.id || !!screenStream)

  const streamFor = (id: string) => (id === me.id ? localCamera(media) : remoteStreams.get(id) ?? null)

  const leave = async () => {
    await actions.leave()
    onLeft()
  }

  // ------------------------------------------------------------ end states
  if (room.status === 'waiting') {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="glass-card-luxe p-8 max-w-md w-full text-center animate-fade-in">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-[#CEB466]/15 border border-[#CEB466]/30 flex items-center justify-center mb-4">
            <Hourglass className="w-6 h-6 text-[#CEB466] animate-pulse" />
          </div>
          <h1 className="text-2xl font-bold text-white font-luxury">Hang tight</h1>
          <p className="text-sm text-gray-300 mt-2">{grant.hostName} will let you in shortly. Keep this tab open.</p>
          <p className="text-xs text-gray-500 mt-4">{grant.session.title}</p>
          <button type="button" onClick={leave} className="mt-6 px-4 py-2.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/10 text-gray-200 text-xs font-semibold transition-colors">Leave</button>
        </div>
      </div>
    )
  }

  if (room.status === 'ended' || room.status === 'removed' || room.status === 'denied' || room.status === 'error') {
    const title = room.status === 'ended' ? 'The session has ended' : room.status === 'removed' ? 'You were removed from the session' : room.status === 'denied' ? "The host didn't admit you" : 'Something went wrong'
    const body = room.status === 'ended' ? 'Thanks for coming.' : room.status === 'denied' ? 'If you think this was a mistake, reach out to the host.' : room.status === 'removed' ? 'If you think this was a mistake, reach out to the host.' : room.errorMessage || 'Please try again.'
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="glass-card-luxe p-8 max-w-md w-full text-center animate-fade-in">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-[#CEB466]/15 border border-[#CEB466]/30 flex items-center justify-center mb-4">
            <Presentation className="w-6 h-6 text-[#CEB466]" />
          </div>
          <h1 className="text-2xl font-bold text-white font-luxury">{title}</h1>
          <p className="text-sm text-gray-300 mt-2">{body}</p>
          <div className="mt-6 flex items-center justify-center gap-3">
            <button type="button" onClick={leave} className="px-4 py-2.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/10 text-gray-200 text-xs font-semibold transition-colors">Close</button>
            {isHost && (
              <Link href={`/dashboard/training-sessions/${grant.session.id}`} className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-[#CEB466] via-[#e2c974] to-[#CEB466] text-[#171229] text-xs font-bold shadow-lg shadow-[#CEB466]/20 hover:brightness-110">Back to session</Link>
            )}
          </div>
        </div>
      </div>
    )
  }

  const controlBtn = (active: boolean, danger?: boolean) =>
    `p-3.5 sm:p-4 rounded-full transition-colors ${danger ? 'bg-red-500 text-white hover:bg-red-600' : active ? 'bg-[#CEB466] text-[#171229]' : 'bg-gray-700 text-white hover:bg-gray-600'}`

  const phaseLabel = liveState.phase === 'live' ? 'Live' : liveState.phase === 'ended' ? 'Ended' : 'Waiting for the host to begin'

  return (
    <div className="h-[100dvh] flex flex-col overflow-hidden">
      <header className="h-14 shrink-0 flex items-center gap-3 px-3 sm:px-5 border-b border-white/10 bg-[#0f0b1e]/60 backdrop-blur-xl">
        <div className="w-8 h-8 rounded-xl bg-[#CEB466]/15 border border-[#CEB466]/30 flex items-center justify-center shrink-0">
          <Presentation className="w-4 h-4 text-[#CEB466]" />
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="text-sm sm:text-base font-bold text-white font-luxury truncate leading-tight">{grant.session.title}</h1>
          <p className="text-[11px] text-gray-400 truncate">
            {liveState.phase === 'live' && <span className="inline-block w-1.5 h-1.5 rounded-full bg-[#CEB466] mr-1.5 animate-pulse align-middle" />}
            {phaseLabel}
            {screenOwner && <span className="text-gray-500"> · {screenOwner.id === me.id ? 'You are' : `${screenOwner.name} is`} sharing a screen</span>}
          </p>
        </div>
        <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/[0.05] border border-white/10 text-[11px] text-gray-300">
          <Users className="w-3.5 h-3.5 text-[#CEB466]" /> {everyone.length}
        </div>
        <div className={`hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[11px] ${room.net === 'bad' ? 'bg-red-500/10 border-red-500/30 text-red-200' : room.net === 'warning' ? 'bg-amber-500/10 border-amber-500/30 text-amber-100' : 'bg-white/[0.05] border-white/10 text-gray-300'}`}>
          {room.net === 'bad' ? <WifiOff className="w-3.5 h-3.5" /> : <Wifi className="w-3.5 h-3.5" />}
          {room.net === 'bad' ? 'Weak connection' : room.net === 'warning' ? 'Connection dipping' : 'Connected'}
        </div>
        {isHost && (
          <div className="flex items-center gap-2">
            {liveState.phase === 'lobby' && (
              <button type="button" onClick={() => void host.start()} className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-gradient-to-r from-[#CEB466] via-[#e2c974] to-[#CEB466] text-[#171229] text-xs font-bold shadow-lg shadow-[#CEB466]/20 hover:brightness-110 active:scale-95 transition-all">
                <Play className="w-3.5 h-3.5" /> Begin session
              </button>
            )}
            {liveState.phase === 'live' && (
              <button type="button" onClick={() => setConfirm('end')} className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/10 text-gray-200 text-xs font-semibold transition-colors">
                <Square className="w-3.5 h-3.5" /> End session
              </button>
            )}
          </div>
        )}
      </header>

      <div className="flex-1 min-h-0 flex">
        <div className="flex-1 min-w-0 flex flex-col p-3 sm:p-4 gap-3 relative">
          <ReactionsOverlay reactions={room.reactions} />

          <div className="flex-1 min-h-0 relative">
            {screenStream ? (
              <div className="absolute inset-0 rounded-2xl overflow-hidden bg-black border border-[#CEB466]/40 shadow-[0_0_40px_rgba(206,180,102,0.12)]">
                <VideoSurface stream={screenStream} fit="contain" className="absolute inset-0 w-full h-full" />
                <div className="absolute top-3 left-3 flex items-center gap-2 px-3 py-1.5 rounded-full bg-black/55 backdrop-blur-md border border-[#CEB466]/40 text-xs text-white">
                  <ScreenShare className="w-3.5 h-3.5 text-[#CEB466]" /> {screenOwner?.id === me.id ? 'Your screen' : `${screenOwner?.name}'s screen`}
                </div>
              </div>
            ) : (
              <ParticipantTile participant={spotlight} stream={streamFor(spotlight.id)} isLocal={spotlight.id === me.id} isSpotlight connection={room.peerStatus.get(spotlight.id)} className="absolute inset-0" />
            )}
            {isHost && waiting.length > 0 && (
              <button type="button" onClick={() => { setSideTab('people'); setSideOpen(true) }} className="absolute top-3 right-3 inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#CEB466] text-[#171229] text-xs font-bold shadow-lg shadow-[#CEB466]/30 animate-pulse">
                <Hourglass className="w-3.5 h-3.5" /> {waiting.length} waiting to join
              </button>
            )}
          </div>

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
                    className="w-36 sm:w-44 aspect-video shrink-0"
                  />
                ))}
              </div>
            </div>
          )}

          <div className="shrink-0 h-[4.5rem] rounded-2xl border border-white/10 bg-gray-900/50 backdrop-blur-xl flex items-center justify-center gap-2 sm:gap-3 px-3 relative">
            <div className="relative flex items-center">
              <button type="button" onClick={actions.toggleMute} className={controlBtn(false, me.isMuted)} title={me.isMuted ? 'Unmute' : 'Mute'}>
                {me.isMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
              </button>
              <button type="button" onClick={() => setMicOpen((v) => !v)} className="-ml-2 mt-6 p-1 rounded-full bg-gray-800 border border-white/10 text-gray-300 hover:text-white" title="Mic adjustment" aria-label="Mic adjustment">
                <SlidersHorizontal className="w-3 h-3" />
              </button>
              <MicPopover open={micOpen} onClose={() => setMicOpen(false)} preference={room.micPreference} onPreferenceChange={actions.setMicPreference} reading={room.levels} />
            </div>
            <button type="button" onClick={actions.toggleVideo} disabled={!media.cameraTrack} className={controlBtn(false, me.isVideoOff)} title={me.isVideoOff ? 'Turn on camera' : 'Turn off camera'}>
              {me.isVideoOff ? <VideoOff className="w-5 h-5" /> : <Video className="w-5 h-5" />}
            </button>
            {isHost ? (
              <button type="button" onClick={() => (room.sharingScreen ? void actions.stopScreenShare() : void actions.startScreenShare())} className={room.sharingScreen ? 'p-3.5 sm:p-4 rounded-full bg-green-500 text-white hover:bg-green-600 transition-colors' : controlBtn(false)} title={room.sharingScreen ? 'Stop sharing' : 'Share screen'}>
                {room.sharingScreen ? <ScreenShareOff className="w-5 h-5" /> : <ScreenShare className="w-5 h-5" />}
              </button>
            ) : (
              <button type="button" onClick={actions.toggleHand} className={controlBtn(me.handRaised)} title={me.handRaised ? 'Lower hand' : 'Raise hand'}>
                <Hand className="w-5 h-5" />
              </button>
            )}
            <div className="relative">
              <button type="button" onClick={() => setReactionsOpen((v) => !v)} className={controlBtn(reactionsOpen)} title="React">
                <Smile className="w-5 h-5" />
              </button>
              {reactionsOpen && (
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-3 flex items-center gap-1 px-2 py-1.5 modal-solid rounded-full border border-[#CEB466]/40 shadow-2xl animate-slide-up">
                  {REACTIONS.map((emoji) => (
                    <button key={emoji} type="button" onClick={() => actions.sendReaction(emoji)} className="text-2xl px-1.5 py-1 rounded-full hover:bg-white/10 transition-transform hover:scale-125 active:scale-95">{emoji}</button>
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
            <button type="button" onClick={() => { setSideTab('people'); setSideOpen((o) => !(o && sideTab === 'people')) }} className={`${controlBtn(sideOpen && sideTab === 'people')} relative`} title="People">
              <Users className="w-5 h-5" />
              {isHost && waiting.length > 0 && <span className="absolute -top-1 -right-1 w-5 h-5 bg-[#CEB466] rounded-full text-[10px] flex items-center justify-center text-[#171229] font-extrabold">{waiting.length}</span>}
            </button>
            {isHost && (
              <button type="button" onClick={() => setConfirm('mute-all')} className={controlBtn(false)} title="Mute everyone">
                <MicOff className="w-5 h-5" />
              </button>
            )}

            <div className="w-px h-8 bg-white/10 mx-1" />
            <button type="button" onClick={() => setConfirm('leave')} className={controlBtn(false, true)} title="Leave">
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>

        <aside className={`${sideOpen ? 'flex' : 'hidden'} lg:flex flex-col w-full max-w-[22rem] xl:max-w-[24rem] border-l border-white/10 bg-[#0f0b1e]/60 backdrop-blur-xl absolute lg:static top-14 bottom-0 right-0 z-20 lg:z-auto`}>
          <div className="flex items-center border-b border-white/10 px-2 pt-2">
            {(['chat', 'people'] as SideTab[]).map((tab) => (
              <button key={tab} type="button" onClick={() => { setSideTab(tab); setSideOpen(true) }} className={`relative px-3.5 py-2 text-xs font-semibold rounded-t-xl transition-colors ${sideTab === tab ? 'text-[#CEB466] bg-white/[0.05]' : 'text-gray-400 hover:text-white'}`}>
                {tab === 'chat' ? 'Community chat' : 'People'}
                {tab === 'chat' && room.unreadChat > 0 && sideTab !== 'chat' && <span className="ml-1.5 px-1.5 py-0.5 rounded-full bg-[#CEB466] text-[#171229] text-[9px] font-extrabold">{Math.min(9, room.unreadChat)}</span>}
                {tab === 'people' && isHost && waiting.length > 0 && sideTab !== 'people' && <span className="ml-1.5 px-1.5 py-0.5 rounded-full bg-[#CEB466] text-[#171229] text-[9px] font-extrabold">{waiting.length}</span>}
                {sideTab === tab && <span className="absolute bottom-0 inset-x-3 h-0.5 bg-[#CEB466] rounded-full" />}
              </button>
            ))}
            <button type="button" onClick={() => setSideOpen(false)} className="ml-auto lg:hidden px-3 py-2 text-xs text-gray-400 hover:text-white">Close</button>
          </div>
          <div className="flex-1 min-h-0">
            {sideTab === 'chat' ? (
              <ChatPanel messages={room.chat} meId={me.id} onSend={actions.sendChat} />
            ) : (
              <PeoplePanel me={me} admitted={admittedRemote} waiting={waiting} isHost={isHost} onAdmit={(id) => void host.admit(id)} onDeny={(id) => void host.deny(id)} onAdmitAll={host.admitAll} onMute={host.muteParticipant} onRemove={setPendingRemove} />
            )}
          </div>
        </aside>
      </div>

      <div className="pointer-events-none fixed bottom-24 left-1/2 -translate-x-1/2 z-50 flex flex-col items-center gap-2 px-4 w-full max-w-md">
        {room.toasts.map((t) => (
          <div key={t.id} className={`px-4 py-2.5 rounded-xl border text-xs shadow-2xl animate-slide-up backdrop-blur-xl ${t.tone === 'success' ? 'bg-[#CEB466]/15 border-[#CEB466]/40 text-[#f5e1a3]' : t.tone === 'warning' ? 'bg-amber-500/15 border-amber-500/40 text-amber-100' : 'bg-[#1b1233]/90 border-white/10 text-gray-100'}`}>{t.text}</div>
        ))}
      </div>

      <AudioSink streams={mergeAudio(remoteStreams, remoteScreens)} outputDeviceId={media.speakerDeviceId} />

      <ConfirmDialog isOpen={confirm === 'leave'} title="Leave the session?" message={isHost ? 'The room stays open for everyone else. You can come back from your dashboard.' : 'You can rejoin with the same link any time.'} confirmText="Leave" destructive onConfirm={() => { setConfirm(null); void leave() }} onCancel={() => setConfirm(null)} />
      <ConfirmDialog isOpen={confirm === 'end'} title="End the session for everyone?" message="This closes the room for all attendees." confirmText="End session" destructive onConfirm={() => { setConfirm(null); void host.end() }} onCancel={() => setConfirm(null)} />
      <ConfirmDialog isOpen={confirm === 'mute-all'} title="Mute everyone?" message="All attendees will be muted. They can unmute themselves afterwards unless you turned that off." confirmText="Mute everyone" onConfirm={() => { setConfirm(null); host.muteAll() }} onCancel={() => setConfirm(null)} />
      <ConfirmDialog isOpen={!!pendingRemove} title={`Remove ${pendingRemove?.name ?? ''}?`} message="They will leave the room immediately." confirmText="Remove" destructive onConfirm={() => { if (pendingRemove) host.removeParticipant(pendingRemove.id); setPendingRemove(null) }} onCancel={() => setPendingRemove(null)} />
    </div>
  )
}

function PeoplePanel({ me, admitted, waiting, isHost, onAdmit, onDeny, onAdmitAll, onMute, onRemove }: {
  me: RecitalPresence
  admitted: RecitalPresence[]
  waiting: RecitalPresence[]
  isHost: boolean
  onAdmit: (id: string) => void
  onDeny: (id: string) => void
  onAdmitAll: () => void
  onMute: (id: string) => void
  onRemove: (p: RecitalPresence) => void
}) {
  const row = (p: RecitalPresence, isMe: boolean) => (
    <li key={p.id} className="flex items-center gap-2.5 px-3 py-2 rounded-xl hover:bg-white/[0.04]">
      <span className="w-8 h-8 rounded-full bg-[#CEB466]/15 border border-[#CEB466]/30 text-[#e0c97d] text-[11px] font-semibold flex items-center justify-center shrink-0">
        {p.name.split(' ').filter(Boolean).slice(0, 2).map((s) => s[0]?.toUpperCase()).join('')}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm text-white truncate">{p.name}{isMe && ' (you)'}{p.role === 'host' && <span className="ml-1.5 text-[10px] text-[#CEB466] font-semibold">Host</span>}</p>
        <p className="text-[11px] text-gray-500 flex items-center gap-1.5">
          {p.handRaised && <span className="text-[#CEB466]">Hand raised</span>}
          {p.isMuted ? 'Muted' : 'Mic on'}
        </p>
      </div>
      {isHost && !isMe && p.role !== 'host' && (
        <div className="flex items-center gap-1">
          {!p.isMuted && <button type="button" onClick={() => onMute(p.id)} className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/[0.08]" title="Mute"><MicOff className="w-3.5 h-3.5" /></button>}
          <button type="button" onClick={() => onRemove(p)} className="p-1.5 rounded-lg text-gray-400 hover:text-red-300 hover:bg-white/[0.08]" title="Remove"><UserMinus className="w-3.5 h-3.5" /></button>
        </div>
      )}
    </li>
  )

  return (
    <div className="h-full overflow-y-auto py-2">
      {isHost && waiting.length > 0 && (
        <div className="px-3 pb-2">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[10px] font-bold uppercase tracking-wider text-[#CEB466]">Waiting to join · {waiting.length}</span>
            {waiting.length > 1 && <button type="button" onClick={onAdmitAll} className="text-[11px] text-[#CEB466] hover:underline">Admit all</button>}
          </div>
          <ul className="space-y-1">
            {waiting.map((p) => (
              <li key={p.id} className="flex items-center gap-2.5 px-3 py-2 rounded-xl bg-[#CEB466]/10 border border-[#CEB466]/30">
                <Hourglass className="w-4 h-4 text-[#CEB466] shrink-0" />
                <span className="text-sm text-white truncate flex-1">{p.name}</span>
                <button type="button" onClick={() => onAdmit(p.id)} className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-gradient-to-r from-[#CEB466] via-[#e2c974] to-[#CEB466] text-[#171229] text-[11px] font-bold hover:brightness-110 active:scale-95 transition-all"><UserCheck className="w-3 h-3" /> Admit</button>
                <button type="button" onClick={() => onDeny(p.id)} className="px-2 py-1.5 rounded-lg text-[11px] text-gray-300 hover:text-red-300 hover:bg-white/[0.08]">Deny</button>
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="px-3">
        <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500">In the room · {admitted.length + 1}</span>
      </div>
      <ul className="mt-1 px-1">
        {row(me, true)}
        {admitted.map((p) => row(p, false))}
      </ul>
    </div>
  )
}

let cachedLocal: { track: MediaStreamTrack | null; stream: MediaStream } | null = null
function localCamera(media: JoinMedia): MediaStream | null {
  const track = media.cameraTrack
  if (!track) return null
  if (cachedLocal && cachedLocal.track === track) return cachedLocal.stream
  cachedLocal = { track, stream: new MediaStream([track]) }
  return cachedLocal.stream
}

function mergeAudio(a: Map<string, MediaStream>, b: Map<string, MediaStream>): Map<string, MediaStream> {
  const out = new Map(a)
  for (const [id, s] of b) out.set(`screen-${id}`, s)
  return out
}
