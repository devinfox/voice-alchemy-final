'use client'

/**
 * useRecitalRoom — React glue between the mesh engine, the audio pipeline,
 * the host's live state and the API. All "smart" behaviour lives here so the
 * UI components stay dumb:
 *
 *   • whoever is put on stage switches to the music audio profile, sends
 *     spotlight video and records a pristine local copy;
 *   • everyone else drops to thumbnails and is muted (softly — they can
 *     unmute) the moment a performance starts;
 *   • the host is the source of truth for room state and replays it to
 *     late joiners; the API keeps a durable copy for refreshes.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { RecitalMesh, type PeerConnectionStatus, type PeerStats } from './mesh'
import { RecitalAudioPipeline, type LevelReading } from './audio-pipeline'
import { LocalPerformanceRecorder } from './local-recorder'
import { fetchRecitalIceConfiguration } from './ice'
import {
  INITIAL_LIVE_STATE,
  type ChatMessage,
  type HostCommand,
  type NetQuality,
  type RecitalEnvelope,
  type RecitalLiveState,
  type RecitalPresence,
} from './protocol'
import {
  resolveSettings,
  type RecitalJoinGrant,
  type RecitalParticipant,
  type RecitalPerformance,
  type RecitalSettings,
} from '@/types/recital.types'

export type RoomStatus = 'connecting' | 'connected' | 'ended' | 'removed' | 'error'
export type LocalRecordingStatus = 'idle' | 'recording' | 'uploading' | 'saved' | 'failed'

export interface Toast {
  id: number
  text: string
  tone: 'info' | 'success' | 'warning'
}

export interface Reaction {
  id: number
  emoji: string
  from: string
  at: number
}

export interface UseRecitalRoomArgs {
  grant: RecitalJoinGrant
  pipeline: RecitalAudioPipeline
  cameraTrack: MediaStreamTrack | null
  initialMuted?: boolean
  initialVideoOff?: boolean
}

const authHeaders = (token: string) => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${token}` })

export function useRecitalRoom({ grant, pipeline, cameraTrack, initialMuted = false, initialVideoOff = false }: UseRecitalRoomArgs) {
  const isHost = grant.role === 'host'
  const settings: RecitalSettings = useMemo(() => resolveSettings(grant.recital.settings), [grant.recital.settings])

  const meshRef = useRef<RecitalMesh | null>(null)
  const recorderRef = useRef(new LocalPerformanceRecorder())
  const hostArchiveRef = useRef(new LocalPerformanceRecorder())
  const liveStateRef = useRef<RecitalLiveState>(INITIAL_LIVE_STATE)
  const cameraTrackRef = useRef<MediaStreamTrack | null>(cameraTrack)
  const wasPerformerRef = useRef(false)
  const toastId = useRef(0)
  const reactionId = useRef(0)
  const lastClipBroadcast = useRef(0)

  const [status, setStatus] = useState<RoomStatus>('connecting')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [remoteParticipants, setRemoteParticipants] = useState<RecitalPresence[]>([])
  const [remoteStreams, setRemoteStreams] = useState<Map<string, MediaStream>>(new Map())
  const [peerStatus, setPeerStatus] = useState<Map<string, PeerConnectionStatus>>(new Map())
  const [peerStats, setPeerStats] = useState<Map<string, PeerStats>>(new Map())
  const [net, setNet] = useState<NetQuality>('unknown')
  const [liveState, setLiveStateInner] = useState<RecitalLiveState>(INITIAL_LIVE_STATE)
  const [performances, setPerformances] = useState<RecitalPerformance[]>(grant.performances)
  const [roster, setRoster] = useState<RecitalParticipant[]>(grant.participants)
  const [recitalStatus, setRecitalStatus] = useState(grant.recital.status)
  const [isMuted, setIsMuted] = useState(initialMuted)
  const [isVideoOff, setIsVideoOff] = useState(initialVideoOff || !cameraTrack)
  const [handRaised, setHandRaised] = useState(false)
  const [levels, setLevels] = useState<LevelReading>({ level: 0, rawPeakDb: -120, verdict: 'silent', clipping: false })
  const [toasts, setToasts] = useState<Toast[]>([])
  const [reactions, setReactions] = useState<Reaction[]>([])
  const [localRecording, setLocalRecording] = useState<{ status: LocalRecordingStatus; progress: number }>({ status: 'idle', progress: 0 })
  const [micPreference, setMicPreference] = useState(pipeline.getPreference())
  const [chat, setChat] = useState<ChatMessage[]>([])
  const [unreadChat, setUnreadChat] = useState(0)
  const chatRef = useRef<ChatMessage[]>([])
  const chatOpenRef = useRef(false)

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
        senderRole: grant.role,
        text: trimmed,
        at: Date.now(),
      }
      meshRef.current?.broadcast({ type: 'chat', message })
      appendChat(message)
      setUnreadChat(0)
    },
    [appendChat, grant.displayName, grant.participantId, grant.role]
  )

  const setChatOpen = useCallback((open: boolean) => {
    chatOpenRef.current = open
    if (open) setUnreadChat(0)
  }, [])

  const setLiveState = useCallback((next: RecitalLiveState) => {
    liveStateRef.current = next
    setLiveStateInner(next)
  }, [])

  const pushToast = useCallback((text: string, tone: Toast['tone'] = 'info') => {
    const id = ++toastId.current
    setToasts((prev) => [...prev.slice(-3), { id, text, tone }])
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 5000)
  }, [])

  const isPerformer = liveState.current?.performerParticipantId === grant.participantId
  const currentPerformance = liveState.current

  // ---------------------------------------------------------------- program

  const refreshProgram = useCallback(async () => {
    try {
      const res = await fetch(`/api/recitals/${grant.recital.id}`, { headers: authHeaders(grant.token), cache: 'no-store' })
      if (!res.ok) return
      const data = await res.json()
      setPerformances(data.performances || [])
      setRoster(data.participants || [])
      if (data.recital?.status) setRecitalStatus(data.recital.status)
    } catch {
      // keep what we have
    }
  }, [grant.recital.id, grant.token])

  // ------------------------------------------------------------- host state

  const broadcastState = useCallback(
    (next: RecitalLiveState) => {
      setLiveState(next)
      meshRef.current?.broadcast({ type: 'state', state: next })
    },
    [setLiveState]
  )

  const hostTransition = useCallback(
    async (body: Record<string, unknown>, next: (prev: RecitalLiveState) => RecitalLiveState) => {
      if (!isHost) return
      const nextState = { ...next(liveStateRef.current), version: liveStateRef.current.version + 1 }
      broadcastState(nextState)
      try {
        const res = await fetch(`/api/recitals/${grant.recital.id}/state`, {
          method: 'POST',
          headers: authHeaders(grant.token),
          body: JSON.stringify(body),
        })
        if (res.ok) {
          const data = await res.json()
          setPerformances(data.performances || [])
          if (data.recital?.status) setRecitalStatus(data.recital.status)
          meshRef.current?.broadcast({ type: 'program-updated' })
        } else {
          pushToast('Saved locally, but the server did not confirm. Check your connection.', 'warning')
        }
      } catch {
        pushToast('Saved locally, but the server did not confirm. Check your connection.', 'warning')
      }
    },
    [broadcastState, grant.recital.id, grant.token, isHost, pushToast]
  )

  const startRecital = useCallback(
    () => hostTransition({ action: 'start' }, (prev) => ({ ...prev, phase: prev.current ? 'performing' : 'intermission' })),
    [hostTransition]
  )

  const setPerformer = useCallback(
    (performance: RecitalPerformance) =>
      hostTransition({ action: 'set-performer', performanceId: performance.id }, (prev) => ({
        ...prev,
        phase: 'performing',
        current: {
          performanceId: performance.id,
          performerParticipantId: performance.participant_id,
          performerName: performance.performer_name,
          songTitle: performance.song_title,
          startedAt: Date.now(),
        },
      })),
    [hostTransition]
  )

  const endPerformance = useCallback(
    (outcome: 'done' | 'skipped' = 'done') =>
      hostTransition({ action: 'end-performance', performanceId: liveStateRef.current.current?.performanceId, outcome }, (prev) => ({
        ...prev,
        phase: 'intermission',
        current: null,
      })),
    [hostTransition]
  )

  const endRecital = useCallback(
    () => hostTransition({ action: 'end' }, (prev) => ({ ...prev, phase: 'ended', current: null })),
    [hostTransition]
  )

  const sendHostCommand = useCallback((to: string | '*', cmd: HostCommand) => {
    if (!isHost) return
    if (to === '*') meshRef.current?.broadcast({ type: 'host-command', cmd })
    else meshRef.current?.sendTo(to, { type: 'host-command', cmd })
  }, [isHost])

  const muteAll = useCallback(() => {
    sendHostCommand('*', { command: 'mute-all' })
    pushToast('Everyone has been muted.', 'success')
  }, [pushToast, sendHostCommand])

  const muteParticipant = useCallback((id: string) => sendHostCommand(id, { command: 'mute' }), [sendHostCommand])
  const lowerHand = useCallback((id: string) => sendHostCommand(id, { command: 'lower-hand' }), [sendHostCommand])
  const removeParticipant = useCallback((id: string) => sendHostCommand(id, { command: 'remove' }), [sendHostCommand])

  // ------------------------------------------------------------ local media

  const applyMute = useCallback(
    (muted: boolean, announce?: string) => {
      const track = pipeline.track
      if (track) track.enabled = !muted
      setIsMuted(muted)
      meshRef.current?.updatePresence({ isMuted: muted })
      if (announce) pushToast(announce, 'info')
    },
    [pipeline, pushToast]
  )

  const toggleMute = useCallback(() => {
    const next = !isMuted
    if (!next && liveStateRef.current.phase === 'performing' && !isPerformer && !settings.allowSelfUnmute && !isHost) {
      pushToast('The host has asked the audience to stay muted during performances.', 'warning')
      return
    }
    applyMute(next)
  }, [applyMute, isHost, isMuted, isPerformer, pushToast, settings.allowSelfUnmute])

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
    (value: number) => {
      pipeline.setPreference(value)
      setMicPreference(value)
    },
    [pipeline]
  )

  const leave = useCallback(async () => {
    await meshRef.current?.disconnect()
    meshRef.current = null
    void fetch(`/api/recitals/${grant.recital.id}/participants/${grant.participantId}`, {
      method: 'PATCH',
      headers: authHeaders(grant.token),
      body: JSON.stringify({ left: true }),
      keepalive: true,
    }).catch(() => undefined)
  }, [grant.participantId, grant.recital.id, grant.token])

  // ------------------------------------------------------ local recording

  const stopAndUploadLocal = useCallback(
    async (performanceId: string | null) => {
      const recorder = recorderRef.current
      if (!recorder.isRecording) return
      setLocalRecording({ status: 'uploading', progress: 0 })
      try {
        const file = await recorder.stop()
        if (!file) {
          setLocalRecording({ status: 'idle', progress: 0 })
          return
        }
        await LocalPerformanceRecorder.upload(
          file,
          { recitalId: grant.recital.id, sessionToken: grant.token, performanceId, kind: 'performer-local' },
          (fraction) => setLocalRecording({ status: 'uploading', progress: fraction })
        )
        setLocalRecording({ status: 'saved', progress: 1 })
        pushToast('Your performance was saved.', 'success')
      } catch (err) {
        console.warn('[Recital] local recording upload failed', err)
        setLocalRecording({ status: 'failed', progress: 0 })
        pushToast("We couldn't save your performance recording.", 'warning')
      }
    },
    [grant.recital.id, grant.token, pushToast]
  )

  const stopAndUploadHostArchive = useCallback(
    async (performanceId: string | null) => {
      const recorder = hostArchiveRef.current
      if (!recorder.isRecording) return
      try {
        const file = await recorder.stop()
        if (!file) return
        await LocalPerformanceRecorder.upload(file, {
          recitalId: grant.recital.id,
          sessionToken: grant.token,
          performanceId,
          kind: 'host-archive',
        })
      } catch (err) {
        console.warn('[Recital] host archive upload failed', err)
      }
    },
    [grant.recital.id, grant.token]
  )

  // -------------------------------------------------------------- connect

  useEffect(() => {
    let cancelled = false
    let mesh: RecitalMesh | null = null

    const run = async () => {
      const ice = await fetchRecitalIceConfiguration(grant.token)
      if (cancelled) return

      mesh = new RecitalMesh({
        recitalId: grant.recital.id,
        spotlightBudgetKbps: settings.performerUplinkKbps,
        ice,
        presence: {
          id: grant.participantId,
          name: grant.displayName,
          role: grant.role,
          isMuted: initialMuted,
          isVideoOff: initialVideoOff || !cameraTrack,
          handRaised: false,
          clipping: false,
          net: 'unknown',
          audioProfile: 'talk',
          joinedAt: Date.now(),
        },
        events: {
          onRemoteStream: (peerId, stream) => {
            setRemoteStreams((prev) => {
              if (prev.get(peerId) === stream) return new Map(prev)
              const next = new Map(prev)
              next.set(peerId, stream)
              return next
            })
          },
          onRemoteStreamRemoved: (peerId) => {
            setRemoteStreams((prev) => {
              const next = new Map(prev)
              next.delete(peerId)
              return next
            })
          },
          onPeerStatus: (peerId, s) => {
            setPeerStatus((prev) => {
              const next = new Map(prev)
              if (s === 'closed') next.delete(peerId)
              else next.set(peerId, s)
              return next
            })
          },
          onParticipants: (list) => {
            const remote = list.filter((p) => p.id !== grant.participantId)
            setRemoteParticipants((prev) => {
              // Host replays state to anyone new so late joiners catch up.
              if (isHost) {
                const known = new Set(prev.map((p) => p.id))
                for (const p of remote) {
                  if (!known.has(p.id)) {
                    mesh?.sendTo(p.id, { type: 'state', state: liveStateRef.current })
                    if (chatRef.current.length) mesh?.sendTo(p.id, { type: 'chat-history', messages: chatRef.current.slice(-50) })
                  }
                }
              }
              return remote
            })
          },
          onMessage: (env) => handleMessage(env),
          onStats: ({ overall, peers }) => {
            setNet(overall)
            setPeerStats(new Map(peers))
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
      setStatus('connected')

      if (!isHost) {
        // Ask the host for the current state; the host also pushes on join.
        mesh.broadcast({ type: 'state-request' })
        // Durable fallback for the case where the host is not in the room yet.
        try {
          const res = await fetch(`/api/recitals/${grant.recital.id}/state`, { headers: authHeaders(grant.token), cache: 'no-store' })
          if (res.ok) {
            const data = await res.json()
            if (data.recital?.status === 'ended') setLiveState({ ...liveStateRef.current, phase: 'ended', current: null })
          }
        } catch {
          // ignore
        }
      } else {
        // Host: rebuild live state from the durable copy (refresh-safe).
        const current = grant.performances.find((p) => p.id === grant.recital.current_performance_id) || null
        const phase: RecitalLiveState['phase'] =
          grant.recital.status === 'ended' ? 'ended' : current ? 'performing' : grant.recital.status === 'live' ? 'intermission' : 'lobby'
        broadcastState({
          phase,
          current: current
            ? {
                performanceId: current.id,
                performerParticipantId: current.participant_id,
                performerName: current.performer_name,
                songTitle: current.song_title,
                startedAt: current.started_at ? new Date(current.started_at).getTime() : Date.now(),
              }
            : null,
          hostRecording: false,
          version: 1,
        })
      }
    }

    const handleMessage = (env: RecitalEnvelope) => {
      const { msg, from } = env
      switch (msg.type) {
        case 'state': {
          const senderIsHost = mesh?.getParticipants().find((p) => p.id === from)?.role === 'host'
          if (!senderIsHost && isHost) return
          if (msg.state.version < liveStateRef.current.version) return
          setLiveState(msg.state)
          return
        }
        case 'state-request': {
          if (isHost) mesh?.sendTo(from, { type: 'state', state: liveStateRef.current })
          return
        }
        case 'program-updated': {
          void refreshProgram()
          return
        }
        case 'host-command': {
          const senderIsHost = mesh?.getParticipants().find((p) => p.id === from)?.role === 'host'
          if (!senderIsHost) return
          switch (msg.cmd.command) {
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
        case 'chat': {
          appendChat(msg.message)
          return
        }
        case 'chat-history': {
          if (isHost) return
          for (const m of msg.messages) appendChat(m)
          return
        }
        default:
          return
      }
    }

    void run()

    const onUnload = () => {
      void leave()
    }
    window.addEventListener('beforeunload', onUnload)

    return () => {
      cancelled = true
      window.removeEventListener('beforeunload', onUnload)
      void mesh?.disconnect()
      meshRef.current = null
    }
    // Intentionally connect once per grant; everything else flows through refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [grant.token])

  // ------------------------------------------------ react to state changes

  useEffect(() => {
    const mesh = meshRef.current
    if (!mesh) return
    const current = liveState.current
    const iAmPerformer = current?.performerParticipantId === grant.participantId
    const performing = liveState.phase === 'performing'

    const run = async () => {
      if (iAmPerformer && !wasPerformerRef.current) {
        wasPerformerRef.current = true
        // Freeze calibration for the performance; the music profile begins.
        const track = await pipeline.setProfile('performance')
        if (track) {
          track.enabled = true
          await mesh.setAudioTrack(track)
        }
        setIsMuted(false)
        await mesh.setVideoMode('spotlight')
        mesh.updatePresence({ isMuted: false, audioProfile: 'performance' })
        pushToast("You're on. Everyone else is muted. Enjoy it!", 'success')
        if (settings.localRecording) {
          const processed = pipeline.getProcessedStream()
          const tracks: MediaStreamTrack[] = []
          if (processed) tracks.push(...processed.getAudioTracks())
          if (cameraTrackRef.current) tracks.push(cameraTrackRef.current)
          const ok = recorderRef.current.start(new MediaStream(tracks))
          setLocalRecording({ status: ok ? 'recording' : 'idle', progress: 0 })
        }
      } else if (!iAmPerformer && wasPerformerRef.current) {
        wasPerformerRef.current = false
        const performanceId = liveStateRef.current.current?.performanceId ?? null
        void stopAndUploadLocal(performanceId)
        const track = await pipeline.setProfile('talk')
        if (track) {
          track.enabled = !isMuted
          await mesh.setAudioTrack(track)
        }
        await mesh.setVideoMode(isHost ? 'spotlight' : settings.audienceVideo ? 'thumbnail' : 'off')
        mesh.updatePresence({ audioProfile: 'talk' })
        pushToast('Thank you! That was wonderful.', 'success')
      }

      if (!iAmPerformer) {
        // Host is the visible face between pieces; thumbnails while someone performs.
        if (isHost) await mesh.setVideoMode(performing ? 'thumbnail' : 'spotlight')
        if (performing) {
          if (!isMuted) applyMute(true, isHost ? 'Muted while the performance runs. Unmute anytime.' : 'Muted for the performance. Unmute anytime.')
        }
      }
    }
    void run()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveState.current?.performanceId, liveState.current?.performerParticipantId, liveState.phase])

  // Host archive: record what we receive from the performer.
  const currentForArchive = liveState.current
  useEffect(() => {
    if (!isHost || !settings.hostArchive) return
    const performerId = currentForArchive?.performerParticipantId
    const recorder = hostArchiveRef.current
    if (liveState.phase === 'performing' && performerId && performerId !== grant.participantId) {
      const stream = remoteStreams.get(performerId)
      if (stream && !recorder.isRecording) {
        recorder.start(stream)
        setLiveStateInner((prev) => (prev.hostRecording ? prev : { ...prev, hostRecording: true }))
      }
      return
    }
    if (recorder.isRecording) {
      void stopAndUploadHostArchive(liveStateRef.current.current?.performanceId ?? null)
    }
  }, [grant.participantId, isHost, currentForArchive, liveState.phase, remoteStreams, settings.hostArchive, stopAndUploadHostArchive])

  // Ended.
  useEffect(() => {
    if (liveState.phase === 'ended' || recitalStatus === 'ended') {
      setStatus((s) => (s === 'removed' ? s : 'ended'))
    }
  }, [liveState.phase, recitalStatus])

  // Level meter + automatic calibration + clip telemetry.
  useEffect(() => {
    let frames = 0
    const timer = setInterval(() => {
      const reading = pipeline.read()
      frames++
      if (frames % 3 === 0) setLevels(reading)
      // Level automatically while people talk; freeze on stage.
      if (!wasPerformerRef.current && frames % 10 === 0) pipeline.autoCalibrate()
      const mesh = meshRef.current
      if (mesh && reading.clipping !== mesh.getPresence().clipping && Date.now() - lastClipBroadcast.current > 1500) {
        lastClipBroadcast.current = Date.now()
        mesh.updatePresence({ clipping: reading.clipping })
      }
    }, 100)
    return () => clearInterval(timer)
  }, [pipeline])

  // Keep the camera ref fresh if the caller swaps cameras.
  useEffect(() => {
    cameraTrackRef.current = cameraTrack
    if (meshRef.current) void meshRef.current.setVideoTrack(cameraTrack)
  }, [cameraTrack])

  // Clear old reactions.
  useEffect(() => {
    if (reactions.length === 0) return
    const timer = setTimeout(() => setReactions((prev) => prev.filter((r) => Date.now() - r.at < 4000)), 4200)
    return () => clearTimeout(timer)
  }, [reactions])

  const me: RecitalPresence = useMemo(
    () => ({
      id: grant.participantId,
      name: grant.displayName,
      role: grant.role,
      isMuted,
      isVideoOff,
      handRaised,
      clipping: levels.clipping,
      net,
      audioProfile: isPerformer ? 'performance' : 'talk',
      joinedAt: 0,
    }),
    [grant.displayName, grant.participantId, grant.role, handRaised, isMuted, isPerformer, isVideoOff, levels.clipping, net]
  )

  return {
    status,
    errorMessage,
    settings,
    isHost,
    me,
    remoteParticipants,
    remoteStreams,
    peerStatus,
    peerStats,
    net,
    liveState,
    currentPerformance,
    isPerformer,
    performances,
    roster,
    recitalStatus,
    levels,
    toasts,
    reactions,
    localRecording,
    micPreference,
    chat,
    unreadChat,
    actions: {
      sendChat,
      setChatOpen,
      toggleMute,
      toggleVideo,
      toggleHand,
      sendReaction,
      setMicPreference: setMicPreferenceValue,
      leave,
      refreshProgram,
      pushToast,
    },
    host: {
      startRecital,
      setPerformer,
      endPerformance,
      endRecital,
      muteAll,
      muteParticipant,
      lowerHand,
      removeParticipant,
    },
  }
}

export type RecitalRoomApi = ReturnType<typeof useRecitalRoom>
