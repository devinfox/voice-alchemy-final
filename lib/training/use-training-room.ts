'use client'

/**
 * useTrainingRoom — community session glue: waiting room + admission, host
 * screen share, chat, hand raise, reactions, host moderation. Same mesh as
 * recitals; everyone talks on the normal speech profile.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { RecitalMesh, type PeerConnectionStatus } from '@/lib/recital/mesh'
import { RecitalAudioPipeline, type LevelReading } from '@/lib/recital/audio-pipeline'
import { fetchRecitalIceConfiguration } from '@/lib/recital/ice'
import type { ChatMessage, HostCommand, NetQuality, RecitalEnvelope, RecitalPresence } from '@/lib/recital/protocol'
import type { Reaction, Toast } from '@/lib/recital/use-recital-room'
import { resolveTrainingSettings, type TrainingJoinGrant } from '@/types/training.types'

export type TrainingRoomStatus = 'connecting' | 'waiting' | 'connected' | 'denied' | 'ended' | 'removed' | 'error'
export type TrainingPhase = 'lobby' | 'live' | 'ended'

interface TrainingLiveState {
  phase: TrainingPhase
  version: number
}

interface Args {
  grant: TrainingJoinGrant
  pipeline: RecitalAudioPipeline
  cameraTrack: MediaStreamTrack | null
  initialMuted?: boolean
  initialVideoOff?: boolean
}

const authHeaders = (token: string) => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${token}` })

export function useTrainingRoom({ grant, pipeline, cameraTrack, initialMuted = false, initialVideoOff = false }: Args) {
  const isHost = grant.role === 'host'
  const settings = useMemo(() => resolveTrainingSettings(grant.session.settings), [grant.session.settings])
  const meshRef = useRef<RecitalMesh | null>(null)
  const cameraTrackRef = useRef(cameraTrack)
  const screenStreamRef = useRef<MediaStream | null>(null)
  const stateRef = useRef<TrainingLiveState>({ phase: 'lobby', version: 0 })
  const chatRef = useRef<ChatMessage[]>([])
  const chatOpenRef = useRef(false)
  const toastId = useRef(0)
  const reactionId = useRef(0)

  const [status, setStatus] = useState<TrainingRoomStatus>('connecting')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [remoteParticipants, setRemoteParticipants] = useState<RecitalPresence[]>([])
  const [remoteStreams, setRemoteStreams] = useState<Map<string, MediaStream>>(new Map())
  const [remoteScreens, setRemoteScreens] = useState<Map<string, MediaStream>>(new Map())
  const [peerStatus, setPeerStatus] = useState<Map<string, PeerConnectionStatus>>(new Map())
  const [net, setNet] = useState<NetQuality>('unknown')
  const [liveState, setLiveStateInner] = useState<TrainingLiveState>(stateRef.current)
  const [isMuted, setIsMuted] = useState(initialMuted)
  const [isVideoOff, setIsVideoOff] = useState(initialVideoOff || !cameraTrack)
  const [handRaised, setHandRaised] = useState(false)
  const [sharingScreen, setSharingScreen] = useState(false)
  const [localScreen, setLocalScreen] = useState<MediaStream | null>(null)
  const [levels, setLevels] = useState<LevelReading>({ level: 0, rawPeakDb: -120, verdict: 'silent', clipping: false })
  const [toasts, setToasts] = useState<Toast[]>([])
  const [reactions, setReactions] = useState<Reaction[]>([])
  const [chat, setChat] = useState<ChatMessage[]>([])
  const [unreadChat, setUnreadChat] = useState(0)
  const [micPreference, setMicPreference] = useState(pipeline.getPreference())

  const setLiveState = useCallback((s: TrainingLiveState) => {
    stateRef.current = s
    setLiveStateInner(s)
  }, [])

  const pushToast = useCallback((text: string, tone: Toast['tone'] = 'info') => {
    const id = ++toastId.current
    setToasts((prev) => [...prev.slice(-3), { id, text, tone }])
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 5000)
  }, [])

  const appendChat = useCallback((message: ChatMessage) => {
    if (chatRef.current.some((m) => m.id === message.id)) return
    chatRef.current = [...chatRef.current.slice(-199), message]
    setChat(chatRef.current)
    if (!chatOpenRef.current) setUnreadChat((n) => n + 1)
  }, [])

  const sendChat = useCallback(
    (text: string) => {
      const trimmed = text.replace(/\s+/g, ' ').trim().slice(0, 500)
      if (!trimmed) return
      const message: ChatMessage = {
        id: `${grant.participantId}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        from: grant.participantId,
        senderName: grant.displayName,
        senderRole: isHost ? 'host' : 'audience',
        text: trimmed,
        at: Date.now(),
      }
      meshRef.current?.broadcast({ type: 'chat', message })
      appendChat(message)
      setUnreadChat(0)
    },
    [appendChat, grant.displayName, grant.participantId, isHost]
  )

  const setChatOpen = useCallback((open: boolean) => {
    chatOpenRef.current = open
    if (open) setUnreadChat(0)
  }, [])

  // ------------------------------------------------------------ local media

  const applyMute = useCallback(
    (muted: boolean, announce?: string) => {
      const track = pipeline.track
      if (track) track.enabled = !muted
      setIsMuted(muted)
      meshRef.current?.updatePresence({ isMuted: muted })
      if (announce) pushToast(announce)
    },
    [pipeline, pushToast]
  )

  const toggleMute = useCallback(() => {
    const next = !isMuted
    if (!next && !isHost && !settings.allowSelfUnmute) {
      pushToast('The host has asked attendees to stay muted. Raise your hand to speak.', 'warning')
      return
    }
    applyMute(next)
  }, [applyMute, isHost, isMuted, pushToast, settings.allowSelfUnmute])

  const toggleVideo = useCallback(() => {
    const track = cameraTrackRef.current
    if (!track) return
    const next = !isVideoOff
    track.enabled = !next
    setIsVideoOff(next)
    meshRef.current?.updatePresence({ isVideoOff: next })
  }, [isVideoOff])

  const toggleHand = useCallback(() => {
    const next = !handRaised
    setHandRaised(next)
    meshRef.current?.updatePresence({ handRaised: next })
  }, [handRaised])

  const sendReaction = useCallback(
    (emoji: string) => {
      meshRef.current?.broadcast({ type: 'reaction', emoji })
      const id = ++reactionId.current
      setReactions((prev) => [...prev.slice(-30), { id, emoji, from: grant.participantId, at: Date.now() }])
    },
    [grant.participantId]
  )

  const setMicPreferenceValue = useCallback(
    (v: number) => {
      pipeline.setPreference(v)
      setMicPreference(v)
    },
    [pipeline]
  )

  const stopScreenShare = useCallback(async () => {
    const stream = screenStreamRef.current
    screenStreamRef.current = null
    stream?.getTracks().forEach((t) => t.stop())
    setLocalScreen(null)
    setSharingScreen(false)
    await meshRef.current?.setScreenTracks(null, null)
  }, [])

  const startScreenShare = useCallback(async () => {
    if (!isHost) return
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: { ideal: 15, max: 30 }, width: { max: 1920 }, height: { max: 1080 } },
        audio: true,
      })
      const video = stream.getVideoTracks()[0]
      const audio = stream.getAudioTracks()[0] ?? null
      if (!video) return
      try {
        video.contentHint = 'detail'
      } catch {
        // unsupported
      }
      video.onended = () => void stopScreenShare()
      screenStreamRef.current = stream
      setLocalScreen(new MediaStream([video]))
      setSharingScreen(true)
      await meshRef.current?.setScreenTracks(video, audio)
    } catch {
      // user cancelled the picker
    }
  }, [isHost, stopScreenShare])

  const leave = useCallback(async () => {
    await stopScreenShare()
    await meshRef.current?.disconnect()
    meshRef.current = null
    void fetch(`/api/training-sessions/${grant.session.id}/participants/${grant.participantId}`, {
      method: 'PATCH',
      headers: authHeaders(grant.token),
      body: JSON.stringify({ left: true }),
      keepalive: true,
    }).catch(() => undefined)
  }, [grant.participantId, grant.session.id, grant.token, stopScreenShare])

  // --------------------------------------------------------------- host ops

  const broadcastState = useCallback(
    (next: TrainingLiveState) => {
      setLiveState(next)
      meshRef.current?.broadcast({ type: 'state', state: { phase: next.phase === 'live' ? 'intermission' : next.phase, current: null, hostRecording: false, version: next.version } })
    },
    [setLiveState]
  )

  const transition = useCallback(
    async (action: 'start' | 'end') => {
      if (!isHost) return
      const next: TrainingLiveState = { phase: action === 'start' ? 'live' : 'ended', version: stateRef.current.version + 1 }
      broadcastState(next)
      await fetch(`/api/training-sessions/${grant.session.id}/state`, {
        method: 'POST',
        headers: authHeaders(grant.token),
        body: JSON.stringify({ action }),
      }).catch(() => pushToast('Saved locally, but the server did not confirm.', 'warning'))
    },
    [broadcastState, grant.session.id, grant.token, isHost, pushToast]
  )

  const sendHostCommand = useCallback(
    (to: string | '*', cmd: HostCommand) => {
      if (!isHost) return
      if (to === '*') meshRef.current?.broadcast({ type: 'host-command', cmd })
      else meshRef.current?.sendTo(to, { type: 'host-command', cmd })
    },
    [isHost]
  )

  const admit = useCallback(
    async (participantId: string) => {
      if (!isHost) return
      await fetch(`/api/training-sessions/${grant.session.id}/participants/${participantId}`, {
        method: 'PATCH',
        headers: authHeaders(grant.token),
        body: JSON.stringify({ admit: true }),
      }).catch(() => undefined)
      sendHostCommand(participantId, { command: 'admit' })
      if (chatRef.current.length) meshRef.current?.sendTo(participantId, { type: 'chat-history', messages: chatRef.current.slice(-50) })
    },
    [grant.session.id, grant.token, isHost, sendHostCommand]
  )

  const deny = useCallback(
    async (participantId: string) => {
      if (!isHost) return
      await fetch(`/api/training-sessions/${grant.session.id}/participants/${participantId}`, {
        method: 'PATCH',
        headers: authHeaders(grant.token),
        body: JSON.stringify({ deny: true }),
      }).catch(() => undefined)
      sendHostCommand(participantId, { command: 'deny' })
    },
    [grant.session.id, grant.token, isHost, sendHostCommand]
  )

  const admitAll = useCallback(() => {
    remoteParticipants.filter((p) => p.waiting).forEach((p) => void admit(p.id))
  }, [admit, remoteParticipants])

  const muteAll = useCallback(() => {
    sendHostCommand('*', { command: 'mute-all' })
    pushToast('Everyone has been muted.', 'success')
  }, [pushToast, sendHostCommand])
  const muteParticipant = useCallback((id: string) => sendHostCommand(id, { command: 'mute' }), [sendHostCommand])
  const lowerHand = useCallback((id: string) => sendHostCommand(id, { command: 'lower-hand' }), [sendHostCommand])
  const removeParticipant = useCallback((id: string) => sendHostCommand(id, { command: 'remove' }), [sendHostCommand])

  // ---------------------------------------------------------------- connect

  useEffect(() => {
    let cancelled = false
    let mesh: RecitalMesh | null = null

    const handleMessage = (env: RecitalEnvelope) => {
      const { msg, from } = env
      const senderIsHost = () => mesh?.getParticipants().find((p) => p.id === from)?.role === 'host'
      switch (msg.type) {
        case 'state': {
          if (!senderIsHost() || msg.state.version < stateRef.current.version) return
          const phase: TrainingPhase = msg.state.phase === 'ended' ? 'ended' : msg.state.phase === 'lobby' ? 'lobby' : 'live'
          setLiveState({ phase, version: msg.state.version })
          return
        }
        case 'state-request': {
          if (isHost) mesh?.sendTo(from, { type: 'state', state: { phase: stateRef.current.phase === 'live' ? 'intermission' : stateRef.current.phase, current: null, hostRecording: false, version: stateRef.current.version } })
          return
        }
        case 'host-command': {
          if (!senderIsHost()) return
          switch (msg.cmd.command) {
            case 'admit':
              mesh?.updatePresence({ waiting: false })
              mesh?.reconcilePeers()
              setStatus('connected')
              pushToast(`Welcome! ${grant.hostName} let you in.`, 'success')
              return
            case 'deny':
              void leave()
              setStatus('denied')
              return
            case 'mute':
            case 'mute-all':
              applyMute(true, 'The host muted your microphone.')
              return
            case 'lower-hand':
              setHandRaised(false)
              mesh?.updatePresence({ handRaised: false })
              return
            case 'remove':
              void leave()
              setStatus('removed')
              return
          }
          return
        }
        case 'reaction': {
          const id = ++reactionId.current
          setReactions((prev) => [...prev.slice(-30), { id, emoji: msg.emoji, from, at: Date.now() }])
          return
        }
        case 'chat':
          appendChat(msg.message)
          return
        case 'chat-history':
          if (!isHost) for (const m of msg.messages) appendChat(m)
          return
        default:
          return
      }
    }

    const run = async () => {
      const ice = await fetchRecitalIceConfiguration(grant.token)
      if (cancelled) return
      mesh = new RecitalMesh({
        recitalId: `training-${grant.session.id}`,
        spotlightBudgetKbps: settings.uplinkKbps,
        ice,
        shouldConnect: (p) => !p.waiting,
        presence: {
          id: grant.participantId,
          name: grant.displayName,
          role: isHost ? 'host' : 'audience',
          isMuted: initialMuted,
          isVideoOff: initialVideoOff || !cameraTrack,
          handRaised: false,
          clipping: false,
          net: 'unknown',
          audioProfile: 'talk',
          waiting: !grant.admitted,
          joinedAt: Date.now(),
        },
        events: {
          onRemoteStream: (peerId, stream) => setRemoteStreams((prev) => new Map(prev).set(peerId, stream)),
          onRemoteStreamRemoved: (peerId) =>
            setRemoteStreams((prev) => {
              const next = new Map(prev)
              next.delete(peerId)
              return next
            }),
          onRemoteScreen: (peerId, stream) =>
            setRemoteScreens((prev) => {
              const next = new Map(prev)
              if (stream) next.set(peerId, stream)
              else next.delete(peerId)
              return next
            }),
          onPeerStatus: (peerId, s) =>
            setPeerStatus((prev) => {
              const next = new Map(prev)
              if (s === 'closed') next.delete(peerId)
              else next.set(peerId, s)
              return next
            }),
          onParticipants: (list) => {
            const remote = list.filter((p) => p.id !== grant.participantId)
            setRemoteParticipants((prev) => {
              if (isHost) {
                const known = new Set(prev.map((p) => p.id))
                for (const p of remote) {
                  if (known.has(p.id)) continue
                  mesh?.sendTo(p.id, { type: 'state', state: { phase: stateRef.current.phase === 'live' ? 'intermission' : stateRef.current.phase, current: null, hostRecording: false, version: stateRef.current.version } })
                  if (chatRef.current.length && !p.waiting) mesh?.sendTo(p.id, { type: 'chat-history', messages: chatRef.current.slice(-50) })
                  if (p.waiting) pushToast(`${p.name} is waiting to join.`)
                }
              }
              return remote
            })
          },
          onMessage: handleMessage,
          onStats: ({ overall }) => {
            setNet(overall)
            if (mesh && mesh.getPresence().net !== overall) mesh.updatePresence({ net: overall })
          },
        },
      })
      meshRef.current = mesh

      const audioTrack = pipeline.track
      if (audioTrack) audioTrack.enabled = !initialMuted
      if (cameraTrack) cameraTrack.enabled = !initialVideoOff
      await mesh.setAudioTrack(audioTrack)
      await mesh.setVideoTrack(cameraTrack)
      await mesh.setVideoMode(isHost ? 'spotlight' : settings.audienceVideo ? 'thumbnail' : 'off')

      try {
        await mesh.connect()
      } catch (err) {
        if (cancelled) return
        setErrorMessage(err instanceof Error ? err.message : 'Could not connect')
        setStatus('error')
        return
      }
      if (cancelled) return
      setStatus(grant.admitted ? 'connected' : 'waiting')

      if (isHost) {
        const phase: TrainingPhase = grant.session.status === 'ended' ? 'ended' : grant.session.status === 'live' ? 'live' : 'lobby'
        broadcastState({ phase, version: 1 })
      } else {
        mesh.broadcast({ type: 'state-request' })
      }
    }

    void run()
    const onUnload = () => void leave()
    window.addEventListener('beforeunload', onUnload)
    return () => {
      cancelled = true
      window.removeEventListener('beforeunload', onUnload)
      void mesh?.disconnect()
      meshRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [grant.token])

  useEffect(() => {
    if (liveState.phase === 'ended') setStatus((s) => (s === 'removed' || s === 'denied' ? s : 'ended'))
  }, [liveState.phase])

  useEffect(() => {
    let frames = 0
    const timer = setInterval(() => {
      const reading = pipeline.read()
      if (++frames % 3 === 0) setLevels(reading)
      if (frames % 10 === 0) pipeline.autoCalibrate()
    }, 100)
    return () => clearInterval(timer)
  }, [pipeline])

  useEffect(() => {
    cameraTrackRef.current = cameraTrack
    if (meshRef.current) void meshRef.current.setVideoTrack(cameraTrack)
  }, [cameraTrack])

  useEffect(() => {
    if (reactions.length === 0) return
    const timer = setTimeout(() => setReactions((prev) => prev.filter((r) => Date.now() - r.at < 4000)), 4200)
    return () => clearTimeout(timer)
  }, [reactions])

  const me: RecitalPresence = useMemo(
    () => ({
      id: grant.participantId,
      name: grant.displayName,
      role: isHost ? 'host' : 'audience',
      isMuted,
      isVideoOff,
      handRaised,
      clipping: levels.clipping,
      net,
      audioProfile: 'talk',
      sharingScreen,
      joinedAt: 0,
    }),
    [grant.displayName, grant.participantId, handRaised, isHost, isMuted, isVideoOff, levels.clipping, net, sharingScreen]
  )

  return {
    status,
    errorMessage,
    settings,
    isHost,
    me,
    remoteParticipants,
    remoteStreams,
    remoteScreens,
    localScreen,
    sharingScreen,
    peerStatus,
    net,
    liveState,
    levels,
    toasts,
    reactions,
    chat,
    unreadChat,
    micPreference,
    actions: { toggleMute, toggleVideo, toggleHand, sendReaction, sendChat, setChatOpen, setMicPreference: setMicPreferenceValue, startScreenShare, stopScreenShare, leave, pushToast },
    host: { start: () => transition('start'), end: () => transition('end'), admit, deny, admitAll, muteAll, muteParticipant, lowerHand, removeParticipant },
  }
}
