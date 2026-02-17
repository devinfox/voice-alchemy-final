'use client'

import { useEffect, useRef, useState, useCallback, useImperativeHandle, forwardRef } from 'react'
import {
  Video,
  VideoOff,
  Mic,
  MicOff,
  Monitor,
  MonitorOff,
  Circle,
  StopCircle,
  MessageSquare,
  Users,
  Send,
  X,
  Volume2,
  VolumeX,
} from 'lucide-react'
import { WebRTCSignaling, Participant, SignalingMessage } from '@/lib/webrtc-signaling'
import { clearSharedMicStream, setSharedMicStream } from '@/lib/shared-mic-stream'

export interface VideoWebRTCHandle {
  disconnect: () => Promise<void>
  reconnect: () => void
  stopRecording: () => Promise<Blob | null>
  isRecording: () => boolean
}

interface VideoWebRTCProps {
  roomId: string
  participantId: string
  participantName: string
  isHost: boolean
  canJoin: boolean
  autoRecord?: boolean
  className?: string
  isMiniPlayer?: boolean
  onRecordingComplete?: (blob: Blob) => Promise<void> | void
  onError?: (error: Error) => void
}

interface ChatMessage {
  id: string
  from: string
  name: string
  message: string
  timestamp: number
}

interface PeerConnection {
  participantId: string
  connection: RTCPeerConnection
  stream: MediaStream | null
  makingOffer: boolean  // Track if we're currently creating an offer
  ignoreOffer: boolean  // Track if we should ignore incoming offers
}

// ICE servers for NAT traversal
const ICE_SERVERS: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
  ],
}

const VideoWebRTC = forwardRef<VideoWebRTCHandle, VideoWebRTCProps>(function VideoWebRTC({
  roomId,
  participantId,
  participantName,
  isHost,
  canJoin,
  autoRecord = false,
  className,
  isMiniPlayer = false,
  onRecordingComplete,
  onError,
}, ref) {
  const localVideoRef = useRef<HTMLVideoElement>(null)
  const localStreamRef = useRef<MediaStream | null>(null)
  const signalingRef = useRef<WebRTCSignaling | null>(null)
  const peerConnectionsRef = useRef<Map<string, PeerConnection>>(new Map())
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const recordedChunksRef = useRef<Blob[]>([])
  const combinedStreamRef = useRef<MediaStream | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const animationFrameRef = useRef<number | null>(null)
  const mountedRef = useRef(true)
  const initializingRef = useRef(false) // Track if currently initializing to prevent double-init
  const userDisconnectedRef = useRef(false) // Track if user explicitly disconnected (prevents auto-reconnect)
  const recordingTimeoutRef = useRef<NodeJS.Timeout | null>(null) // 2-hour auto-stop timer
  const recordingStartTimeRef = useRef<number | null>(null) // Track when recording started
  const sharedMicOwnerIdRef = useRef(`video-webrtc:${roomId}:${participantId}`)

  // Recording duration limit: 2 hours in milliseconds
  const RECORDING_MAX_DURATION = 2 * 60 * 60 * 1000 // 2 hours

  // Use refs for values that shouldn't trigger effect re-runs
  const participantIdRef = useRef(participantId)
  const participantNameRef = useRef(participantName)
  const isHostRef = useRef(isHost)

  // Update refs when props change (without triggering effects)
  useEffect(() => {
    participantIdRef.current = participantId
    participantNameRef.current = participantName
    isHostRef.current = isHost
  }, [participantId, participantName, isHost])

  const [isInitialized, setIsInitialized] = useState(false)
  const [hasLocalStream, setHasLocalStream] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isConnected, setIsConnected] = useState(false)

  // Media states
  const [isMuted, setIsMuted] = useState(false)
  const [isVideoOff, setIsVideoOff] = useState(false)
  const [isScreenSharing, setIsScreenSharing] = useState(false)
  const [isRecording, setIsRecording] = useState(false)

  // Remote streams
  const [remoteStreams, setRemoteStreams] = useState<Map<string, MediaStream>>(new Map())

  // Counter to force re-initialization when reconnect() is called
  const [initTrigger, setInitTrigger] = useState(0)

  // Participants
  const [participants, setParticipants] = useState<Participant[]>([])

  // UI state
  const [showChat, setShowChat] = useState(false)
  const [showParticipants, setShowParticipants] = useState(false)

  // Chat
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
  const [chatInput, setChatInput] = useState('')
  const chatContainerRef = useRef<HTMLDivElement>(null)

  // Determine if we should be the "polite" peer (yields to incoming offers on collision)
  const isPolite = useCallback((remoteId: string) => {
    return participantIdRef.current < remoteId
  }, [])

  // Create peer connection for a remote participant
  const createPeerConnection = useCallback((remoteParticipantId: string) => {
    if (peerConnectionsRef.current.has(remoteParticipantId)) {
      return peerConnectionsRef.current.get(remoteParticipantId)!.connection
    }

    console.log(`[VideoWebRTC] Creating peer connection to ${remoteParticipantId}`)

    const pc = new RTCPeerConnection(ICE_SERVERS)

    // Add local tracks to the connection
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => {
        console.log(`[VideoWebRTC] Adding local track: ${track.kind}`)
        pc.addTrack(track, localStreamRef.current!)
      })
    }

    // Handle incoming tracks
    pc.ontrack = (event) => {
      console.log(`[VideoWebRTC] Received remote track from ${remoteParticipantId}:`, event.track.kind, 'enabled:', event.track.enabled, 'readyState:', event.track.readyState)
      const [remoteStream] = event.streams
      if (remoteStream) {
        // Log all tracks in the stream
        console.log(`[VideoWebRTC] Remote stream ${remoteStream.id} has ${remoteStream.getTracks().length} tracks`)
        remoteStream.getTracks().forEach((t, i) => {
          console.log(`[VideoWebRTC]   Track ${i}: ${t.kind}, enabled=${t.enabled}, readyState=${t.readyState}`)
        })

        setRemoteStreams(prev => {
          const newMap = new Map(prev)
          newMap.set(remoteParticipantId, remoteStream)
          return newMap
        })
      }
    }

    // Handle ICE candidates
    pc.onicecandidate = (event) => {
      if (event.candidate && signalingRef.current) {
        signalingRef.current.sendSignal(remoteParticipantId, 'ice-candidate', {
          candidate: event.candidate.toJSON(),
        })
      }
    }

    // Connection state changes
    pc.onconnectionstatechange = () => {
      console.log(`[VideoWebRTC] Connection state with ${remoteParticipantId}: ${pc.connectionState}`)
      if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
        setRemoteStreams(prev => {
          const newMap = new Map(prev)
          newMap.delete(remoteParticipantId)
          return newMap
        })
      }
    }

    // ICE connection state changes (more detailed)
    pc.oniceconnectionstatechange = () => {
      console.log(`[VideoWebRTC] ICE connection state with ${remoteParticipantId}: ${pc.iceConnectionState}`)
      if (pc.iceConnectionState === 'failed') {
        console.error(`[VideoWebRTC] ICE connection failed with ${remoteParticipantId}. This may indicate NAT traversal issues.`)
      }
    }

    // ICE gathering state
    pc.onicegatheringstatechange = () => {
      console.log(`[VideoWebRTC] ICE gathering state with ${remoteParticipantId}: ${pc.iceGatheringState}`)
    }

    // Store peer connection info BEFORE setting up onnegotiationneeded
    const peerInfo: PeerConnection = {
      participantId: remoteParticipantId,
      connection: pc,
      stream: null,
      makingOffer: false,
      ignoreOffer: false,
    }
    peerConnectionsRef.current.set(remoteParticipantId, peerInfo)

    // Handle negotiation needed - implements "perfect negotiation" pattern
    pc.onnegotiationneeded = async () => {
      const peer = peerConnectionsRef.current.get(remoteParticipantId)
      if (!peer) return

      // Only the impolite peer initiates offers
      if (isPolite(remoteParticipantId)) {
        console.log(`[VideoWebRTC] Skipping negotiation - we are polite peer for ${remoteParticipantId}`)
        return
      }

      try {
        peer.makingOffer = true
        console.log(`[VideoWebRTC] Creating offer for ${remoteParticipantId}`)

        // Use setLocalDescription() without argument to auto-generate offer
        await pc.setLocalDescription()

        if (signalingRef.current && pc.localDescription) {
          signalingRef.current.sendSignal(remoteParticipantId, 'offer', {
            sdp: pc.localDescription.toJSON(),
          })
        }
      } catch (err) {
        console.error('[VideoWebRTC] Error in negotiation:', err)
      } finally {
        peer.makingOffer = false
      }
    }

    return pc
  }, [isPolite])

  // Send offer to a remote participant
  const sendOffer = useCallback(async (remoteParticipantId: string) => {
    const peer = peerConnectionsRef.current.get(remoteParticipantId)
    if (!peer) return

    // Don't create offer if we're already making one
    if (peer.makingOffer) {
      console.log(`[VideoWebRTC] Already making offer to ${remoteParticipantId}, skipping`)
      return
    }

    const pc = peer.connection
    try {
      peer.makingOffer = true
      console.log(`[VideoWebRTC] Sending offer to ${remoteParticipantId}`)

      // Use setLocalDescription() without argument for auto-generation
      await pc.setLocalDescription()

      if (signalingRef.current && pc.localDescription) {
        signalingRef.current.sendSignal(remoteParticipantId, 'offer', {
          sdp: pc.localDescription.toJSON(),
        })
      }
    } catch (err) {
      console.error('[VideoWebRTC] Error creating offer:', err)
    } finally {
      peer.makingOffer = false
    }
  }, [])

  // Handle incoming offer - implements "perfect negotiation" pattern
  const handleOffer = useCallback(async (message: SignalingMessage) => {
    const fromId = message.from

    let peer = peerConnectionsRef.current.get(fromId)
    if (!peer) {
      createPeerConnection(fromId)
      peer = peerConnectionsRef.current.get(fromId)!
    }

    const pc = peer.connection

    try {
      // Detect offer collision
      const offerCollision = peer.makingOffer || pc.signalingState !== 'stable'

      // Determine if we should ignore this offer
      // We're polite if our ID < fromId, impolite if our ID >= fromId
      // Polite peer yields to incoming offers, impolite peer ignores them on collision
      const weArePolite = isPolite(fromId)
      peer.ignoreOffer = !weArePolite && offerCollision

      if (peer.ignoreOffer) {
        console.log(`[VideoWebRTC] Ignoring offer from ${fromId} due to collision (we are impolite)`)
        return
      }

      console.log(`[VideoWebRTC] Processing offer from ${fromId}, collision=${offerCollision}, weArePolite=${weArePolite}`)

      // If there's a collision and we're polite, we need to rollback
      // Use setRemoteDescription directly - it will handle rollback automatically in modern browsers
      await pc.setRemoteDescription(new RTCSessionDescription(message.payload.sdp))

      // Create and set answer
      await pc.setLocalDescription()

      if (signalingRef.current && pc.localDescription) {
        signalingRef.current.sendSignal(fromId, 'answer', {
          sdp: pc.localDescription.toJSON(),
        })
        console.log(`[VideoWebRTC] Sent answer to ${fromId}`)
      }
    } catch (err) {
      console.error('[VideoWebRTC] Error handling offer:', err)
    }
  }, [createPeerConnection, isPolite])

  // Handle incoming answer
  const handleAnswer = useCallback(async (message: SignalingMessage) => {
    const fromId = message.from
    const peer = peerConnectionsRef.current.get(fromId)
    if (!peer) return

    const pc = peer.connection
    try {
      // Only set remote description if we're in the right state
      if (pc.signalingState === 'have-local-offer') {
        console.log(`[VideoWebRTC] Received answer from ${fromId}`)
        await pc.setRemoteDescription(new RTCSessionDescription(message.payload.sdp))
        console.log(`[VideoWebRTC] Answer processed, connection state: ${pc.connectionState}`)
      } else {
        console.log(`[VideoWebRTC] Ignoring answer from ${fromId}, wrong state: ${pc.signalingState}`)
      }
    } catch (err) {
      console.error('[VideoWebRTC] Error handling answer:', err)
    }
  }, [])

  // Handle incoming ICE candidate
  const handleIceCandidate = useCallback(async (message: SignalingMessage) => {
    const fromId = message.from
    const peer = peerConnectionsRef.current.get(fromId)
    if (!peer) {
      console.log(`[VideoWebRTC] Received ICE candidate from unknown peer: ${fromId}`)
      return
    }

    const pc = peer.connection
    if (!message.payload.candidate) return

    try {
      // Only add ICE candidate if we have a remote description
      // Modern browsers should queue these automatically, but let's be safe
      if (pc.remoteDescription) {
        await pc.addIceCandidate(new RTCIceCandidate(message.payload.candidate))
        console.log(`[VideoWebRTC] Added ICE candidate from ${fromId}`)
      } else {
        console.log(`[VideoWebRTC] Queuing ICE candidate from ${fromId} (no remote description yet)`)
        // The browser should queue this automatically, but log it for debugging
        await pc.addIceCandidate(new RTCIceCandidate(message.payload.candidate))
      }
    } catch (err) {
      // Ignore errors for candidates that arrive after connection is established
      if (pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed') {
        console.log(`[VideoWebRTC] Ignoring late ICE candidate from ${fromId}`)
      } else {
        console.error('[VideoWebRTC] Error adding ICE candidate:', err)
      }
    }
  }, [])

  // Handle participant joined
  const handleParticipantJoined = useCallback((message: SignalingMessage) => {
    const remoteId = message.payload.id
    if (remoteId === participantIdRef.current) return

    console.log(`[VideoWebRTC] Participant joined: ${remoteId}`)

    if (!localStreamRef.current) {
      console.log(`[VideoWebRTC] No local stream yet, can't create peer connection for ${remoteId}`)
      return
    }

    // Creating the peer connection will add tracks, which triggers onnegotiationneeded
    // The onnegotiationneeded handler will send the offer if we're the impolite peer
    // So we don't need to explicitly call sendOffer here
    createPeerConnection(remoteId)
  }, [createPeerConnection])

  // Handle participant left
  const handleParticipantLeft = useCallback((message: SignalingMessage) => {
    const remoteId = message.payload.id
    console.log(`[VideoWebRTC] Participant left: ${remoteId}`)

    const peerConn = peerConnectionsRef.current.get(remoteId)
    if (peerConn) {
      peerConn.connection.close()
      peerConnectionsRef.current.delete(remoteId)
    }

    setRemoteStreams(prev => {
      const newMap = new Map(prev)
      newMap.delete(remoteId)
      return newMap
    })
  }, [])

  // Create combined stream for recording
  const createCombinedStream = useCallback(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 1280
    canvas.height = 720
    canvasRef.current = canvas
    const ctx = canvas.getContext('2d')
    if (!ctx) return null

    const drawFrame = () => {
      if (!mountedRef.current) return

      ctx.fillStyle = '#1a1a1a'
      ctx.fillRect(0, 0, canvas.width, canvas.height)

      const allStreams = [localStreamRef.current, ...Array.from(remoteStreams.values())].filter(Boolean)
      const count = allStreams.length

      if (count === 0) {
        animationFrameRef.current = requestAnimationFrame(drawFrame)
        return
      }

      const cols = count <= 1 ? 1 : count <= 4 ? 2 : 3
      const rows = Math.ceil(count / cols)
      const cellWidth = canvas.width / cols
      const cellHeight = canvas.height / rows

      const videos = document.querySelectorAll('video')
      allStreams.forEach((stream, index) => {
        if (!stream) return
        const videoTrack = stream.getVideoTracks()[0]
        if (!videoTrack || !videoTrack.enabled) return

        videos.forEach(video => {
          if (video.srcObject === stream) {
            const col = index % cols
            const row = Math.floor(index / cols)
            const x = col * cellWidth
            const y = row * cellHeight

            try {
              ctx.drawImage(video, x, y, cellWidth, cellHeight)
            } catch (e) {
              // Video might not be ready yet
            }
          }
        })
      })

      animationFrameRef.current = requestAnimationFrame(drawFrame)
    }

    drawFrame()

    const canvasStream = canvas.captureStream(30)
    const audioContext = new AudioContext()
    const destination = audioContext.createMediaStreamDestination()

    const allStreams = [localStreamRef.current, ...Array.from(remoteStreams.values())].filter(Boolean)
    allStreams.forEach(stream => {
      if (stream) {
        const audioTracks = stream.getAudioTracks()
        if (audioTracks.length > 0) {
          const source = audioContext.createMediaStreamSource(new MediaStream([audioTracks[0]]))
          source.connect(destination)
        }
      }
    })

    const combinedStream = new MediaStream([
      ...canvasStream.getVideoTracks(),
      ...destination.stream.getAudioTracks(),
    ])

    combinedStreamRef.current = combinedStream
    return combinedStream
  }, [remoteStreams])

  // Auto-stop recording after 2 hours and upload
  const autoStopRecording = useCallback(async () => {
    console.log('[VideoWebRTC] Auto-stopping recording after 2 hours...')

    if (!mediaRecorderRef.current || mediaRecorderRef.current.state === 'inactive') {
      console.log('[VideoWebRTC] No active recording to auto-stop')
      return
    }

    // Create a promise that resolves when recording stops
    const blob = await new Promise<Blob | null>((resolve) => {
      const recorder = mediaRecorderRef.current!
      const timeoutId = setTimeout(() => {
        console.warn('[VideoWebRTC] Auto-stop recording timed out')
        resolve(null)
      }, 10000)

      recorder.onstop = () => {
        clearTimeout(timeoutId)
        const recordingBlob = new Blob(recordedChunksRef.current, { type: 'video/webm' })
        console.log('[VideoWebRTC] Recording auto-stopped, blob size:', recordingBlob.size)
        recordedChunksRef.current = []
        setIsRecording(false)
        signalingRef.current?.updateRecordingStatus(false)
        resolve(recordingBlob)
      }

      recorder.stop()
    })

    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current)
      animationFrameRef.current = null
    }

    // Clear timeout ref
    recordingTimeoutRef.current = null
    recordingStartTimeRef.current = null

    // Upload the recording
    if (blob && blob.size > 0 && onRecordingComplete) {
      console.log('[VideoWebRTC] Uploading auto-stopped recording...')
      try {
        await onRecordingComplete(blob)
        console.log('[VideoWebRTC] Auto-stopped recording uploaded successfully')
      } catch (err) {
        console.error('[VideoWebRTC] Error uploading auto-stopped recording:', err)
      }
    }
  }, [onRecordingComplete])

  // Start recording
  const startRecordingInternal = useCallback(() => {
    try {
      const stream = createCombinedStream()
      if (!stream) return

      const options = { mimeType: 'video/webm;codecs=vp9,opus' }
      if (!MediaRecorder.isTypeSupported(options.mimeType)) {
        options.mimeType = 'video/webm'
      }

      const recorder = new MediaRecorder(stream, options)
      recordedChunksRef.current = []

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          recordedChunksRef.current.push(event.data)
        }
      }

      recorder.onstop = () => {
        const blob = new Blob(recordedChunksRef.current, { type: 'video/webm' })
        recordedChunksRef.current = []
        onRecordingComplete?.(blob)

        if (animationFrameRef.current) {
          cancelAnimationFrame(animationFrameRef.current)
        }
      }

      recorder.start(1000)
      mediaRecorderRef.current = recorder
      recordingStartTimeRef.current = Date.now()
      setIsRecording(true)
      console.log('[VideoWebRTC] Recording started')

      // Set up 2-hour auto-stop timer
      if (recordingTimeoutRef.current) {
        clearTimeout(recordingTimeoutRef.current)
      }
      recordingTimeoutRef.current = setTimeout(() => {
        console.log('[VideoWebRTC] 2-hour recording limit reached')
        autoStopRecording()
      }, RECORDING_MAX_DURATION)
      console.log('[VideoWebRTC] Recording will auto-stop in 2 hours')

      signalingRef.current?.updateRecordingStatus(true)
    } catch (err) {
      console.error('[VideoWebRTC] Error starting recording:', err)
    }
  }, [createCombinedStream, onRecordingComplete, autoStopRecording])

  // Stop recording and return the blob (without disconnecting)
  const stopRecordingAndGetBlob = useCallback(async (): Promise<Blob | null> => {
    // Clear the 2-hour auto-stop timer
    if (recordingTimeoutRef.current) {
      clearTimeout(recordingTimeoutRef.current)
      recordingTimeoutRef.current = null
    }
    recordingStartTimeRef.current = null

    if (!mediaRecorderRef.current || mediaRecorderRef.current.state === 'inactive') {
      console.log('[VideoWebRTC] No active recording to stop')
      return null
    }

    console.log('[VideoWebRTC] Stopping recording...')

    // Create a promise that resolves when recording stops, with timeout
    const recordingPromise = new Promise<Blob | null>((resolve) => {
      const recorder = mediaRecorderRef.current!
      const timeoutId = setTimeout(() => {
        console.warn('[VideoWebRTC] Recording stop timed out after 10s')
        resolve(null)
      }, 10000)

      recorder.onstop = () => {
        clearTimeout(timeoutId)
        const blob = new Blob(recordedChunksRef.current, { type: 'video/webm' })
        console.log('[VideoWebRTC] Recording stopped, blob size:', blob.size)
        recordedChunksRef.current = []
        setIsRecording(false)
        signalingRef.current?.updateRecordingStatus(false)
        resolve(blob)
      }

      recorder.stop()
    })

    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current)
      animationFrameRef.current = null
    }

    return recordingPromise
  }, [])

  // Internal disconnect helper so we can optionally preserve auto-reconnect behavior.
  const disconnectInternal = useCallback(async (markUserDisconnected: boolean) => {
    console.log('[VideoWebRTC] Disconnecting...')

    // Mark explicit user disconnect only when requested (manual stop).
    if (markUserDisconnected) {
      userDisconnectedRef.current = true
    }

    // Stop recording and upload
    const recordingBlob = await stopRecordingAndGetBlob()

    if (recordingBlob && recordingBlob.size > 0 && onRecordingComplete) {
      console.log('[VideoWebRTC] Uploading recording...')
      try {
        await onRecordingComplete(recordingBlob)
        console.log('[VideoWebRTC] Recording uploaded successfully')
      } catch (err) {
        console.error('[VideoWebRTC] Error uploading recording:', err)
      }
    }

    // Close all peer connections
    peerConnectionsRef.current.forEach(pc => {
      pc.connection.close()
    })
    peerConnectionsRef.current.clear()

    // Disconnect signaling
    if (signalingRef.current) {
      await signalingRef.current.disconnect()
      signalingRef.current = null
    }

    // Clear video element first
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = null
    }

    // Stop local stream
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => track.stop())
      localStreamRef.current = null
    }
    clearSharedMicStream(sharedMicOwnerIdRef.current)

    // Reset all state and refs
    initializingRef.current = false
    setHasLocalStream(false)
    setIsConnected(false)
    setRemoteStreams(new Map())
    setIsInitialized(false)
    setError(null)
    setIsMuted(false)
    setIsVideoOff(false)
    setIsScreenSharing(false)

    console.log('[VideoWebRTC] Disconnect complete')
  }, [onRecordingComplete, stopRecordingAndGetBlob])

  // Disconnect - exposed via ref for parent to call
  const disconnect = useCallback(async () => {
    await disconnectInternal(true)
  }, [disconnectInternal])

  // Reconnect - allows re-initialization after disconnect
  const reconnect = useCallback(() => {
    console.log('[VideoWebRTC] Reconnecting...')
    userDisconnectedRef.current = false
    initializingRef.current = false
    setIsInitialized(false)
    // Increment trigger to force effect to re-run
    setInitTrigger(prev => prev + 1)
  }, [])

  // Expose methods via ref so parent can call them
  useImperativeHandle(ref, () => ({
    disconnect,
    reconnect,
    stopRecording: stopRecordingAndGetBlob,
    isRecording: () => isRecording,
  }), [disconnect, reconnect, stopRecordingAndGetBlob, isRecording])

  // If the class is no longer joinable (teacher ended class), cleanly disconnect.
  useEffect(() => {
    if (!canJoin && (isConnected || isInitialized)) {
      disconnectInternal(false).catch((err) => {
        console.error('[VideoWebRTC] Error disconnecting after class ended:', err)
      })
    }
  }, [canJoin, isConnected, isInitialized, disconnectInternal])

  // Initialize media and signaling
  useEffect(() => {
    // Don't do anything if we can't join
    if (!canJoin) return

    // Don't re-initialize if user explicitly disconnected
    if (userDisconnectedRef.current) return

    // Already initialized or currently initializing
    if (isInitialized || initializingRef.current) return

    // Mark as initializing to prevent double-init
    initializingRef.current = true
    let cancelled = false
    mountedRef.current = true

    const initialize = async () => {
      try {
        console.log('[VideoWebRTC] Starting initialization...')

        // Request camera/mic access
        console.log('[VideoWebRTC] Requesting media access...')
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 1280 },
            height: { ideal: 720 },
            facingMode: 'user',
          },
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
          },
        })

        if (cancelled) {
          console.log('[VideoWebRTC] Initialization cancelled, stopping stream')
          stream.getTracks().forEach(track => track.stop())
          initializingRef.current = false
          // Don't set mountedRef here - it would interfere with concurrent initializations
          return
        }

        console.log('[VideoWebRTC] Got media stream, tracks:', stream.getTracks().map(t => t.kind))

        localStreamRef.current = stream
        setSharedMicStream(stream, sharedMicOwnerIdRef.current)
        setHasLocalStream(true)

        // Immediately assign to video element
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream
          localVideoRef.current.muted = true
          localVideoRef.current.play().catch(err => console.error('[VideoWebRTC] Error playing local video:', err))
        }

        // Connect to signaling
        console.log('[VideoWebRTC] Connecting to signaling...')
        const signaling = new WebRTCSignaling(
          roomId,
          participantIdRef.current,
          participantNameRef.current,
          isHostRef.current
        )
        signalingRef.current = signaling

        signaling.on('offer', handleOffer)
        signaling.on('answer', handleAnswer)
        signaling.on('ice-candidate', handleIceCandidate)
        signaling.on('participant-joined', handleParticipantJoined)
        signaling.on('participant-left', handleParticipantLeft)
        signaling.on('chat', (msg) => {
          setChatMessages(prev => [...prev, {
            id: `${msg.from}-${msg.timestamp}`,
            from: msg.from,
            name: msg.payload.senderName,
            message: msg.payload.message,
            timestamp: msg.timestamp,
          }])
        })

        signaling.onParticipantChange((updatedParticipants) => {
          setParticipants(updatedParticipants)
        })

        await signaling.connect()

        if (cancelled) {
          stream.getTracks().forEach(track => track.stop())
          await signaling.disconnect()
          initializingRef.current = false
          return
        }

        if (!mountedRef.current) {
          console.log('[VideoWebRTC] Component unmounted during initialization, cleaning up')
          stream.getTracks().forEach(track => track.stop())
          await signaling.disconnect()
          initializingRef.current = false
          return
        }

        setIsConnected(true)
        setIsInitialized(true)
        initializingRef.current = false
        console.log('[VideoWebRTC] Initialization complete')

        // Connect to existing participants
        // Creating peer connections will add tracks, triggering onnegotiationneeded
        // which handles sending offers to the appropriate peers
        const existingParticipants = signaling.getParticipants()
        console.log(`[VideoWebRTC] Found ${existingParticipants.length} existing participants`)
        existingParticipants.forEach(p => {
          if (p.id !== participantIdRef.current && !peerConnectionsRef.current.has(p.id)) {
            console.log(`[VideoWebRTC] Creating peer connection to existing participant: ${p.id}`)
            createPeerConnection(p.id)
          }
        })

        // Auto-record immediately if host and autoRecord is enabled
        if (isHostRef.current && autoRecord) {
          console.log('[VideoWebRTC] Auto-starting recording for host')
          startRecordingInternal()
        }
      } catch (err) {
        console.error('[VideoWebRTC] Error initializing:', err)
        initializingRef.current = false
        if (!cancelled) {
          const errorMessage = err instanceof Error ? err.message : 'Failed to initialize video chat'
          setError(errorMessage)
          onError?.(err instanceof Error ? err : new Error(errorMessage))
        }
      }
    }

    initialize()

    return () => {
      cancelled = true
      mountedRef.current = false
      initializingRef.current = false
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canJoin, roomId, autoRecord, initTrigger])

  // Cleanup when user navigates away (not affected by StrictMode)
  useEffect(() => {
    const ownerId = sharedMicOwnerIdRef.current

    const handleBeforeUnload = () => {
      // Stop all media tracks when leaving the page
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(track => track.stop())
      }
      clearSharedMicStream(ownerId)
      if (signalingRef.current) {
        signalingRef.current.disconnect()
      }
      // Clear recording timeout
      if (recordingTimeoutRef.current) {
        clearTimeout(recordingTimeoutRef.current)
      }
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload)
      clearSharedMicStream(ownerId)
      // Also clear on component unmount
      if (recordingTimeoutRef.current) {
        clearTimeout(recordingTimeoutRef.current)
      }
    }
  }, [])

  // Sync local stream to video element - run when layout changes (mini-player toggle)
  useEffect(() => {
    // Small delay to let DOM settle after layout change
    const timer = setTimeout(() => {
      const video = localVideoRef.current
      const stream = localStreamRef.current

      if (video && stream && hasLocalStream) {
        // Always reassign when this effect runs (layout may have changed)
        console.log('[VideoWebRTC] Assigning stream to video element, isMiniPlayer:', isMiniPlayer)
        video.srcObject = stream
        video.muted = true
        video.play().catch(err => {
          console.error('[VideoWebRTC] Error playing local video:', err)
        })
      } else if (video && !hasLocalStream) {
        // Clear video element when no stream
        video.srcObject = null
      }
    }, 50)

    return () => clearTimeout(timer)
  }, [hasLocalStream, isInitialized, isMiniPlayer])

  // Additional effect to ensure video plays when remote streams change (layout may shift)
  useEffect(() => {
    // Small delay to allow DOM to settle after layout changes
    const timer = setTimeout(() => {
      const video = localVideoRef.current
      if (video && hasLocalStream && localStreamRef.current) {
        if (!video.srcObject || video.srcObject !== localStreamRef.current) {
          console.log('[VideoWebRTC] Re-assigning stream after layout change')
          video.srcObject = localStreamRef.current
          video.muted = true
          video.play().catch(err => {
            console.error('[VideoWebRTC] Error playing video after layout change:', err)
          })
        }
      }
    }, 100)
    return () => clearTimeout(timer)
  }, [remoteStreams.size, hasLocalStream])

  // Scroll chat to bottom
  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight
    }
  }, [chatMessages])

  // Toggle audio
  const toggleAudio = useCallback(() => {
    if (localStreamRef.current) {
      const audioTrack = localStreamRef.current.getAudioTracks()[0]
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled
        setIsMuted(!audioTrack.enabled)
        signalingRef.current?.updateMediaStatus(!audioTrack.enabled, isVideoOff, isScreenSharing)
      }
    }
  }, [isVideoOff, isScreenSharing])

  // Toggle video
  const toggleVideo = useCallback(() => {
    if (localStreamRef.current) {
      const videoTrack = localStreamRef.current.getVideoTracks()[0]
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled
        setIsVideoOff(!videoTrack.enabled)
        signalingRef.current?.updateMediaStatus(isMuted, !videoTrack.enabled, isScreenSharing)
      }
    }
  }, [isMuted, isScreenSharing])

  // Restore camera after screen share
  const restoreCamera = useCallback(async () => {
    if (localStreamRef.current) {
      try {
        const cameraStream = await navigator.mediaDevices.getUserMedia({ video: true })
        const videoTrack = cameraStream.getVideoTracks()[0]

        const oldVideoTrack = localStreamRef.current.getVideoTracks()[0]
        if (oldVideoTrack) {
          localStreamRef.current.removeTrack(oldVideoTrack)
          oldVideoTrack.stop()
        }
        localStreamRef.current.addTrack(videoTrack)

        peerConnectionsRef.current.forEach(({ connection }) => {
          const sender = connection.getSenders().find(s => s.track?.kind === 'video')
          if (sender) {
            sender.replaceTrack(videoTrack)
          }
        })

        if (localVideoRef.current) {
          localVideoRef.current.srcObject = localStreamRef.current
        }

        setIsScreenSharing(false)
        signalingRef.current?.updateMediaStatus(isMuted, isVideoOff, false)
      } catch (err) {
        console.error('[VideoWebRTC] Error restoring camera:', err)
      }
    }
  }, [isMuted, isVideoOff])

  // Toggle screen share
  const toggleScreenShare = useCallback(async () => {
    if (isScreenSharing) {
      await restoreCamera()
    } else {
      try {
        const screenStream = await navigator.mediaDevices.getDisplayMedia({
          video: true,
          audio: false,
        })

        const screenTrack = screenStream.getVideoTracks()[0]

        screenTrack.onended = () => {
          restoreCamera()
        }

        if (localStreamRef.current) {
          const oldVideoTrack = localStreamRef.current.getVideoTracks()[0]
          if (oldVideoTrack) {
            localStreamRef.current.removeTrack(oldVideoTrack)
            oldVideoTrack.stop()
          }
          localStreamRef.current.addTrack(screenTrack)

          peerConnectionsRef.current.forEach(({ connection }) => {
            const sender = connection.getSenders().find(s => s.track?.kind === 'video')
            if (sender) {
              sender.replaceTrack(screenTrack)
            }
          })

          if (localVideoRef.current) {
            localVideoRef.current.srcObject = localStreamRef.current
          }
        }

        setIsScreenSharing(true)
        signalingRef.current?.updateMediaStatus(isMuted, isVideoOff, true)
      } catch (err) {
        console.error('[VideoWebRTC] Error starting screen share:', err)
      }
    }
  }, [isScreenSharing, isMuted, isVideoOff, restoreCamera])

  // Toggle recording
  const toggleRecording = useCallback(() => {
    if (!isHost) return

    if (isRecording) {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop()
        setIsRecording(false)
        signalingRef.current?.updateRecordingStatus(false)
      }
    } else {
      startRecordingInternal()
    }
  }, [isRecording, isHost, startRecordingInternal])

  // Send chat message
  const sendChatMessage = useCallback(() => {
    if (!chatInput.trim()) return

    setChatMessages((prev) => [
      ...prev,
      {
        id: `${participantId}-${Date.now()}`,
        from: participantId,
        name: participantName,
        message: chatInput.trim(),
        timestamp: Date.now(),
      },
    ])

    signalingRef.current?.sendChatMessage(chatInput.trim())
    setChatInput('')
  }, [chatInput, participantId, participantName])

  const remoteStreamArray = Array.from(remoteStreams.entries())
  const hasRemoteStream = remoteStreamArray.length > 0

  // Not joined state
  if (!canJoin) {
    return (
      <div className={`relative w-full h-full ${className || ''}`}>
        <div className="h-full w-full bg-black/80 flex items-center justify-center">
          <p className="text-sm text-gray-400">Waiting for teacher to start class...</p>
        </div>
      </div>
    )
  }

  // Error state
  if (error) {
    return (
      <div className={`relative w-full h-full ${className || ''}`}>
        <div className="h-full flex items-center justify-center bg-gray-950">
          <div className="text-center max-w-md p-6">
            <div className="w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
              <X className="w-8 h-8 text-red-400" />
            </div>
            <h2 className="text-xl font-semibold text-white mb-2">Camera/Microphone Access Required</h2>
            <p className="text-gray-400 mb-6">{error}</p>
          </div>
        </div>
      </div>
    )
  }

  // Unified view - uses CSS to switch between mini and full modes
  // This keeps the video element persistent across mode changes
  return (
    <div className={`${isMiniPlayer ? 'relative w-full h-full' : 'h-full flex flex-col bg-gray-950'} ${className || ''}`}>
      {/* Persistent Local Video Element - always rendered to maintain stream */}
      <video
        ref={localVideoRef}
        autoPlay
        playsInline
        muted
        className="hidden"
        id="persistent-local-video"
      />

      {isMiniPlayer ? (
        /* Mini player layout */
        <div className="relative w-full h-full bg-gray-900 rounded-lg overflow-hidden">
          <LocalVideoDisplay
            key={`mini-${hasLocalStream}`}
            stream={localStreamRef.current}
            isVideoOff={isVideoOff}
            participantName={participantName}
            className="w-full h-full object-cover"
          />
          {hasRemoteStream && (
            <div className="absolute bottom-1 right-1 w-16 h-12 rounded overflow-hidden border border-white/20">
              <RemoteVideoView stream={remoteStreamArray[0][1]} participantName="Remote" compact />
            </div>
          )}
          {isMuted && (
            <span className="absolute top-1 right-1 p-1 bg-red-500/80 rounded-full">
              <MicOff className="w-3 h-3 text-white" />
            </span>
          )}
          {isRecording && (
            <div className="absolute top-1 left-1 flex items-center gap-1 px-2 py-0.5 bg-red-500/90 rounded-full">
              <Circle className="w-2 h-2 fill-current text-white animate-pulse" />
              <span className="text-[10px] text-white font-medium">REC</span>
            </div>
          )}
        </div>
      ) : (
        /* Full view layout */
        <>
          <div className="flex-1 relative overflow-hidden">
            <div className="absolute inset-0 p-4">
              {hasRemoteStream ? (
                <>
                  <div className="relative w-full h-full bg-gray-900 rounded-xl overflow-hidden">
                    {remoteStreamArray.map(([peerId, stream]) => {
                      const participant = participants.find(p => p.id === peerId)
                      return (
                        <RemoteVideoView
                          key={peerId}
                          stream={stream}
                          participantName={participant?.name || 'Participant'}
                          isMuted={participant?.isMuted || false}
                          isVideoOff={participant?.isVideoOff || false}
                        />
                      )
                    })}
                  </div>
                  <div className="absolute bottom-8 right-8 w-48 h-36 bg-gray-800 rounded-xl overflow-hidden shadow-2xl border-2 border-white/20 z-10">
                    <LocalVideoDisplay
                      key={`pip-${hasLocalStream}`}
                      stream={localStreamRef.current}
                      isVideoOff={isVideoOff}
                      participantName={participantName}
                      className="w-full h-full object-cover"
                      compact
                    />
                    <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between">
                      <span className="px-2 py-0.5 bg-black/60 rounded text-xs text-white truncate">You</span>
                      {isMuted && (
                        <span className="p-1 bg-red-500/80 rounded-full">
                          <MicOff className="w-3 h-3 text-white" />
                        </span>
                      )}
                    </div>
                  </div>
                </>
              ) : (
                <div className="relative w-full h-full bg-gray-900 rounded-xl overflow-hidden">
                  <LocalVideoDisplay
                    key={`full-${hasLocalStream}`}
                    stream={localStreamRef.current}
                    isVideoOff={isVideoOff}
                    participantName={participantName}
                    className="w-full h-full object-cover"
                    showLoading={!hasLocalStream}
                  />
                  <div className="absolute bottom-4 left-4 right-4 flex items-center justify-between">
                    <span className="px-3 py-1.5 bg-black/60 rounded-lg text-sm text-white">
                      {participantName} (You) {isHost && <span className="text-[#CEB466] ml-1">Host</span>}
                    </span>
                  </div>
                  {isConnected && !hasRemoteStream && hasLocalStream && (
                    <div className="absolute top-4 left-1/2 transform -translate-x-1/2 px-4 py-2 bg-black/60 rounded-full">
                      <p className="text-sm text-gray-300">Waiting for others to join...</p>
                    </div>
                  )}
                </div>
              )}
            </div>

            {isRecording && (
              <div className="absolute top-6 left-6 flex items-center gap-2 px-3 py-1.5 bg-red-500/90 rounded-full z-10">
                <Circle className="w-3 h-3 fill-current text-white animate-pulse" />
                <span className="text-sm text-white font-medium">Recording</span>
              </div>
            )}
          </div>

          {/* Side Panel */}
      {(showChat || showParticipants) && (
        <div className="absolute top-0 right-0 bottom-20 w-80 bg-gray-900/95 border-l border-white/10 flex flex-col z-20">
          <div className="p-4 border-b border-white/10 flex items-center justify-between">
            <h3 className="font-medium text-white">{showChat ? 'Chat' : 'Participants'}</h3>
            <button onClick={() => { setShowChat(false); setShowParticipants(false) }} className="p-1 text-gray-400 hover:text-white">
              <X className="w-5 h-5" />
            </button>
          </div>

          {showParticipants && (
            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {participants.map((p) => (
                <div key={p.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-white/5">
                  <div className="w-10 h-10 rounded-full bg-gray-700 flex items-center justify-center text-white">
                    {p.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-white truncate">{p.name} {p.id === participantId && '(You)'}</p>
                    <p className="text-xs text-gray-500">{p.isHost ? 'Host' : 'Participant'}</p>
                  </div>
                  {p.isMuted ? <VolumeX className="w-4 h-4 text-red-400" /> : <Volume2 className="w-4 h-4 text-green-400" />}
                </div>
              ))}
            </div>
          )}

          {showChat && (
            <>
              <div ref={chatContainerRef} className="flex-1 overflow-y-auto p-4 space-y-3">
                {chatMessages.length === 0 && <p className="text-gray-500 text-sm text-center">No messages yet</p>}
                {chatMessages.map((msg) => (
                  <div key={msg.id} className={msg.from === participantId ? 'text-right' : 'text-left'}>
                    <div className={`inline-block max-w-[80%] p-2 rounded-lg ${msg.from === participantId ? 'bg-[#CEB466]/20 text-[#CEB466]' : 'bg-white/10 text-white'}`}>
                      {msg.from !== participantId && <p className="text-xs text-gray-400 mb-1">{msg.name}</p>}
                      <p className="text-sm">{msg.message}</p>
                    </div>
                  </div>
                ))}
              </div>
              <div className="p-4 border-t border-white/10">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && sendChatMessage()}
                    placeholder="Type a message..."
                    className="flex-1 px-3 py-2 bg-white/10 border border-white/10 rounded-lg text-white placeholder-gray-500 text-sm focus:outline-none focus:border-[#CEB466]/50"
                  />
                  <button onClick={sendChatMessage} disabled={!chatInput.trim()} className="p-2 bg-[#CEB466] hover:bg-[#e0c97d] disabled:bg-gray-700 disabled:cursor-not-allowed rounded-lg transition-colors">
                    <Send className="w-5 h-5 text-[#171229]" />
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* Controls */}
      <div className="h-20 border-t border-white/10 bg-gray-900/50 flex items-center justify-center gap-3 px-4">
        <button onClick={toggleAudio} disabled={!hasLocalStream} className={`p-4 rounded-full transition-colors ${!hasLocalStream ? 'bg-gray-800 text-gray-600 cursor-not-allowed' : isMuted ? 'bg-red-500 text-white hover:bg-red-600' : 'bg-gray-700 text-white hover:bg-gray-600'}`} title={isMuted ? 'Unmute' : 'Mute'}>
          {isMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
        </button>

        <button onClick={toggleVideo} disabled={!hasLocalStream} className={`p-4 rounded-full transition-colors ${!hasLocalStream ? 'bg-gray-800 text-gray-600 cursor-not-allowed' : isVideoOff ? 'bg-red-500 text-white hover:bg-red-600' : 'bg-gray-700 text-white hover:bg-gray-600'}`} title={isVideoOff ? 'Turn on camera' : 'Turn off camera'}>
          {isVideoOff ? <VideoOff className="w-5 h-5" /> : <Video className="w-5 h-5" />}
        </button>

        <button onClick={toggleScreenShare} disabled={!hasLocalStream} className={`p-4 rounded-full transition-colors ${!hasLocalStream ? 'bg-gray-800 text-gray-600 cursor-not-allowed' : isScreenSharing ? 'bg-green-500 text-white hover:bg-green-600' : 'bg-gray-700 text-white hover:bg-gray-600'}`} title={isScreenSharing ? 'Stop sharing' : 'Share screen'}>
          {isScreenSharing ? <MonitorOff className="w-5 h-5" /> : <Monitor className="w-5 h-5" />}
        </button>

        {isHost && (
          <button onClick={toggleRecording} disabled={!hasLocalStream} className={`p-4 rounded-full transition-colors ${!hasLocalStream ? 'bg-gray-800 text-gray-600 cursor-not-allowed' : isRecording ? 'bg-red-500 text-white animate-pulse hover:bg-red-600' : 'bg-gray-700 text-white hover:bg-gray-600'}`} title={isRecording ? 'Stop recording' : 'Start recording'}>
            {isRecording ? <StopCircle className="w-5 h-5" /> : <Circle className="w-5 h-5" />}
          </button>
        )}

        <div className="w-px h-8 bg-white/10 mx-1" />

        <button onClick={() => { setShowChat(!showChat); setShowParticipants(false) }} className={`p-4 rounded-full transition-colors relative ${showChat ? 'bg-[#CEB466] text-[#171229]' : 'bg-gray-700 text-white hover:bg-gray-600'}`} title="Chat">
          <MessageSquare className="w-5 h-5" />
          {chatMessages.length > 0 && !showChat && (
            <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 rounded-full text-xs flex items-center justify-center text-white">
              {chatMessages.length > 9 ? '9+' : chatMessages.length}
            </span>
          )}
        </button>

        <button onClick={() => { setShowParticipants(!showParticipants); setShowChat(false) }} className={`p-4 rounded-full transition-colors relative ${showParticipants ? 'bg-[#CEB466] text-[#171229]' : 'bg-gray-700 text-white hover:bg-gray-600'}`} title="Participants">
          <Users className="w-5 h-5" />
          <span className="absolute -top-1 -right-1 w-5 h-5 bg-gray-600 rounded-full text-xs flex items-center justify-center text-white">
            {participants.length}
          </span>
        </button>
      </div>
        </>
      )}
    </div>
  )
})

export default VideoWebRTC

// Remote Video Component
function RemoteVideoView({
  stream,
  participantName,
  isMuted = false,
  isVideoOff = false,
  compact = false,
}: {
  stream: MediaStream
  participantName: string
  isMuted?: boolean
  isVideoOff?: boolean
  compact?: boolean
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [hasVideoTrack, setHasVideoTrack] = useState(false)

  useEffect(() => {
    const video = videoRef.current
    if (!video || !stream) return

    const updateVideoTrackState = () => {
      const tracks = stream.getVideoTracks()
      setHasVideoTrack(tracks.length > 0 && tracks.some(t => t.enabled && t.readyState === 'live'))
    }
    const videoTracks = stream.getVideoTracks()
    queueMicrotask(updateVideoTrackState)

    // Log stream details for debugging
    console.log('[RemoteVideoView] Stream:', stream.id, 'Video tracks:', videoTracks.length, 'Audio tracks:', stream.getAudioTracks().length)
    videoTracks.forEach((track, i) => {
      console.log(`[RemoteVideoView] Video track ${i}:`, track.label, 'enabled:', track.enabled, 'readyState:', track.readyState)
    })

    // Set the stream
    video.srcObject = stream

    // Try to play with various strategies
    const playVideo = async () => {
      try {
        // Ensure video is not paused
        video.muted = false // Remote video should have audio
        await video.play()
        console.log('[RemoteVideoView] Video playing successfully')
      } catch (err) {
        console.warn('[RemoteVideoView] Autoplay failed, trying muted:', err)
        // If autoplay fails due to browser policy, try muted first
        try {
          video.muted = true
          await video.play()
          // Then unmute after a short delay
          setTimeout(() => {
            video.muted = false
          }, 100)
        } catch (mutedErr) {
          console.error('[RemoteVideoView] Even muted playback failed:', mutedErr)
        }
      }
    }

    playVideo()

    // Listen for track changes
    const handleTrackChange = () => {
      updateVideoTrackState()
    }

    stream.addEventListener('addtrack', handleTrackChange)
    stream.addEventListener('removetrack', handleTrackChange)

    // Listen for track ended/muted events
    videoTracks.forEach(track => {
      track.addEventListener('ended', handleTrackChange)
      track.addEventListener('mute', handleTrackChange)
      track.addEventListener('unmute', handleTrackChange)
    })

    return () => {
      stream.removeEventListener('addtrack', handleTrackChange)
      stream.removeEventListener('removetrack', handleTrackChange)
      videoTracks.forEach(track => {
        track.removeEventListener('ended', handleTrackChange)
        track.removeEventListener('mute', handleTrackChange)
        track.removeEventListener('unmute', handleTrackChange)
      })
      video.srcObject = null
    }
  }, [stream])

  // Determine if we should show the avatar (video off OR no video track)
  const showAvatar = isVideoOff || !hasVideoTrack

  if (compact) {
    return (
      <div className="relative w-full h-full">
        <video ref={videoRef} autoPlay playsInline className="w-full h-full object-cover" />
        {showAvatar && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-800">
            <div className="w-8 h-8 rounded-full bg-gray-700 flex items-center justify-center text-sm text-white font-medium">
              {participantName.charAt(0).toUpperCase()}
            </div>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="relative w-full h-full">
      <video
        ref={videoRef}
        autoPlay
        playsInline
        className="w-full h-full object-cover"
        style={{ display: showAvatar ? 'none' : 'block' }}
      />
      {showAvatar && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-800">
          <div className="w-32 h-32 rounded-full bg-gray-700 flex items-center justify-center text-4xl text-white font-medium">
            {participantName.charAt(0).toUpperCase()}
          </div>
        </div>
      )}
      <div className="absolute bottom-4 left-4 right-4 flex items-center justify-between">
        <span className="px-3 py-1.5 bg-black/60 rounded-lg text-sm text-white">{participantName}</span>
        <div className="flex items-center gap-2">
          {isMuted && (
            <span className="p-1.5 bg-red-500/80 rounded-full">
              <MicOff className="w-4 h-4 text-white" />
            </span>
          )}
          {isVideoOff && (
            <span className="p-1.5 bg-red-500/80 rounded-full">
              <VideoOff className="w-4 h-4 text-white" />
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

// Local Video Display Component - maintains its own video element with stream
function LocalVideoDisplay({
  stream,
  isVideoOff,
  participantName,
  className,
  compact = false,
  showLoading = false,
}: {
  stream: MediaStream | null
  isVideoOff: boolean
  participantName: string
  className?: string
  compact?: boolean
  showLoading?: boolean
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [hasVideoTrack, setHasVideoTrack] = useState(false)

  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    if (stream) {
      // Check for video tracks
      const videoTracks = stream.getVideoTracks()
      const hasTrack = videoTracks.length > 0 && videoTracks.some(t => t.enabled && t.readyState === 'live')
      setHasVideoTrack(hasTrack)

      video.srcObject = stream
      video.muted = true

      const playVideo = async () => {
        try {
          await video.play()
          setIsPlaying(true)
          console.log('[LocalVideoDisplay] Video playing successfully')
        } catch (err) {
          console.warn('[LocalVideoDisplay] Autoplay failed, retrying:', err)
          // Retry after a short delay
          setTimeout(async () => {
            try {
              await video.play()
              setIsPlaying(true)
            } catch (retryErr) {
              console.error('[LocalVideoDisplay] Retry failed:', retryErr)
            }
          }, 100)
        }
      }

      playVideo()

      // Listen for track changes
      const handleTrackChange = () => {
        const tracks = stream.getVideoTracks()
        setHasVideoTrack(tracks.length > 0 && tracks.some(t => t.enabled && t.readyState === 'live'))
      }

      stream.addEventListener('addtrack', handleTrackChange)
      stream.addEventListener('removetrack', handleTrackChange)
      videoTracks.forEach(track => {
        track.addEventListener('ended', handleTrackChange)
        track.addEventListener('mute', handleTrackChange)
        track.addEventListener('unmute', handleTrackChange)
      })

      return () => {
        stream.removeEventListener('addtrack', handleTrackChange)
        stream.removeEventListener('removetrack', handleTrackChange)
        videoTracks.forEach(track => {
          track.removeEventListener('ended', handleTrackChange)
          track.removeEventListener('mute', handleTrackChange)
          track.removeEventListener('unmute', handleTrackChange)
        })
      }
    } else {
      video.srcObject = null
      setIsPlaying(false)
      setHasVideoTrack(false)
    }
  }, [stream])

  const avatarSize = compact ? 'w-12 h-12 text-xl' : 'w-32 h-32 text-4xl'

  // Show avatar when video is off OR when no video track is available
  const shouldShowAvatar = isVideoOff || (stream && !hasVideoTrack)
  // Show loading when explicitly requested OR when stream exists but video isn't playing yet
  const shouldShowLoading = (showLoading && !stream) || (stream && !isPlaying && !isVideoOff && hasVideoTrack)

  return (
    <div className="relative w-full h-full">
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className={`${className} ${(isVideoOff || shouldShowAvatar) ? 'hidden' : ''}`}
      />
      {shouldShowAvatar && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-800">
          <div className={`${avatarSize} rounded-full bg-gray-700 flex items-center justify-center text-white font-medium`}>
            {participantName.charAt(0).toUpperCase()}
          </div>
        </div>
      )}
      {shouldShowLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-900">
          <div className="text-center">
            <div className="w-12 h-12 border-4 border-[#CEB466] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <p className="text-gray-400">Accessing camera...</p>
          </div>
        </div>
      )}
    </div>
  )
}
