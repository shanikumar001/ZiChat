'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useSocketContext } from '../context/SocketContext';
import { useAuth } from '../context/AuthContext';
import { toast } from 'sonner';

export type CallState = 'idle' | 'calling' | 'incoming' | 'connected' | 'ended';
export type CallType = 'audio' | 'video';

export interface CallUser {
  id: string;
  name: string;
  username?: string;
  avatar?: string;
}

const ICE_SERVERS: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun3.l.google.com:19302' },
    { urls: 'stun:stun4.l.google.com:19302' },
  ],
};

export function useWebRTCCall() {
  const { socket, isConnected } = useSocketContext();
  const { user: currentUser } = useAuth();

  const [callState, setCallState] = useState<CallState>('idle');
  const [callType, setCallType] = useState<CallType>('video');
  const [targetUser, setTargetUser] = useState<CallUser | null>(null);
  const [callerInfo, setCallerInfo] = useState<CallUser | null>(null);

  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);

  const [isMicMuted, setIsMicMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);

  const [remoteMicMuted, setRemoteMicMuted] = useState(false);
  const [remoteVideoOff, setRemoteVideoOff] = useState(false);

  const [callDuration, setCallDuration] = useState(0);

  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const pendingOfferRef = useRef<RTCSessionDescriptionInit | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const ringtoneTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const callTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const screenTrackRef = useRef<MediaStreamTrack | null>(null);
  const originalVideoTrackRef = useRef<MediaStreamTrack | null>(null);
  const broadcastChannelRef = useRef<BroadcastChannel | null>(null);

  // Initialize BroadcastChannel fallback for multi-tab / local testing
  useEffect(() => {
    if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
      broadcastChannelRef.current = new BroadcastChannel('zichat_webrtc_signaling');
    }
    return () => {
      if (broadcastChannelRef.current) {
        broadcastChannelRef.current.close();
        broadcastChannelRef.current = null;
      }
    };
  }, []);

  // Helper to dispatch signals across both Socket.io and BroadcastChannel
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const emitSignal = useCallback((event: string, data: any) => {
    if (socket) {
      try {
        socket.emit(event, data);
      } catch {
        // socket emit error ignore
      }
    }
    if (broadcastChannelRef.current) {
      try {
        broadcastChannelRef.current.postMessage({
          event,
          data,
          senderId: currentUser?.id,
        });
      } catch {
        // channel error ignore
      }
    }
  }, [socket, currentUser]);

  // ----------------------------------------------------
  // Audio Synthesizer (Ringtone & Ringback)
  // ----------------------------------------------------
  const stopTones = useCallback(() => {
    if (ringtoneTimerRef.current) {
      clearInterval(ringtoneTimerRef.current);
      ringtoneTimerRef.current = null;
    }
    if (audioContextRef.current) {
      try {
        audioContextRef.current.close();
      } catch {
        // ignore
      }
      audioContextRef.current = null;
    }
  }, []);

  const playTone = useCallback((freq1: number, freq2: number, durationSec: number) => {
    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;

      const ctx = new AudioCtx();
      audioContextRef.current = ctx;

      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const gain = ctx.createGain();

      osc1.type = 'sine';
      osc2.type = 'sine';
      osc1.frequency.setValueAtTime(freq1, ctx.currentTime);
      osc2.frequency.setValueAtTime(freq2, ctx.currentTime);

      gain.gain.setValueAtTime(0.08, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + durationSec);

      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(ctx.destination);

      osc1.start();
      osc2.start();
      osc1.stop(ctx.currentTime + durationSec);
      osc2.stop(ctx.currentTime + durationSec);
    } catch {
      // Audio context restricted before user gesture
    }
  }, []);

  const playRingtone = useCallback(() => {
    stopTones();
    const trigger = () => {
      playTone(852, 1209, 1.2);
    };
    trigger();
    ringtoneTimerRef.current = setInterval(trigger, 2500);
  }, [playTone, stopTones]);

  const playRingback = useCallback(() => {
    stopTones();
    const trigger = () => {
      playTone(440, 480, 1.5);
    };
    trigger();
    ringtoneTimerRef.current = setInterval(trigger, 4000);
  }, [playTone, stopTones]);

  // ----------------------------------------------------
  // Clean Up Call Resources
  // ----------------------------------------------------
  const cleanupCall = useCallback(() => {
    stopTones();

    if (callTimerRef.current) {
      clearInterval(callTimerRef.current);
      callTimerRef.current = null;
    }

    if (screenTrackRef.current) {
      screenTrackRef.current.stop();
      screenTrackRef.current = null;
    }

    if (localStream) {
      localStream.getTracks().forEach((track) => track.stop());
      setLocalStream(null);
    }

    if (remoteStream) {
      remoteStream.getTracks().forEach((track) => track.stop());
      setRemoteStream(null);
    }

    if (peerConnectionRef.current) {
      peerConnectionRef.current.ontrack = null;
      peerConnectionRef.current.onicecandidate = null;
      peerConnectionRef.current.onconnectionstatechange = null;
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }

    pendingOfferRef.current = null;
    originalVideoTrackRef.current = null;

    setCallState('idle');
    setTargetUser(null);
    setCallerInfo(null);
    setIsMicMuted(false);
    setIsVideoOff(false);
    setIsScreenSharing(false);
    setRemoteMicMuted(false);
    setRemoteVideoOff(false);
    setCallDuration(0);
  }, [localStream, remoteStream, stopTones]);

  // ----------------------------------------------------
  // Helper: Get User Media Stream (with Mobile Fallbacks)
  // ----------------------------------------------------
  const getMedia = useCallback(async (type: CallType) => {
    // 1. Mobile HTTPS / Secure Context Check
    if (typeof window !== 'undefined') {
      const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
      if (!window.isSecureContext && !isLocalhost) {
        const msg = 'Camera and microphone access requires HTTPS on mobile browsers. Please open ZiChat via an https:// link.';
        toast.error(msg, { duration: 6000 });
        throw new Error(msg);
      }
    }

    if (!navigator?.mediaDevices?.getUserMedia) {
      const msg = 'Your browser or device does not support audio/video calling.';
      toast.error(msg, { duration: 6000 });
      throw new Error(msg);
    }

    // 2. Mobile Constraint Fallback Attempts
    const constraintList: MediaStreamConstraints[] = [];

    if (type === 'video') {
      // Primary: Mobile front camera preference
      constraintList.push({
        audio: true,
        video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
      });
      // Fallback 1: Generic video + audio
      constraintList.push({
        audio: true,
        video: { facingMode: 'user' },
      });
      // Fallback 2: Basic video + audio
      constraintList.push({
        audio: true,
        video: true,
      });
    }

    // Final fallback: Audio only
    constraintList.push({ audio: true });

    let lastError: unknown = null;

    for (const constraints of constraintList) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        setLocalStream(stream);
        if (type === 'video' && !constraints.video) {
          setIsVideoOff(true);
          toast.info('Camera unavailable. Switched to Audio call mode.');
        }
        return stream;
      } catch (err: unknown) {
        lastError = err;
        // If user explicitly denied permission, don't keep trying higher constraints
        if (err instanceof DOMException && (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError')) {
          break;
        }
      }
    }

    // 3. User-friendly Permission Denied Error
    if (lastError instanceof DOMException) {
      if (lastError.name === 'NotAllowedError' || lastError.name === 'PermissionDeniedError') {
        const permMsg = 'Camera/Microphone permission denied. Please allow camera and mic permissions in your phone browser site settings.';
        toast.error(permMsg, { duration: 7000 });
        throw new Error(permMsg);
      } else if (lastError.name === 'NotFoundError' || lastError.name === 'DevicesNotFoundError') {
        const devMsg = 'No camera or microphone found on your device.';
        toast.error(devMsg);
        throw new Error(devMsg);
      }
    }

    const errorMsg = lastError instanceof Error ? lastError.message : 'Camera/Microphone permission error';
    toast.error(errorMsg);
    throw lastError || new Error(errorMsg);
  }, []);

  // ----------------------------------------------------
  // Initialize PeerConnection
  // ----------------------------------------------------
  const createPeerConnection = useCallback((targetUserId: string) => {
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
    }

    const pc = new RTCPeerConnection(ICE_SERVERS);

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        emitSignal('iceCandidate', { to: targetUserId, candidate: event.candidate });
        emitSignal('ice-candidate', { to: targetUserId, candidate: event.candidate });
      }
    };

    pc.ontrack = (event) => {
      if (event.streams && event.streams[0]) {
        setRemoteStream(event.streams[0]);
      } else {
        const newStream = new MediaStream([event.track]);
        setRemoteStream(newStream);
      }
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'connected') {
        stopTones();
        setCallState('connected');
        if (!callTimerRef.current) {
          setCallDuration(0);
          callTimerRef.current = setInterval(() => {
            setCallDuration((prev) => prev + 1);
          }, 1000);
        }
      } else if (
        pc.connectionState === 'disconnected' ||
        pc.connectionState === 'failed' ||
        pc.connectionState === 'closed'
      ) {
        toast.info('Call disconnected');
        cleanupCall();
      }
    };

    peerConnectionRef.current = pc;
    return pc;
  }, [emitSignal, stopTones, cleanupCall]);

  // ----------------------------------------------------
  // Start Outgoing Call
  // ----------------------------------------------------
  const startCall = useCallback(async (userToCall: CallUser, type: CallType) => {
    if (!userToCall || !userToCall.id) {
      toast.error('Invalid recipient specified.');
      return;
    }

    // Try auto-connecting socket if disconnected
    if (socket && !socket.connected) {
      try {
        socket.connect();
      } catch {
        // ignore
      }
    }

    try {
      setCallState('calling');
      setCallType(type);
      setTargetUser(userToCall);
      playRingback();

      const stream = await getMedia(type);
      const pc = createPeerConnection(userToCall.id);

      stream.getTracks().forEach((track) => {
        pc.addTrack(track, stream);
      });

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      const callerData = {
        id: currentUser?.id || 'local_user',
        name: currentUser?.name || currentUser?.username || 'User',
        username: currentUser?.username,
        avatar: currentUser?.profilePhoto,
      };

      emitSignal('callUser', {
        to: userToCall.id,
        offer,
        callType: type,
        callerInfo: callerData,
      });

      emitSignal('call-user', {
        to: userToCall.id,
        offer,
        callType: type,
        callerInfo: callerData,
      });
    } catch {
      cleanupCall();
    }
  }, [socket, playRingback, getMedia, createPeerConnection, currentUser, emitSignal, cleanupCall]);

  // ----------------------------------------------------
  // Accept Incoming Call
  // ----------------------------------------------------
  const acceptCall = useCallback(async () => {
    if (!callerInfo || !pendingOfferRef.current) return;

    stopTones();
    try {
      const stream = await getMedia(callType);
      const pc = createPeerConnection(callerInfo.id);

      stream.getTracks().forEach((track) => {
        pc.addTrack(track, stream);
      });

      await pc.setRemoteDescription(new RTCSessionDescription(pendingOfferRef.current));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      emitSignal('answerCall', { to: callerInfo.id, answer });
      emitSignal('answer-call', { to: callerInfo.id, answer });

      setCallState('connected');
      if (!callTimerRef.current) {
        setCallDuration(0);
        callTimerRef.current = setInterval(() => {
          setCallDuration((prev) => prev + 1);
        }, 1000);
      }
    } catch {
      toast.error('Failed to connect call media');
      cleanupCall();
    }
  }, [callerInfo, stopTones, getMedia, callType, createPeerConnection, emitSignal, cleanupCall]);

  // ----------------------------------------------------
  // Reject Incoming Call
  // ----------------------------------------------------
  const rejectCall = useCallback(() => {
    if (callerInfo) {
      emitSignal('rejectCall', { to: callerInfo.id });
      emitSignal('reject-call', { to: callerInfo.id });
    }
    cleanupCall();
  }, [callerInfo, emitSignal, cleanupCall]);

  // ----------------------------------------------------
  // End Active Call
  // ----------------------------------------------------
  const endCall = useCallback(() => {
    const peerId = targetUser?.id || callerInfo?.id;
    if (peerId) {
      emitSignal('endCall', { to: peerId });
      emitSignal('end-call', { to: peerId });
    }
    toast.info('Call ended');
    cleanupCall();
  }, [targetUser, callerInfo, emitSignal, cleanupCall]);

  // ----------------------------------------------------
  // Media Controls (Mic, Video, Screen Share)
  // ----------------------------------------------------
  const toggleMic = useCallback(() => {
    if (localStream) {
      const audioTrack = localStream.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setIsMicMuted(!audioTrack.enabled);

        const peerId = targetUser?.id || callerInfo?.id;
        if (peerId) {
          emitSignal('toggleMedia', { to: peerId, type: 'audio', enabled: audioTrack.enabled });
          emitSignal('toggle-media', { to: peerId, type: 'audio', enabled: audioTrack.enabled });
        }
      }
    }
  }, [localStream, targetUser, callerInfo, emitSignal]);

  const toggleVideo = useCallback(() => {
    if (localStream) {
      const videoTrack = localStream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        setIsVideoOff(!videoTrack.enabled);

        const peerId = targetUser?.id || callerInfo?.id;
        if (peerId) {
          emitSignal('toggleMedia', { to: peerId, type: 'video', enabled: videoTrack.enabled });
          emitSignal('toggle-media', { to: peerId, type: 'video', enabled: videoTrack.enabled });
        }
      }
    }
  }, [localStream, targetUser, callerInfo, emitSignal]);

  const toggleScreenShare = useCallback(async () => {
    if (!peerConnectionRef.current || !localStream) return;

    const pc = peerConnectionRef.current;
    const senders = pc.getSenders();
    const videoSender = senders.find((s) => s.track && s.track.kind === 'video');

    if (isScreenSharing) {
      if (screenTrackRef.current) {
        screenTrackRef.current.stop();
        screenTrackRef.current = null;
      }
      if (originalVideoTrackRef.current && videoSender) {
        await videoSender.replaceTrack(originalVideoTrackRef.current);
      }
      setIsScreenSharing(false);
    } else {
      try {
        const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
        const screenTrack = screenStream.getVideoTracks()[0];
        screenTrackRef.current = screenTrack;

        const currentVideoTrack = localStream.getVideoTracks()[0];
        if (currentVideoTrack) {
          originalVideoTrackRef.current = currentVideoTrack;
        }

        if (videoSender) {
          await videoSender.replaceTrack(screenTrack);
        } else {
          pc.addTrack(screenTrack, localStream);
        }

        setIsScreenSharing(true);

        screenTrack.onended = async () => {
          if (originalVideoTrackRef.current && videoSender) {
            await videoSender.replaceTrack(originalVideoTrackRef.current);
          }
          setIsScreenSharing(false);
        };
      } catch {
        toast.error('Screen sharing cancelled or unsupported');
      }
    }
  }, [isScreenSharing, localStream]);

  // ----------------------------------------------------
  // Shared Signaling Message Processors
  // ----------------------------------------------------
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const processIncomingCall = useCallback((data: any) => {
    const isTargetingMe =
      !data.to ||
      (currentUser?.id && data.to === currentUser.id) ||
      (currentUser?.username && data.to === currentUser.username);

    if (!isTargetingMe) return;

    if (callState !== 'idle') {
      emitSignal('rejectCall', { to: data.callerInfo?.id || data.from, reason: 'busy' });
      emitSignal('reject-call', { to: data.callerInfo?.id || data.from, reason: 'busy' });
      return;
    }

    setCallState('incoming');
    setCallType(data.callType || 'video');
    setCallerInfo(data.callerInfo || { id: data.from, name: 'Incoming Call' });
    pendingOfferRef.current = data.offer;
    playRingtone();
  }, [currentUser, callState, emitSignal, playRingtone]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const processCallAccepted = useCallback(async (data: any) => {
    const isTargetingMe =
      !data.to ||
      (currentUser?.id && data.to === currentUser.id) ||
      (currentUser?.username && data.to === currentUser.username);

    if (!isTargetingMe) return;

    stopTones();
    if (peerConnectionRef.current && data.answer) {
      await peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(data.answer));
      setCallState('connected');
      if (!callTimerRef.current) {
        setCallDuration(0);
        callTimerRef.current = setInterval(() => {
          setCallDuration((prev) => prev + 1);
        }, 1000);
      }
    }
  }, [currentUser, stopTones]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const processIceCandidate = useCallback(async (data: any) => {
    const isTargetingMe =
      !data.to ||
      (currentUser?.id && data.to === currentUser.id) ||
      (currentUser?.username && data.to === currentUser.username);

    if (!isTargetingMe) return;

    if (peerConnectionRef.current && data.candidate) {
      try {
        await peerConnectionRef.current.addIceCandidate(new RTCIceCandidate(data.candidate));
      } catch {
        // Candidate error ignore
      }
    }
  }, [currentUser]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const processCallRejected = useCallback((data: any) => {
    const isTargetingMe =
      !data.to ||
      (currentUser?.id && data.to === currentUser.id) ||
      (currentUser?.username && data.to === currentUser.username);

    if (!isTargetingMe) return;

    if (data?.reason === 'busy') {
      toast.info('User is currently on another call');
    } else {
      toast.info('Call declined');
    }
    cleanupCall();
  }, [currentUser, cleanupCall]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const processCallEnded = useCallback((data: any) => {
    const isTargetingMe =
      !data ||
      !data.to ||
      (currentUser?.id && data.to === currentUser.id) ||
      (currentUser?.username && data.to === currentUser.username);

    if (!isTargetingMe) return;

    toast.info('Call ended by remote user');
    cleanupCall();
  }, [currentUser, cleanupCall]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const processToggleMedia = useCallback((data: any) => {
    const isTargetingMe =
      !data.to ||
      (currentUser?.id && data.to === currentUser.id) ||
      (currentUser?.username && data.to === currentUser.username);

    if (!isTargetingMe) return;

    if (data.type === 'audio') {
      setRemoteMicMuted(!data.enabled);
    } else if (data.type === 'video') {
      setRemoteVideoOff(!data.enabled);
    }
  }, [currentUser]);

  // ----------------------------------------------------
  // Listen to Socket.io & BroadcastChannel signals
  // ----------------------------------------------------
  useEffect(() => {
    // 1. BroadcastChannel Listener (Multi-tab / local network fallback)
    const channel = broadcastChannelRef.current;
    if (channel) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      channel.onmessage = (msg: MessageEvent<any>) => {
        const { event, data, senderId } = msg.data || {};
        if (senderId && currentUser?.id && senderId === currentUser.id) return; // ignore self broadcast

        if (event === 'callUser' || event === 'call-user' || event === 'incomingCall' || event === 'incoming-call') {
          processIncomingCall(data);
        } else if (event === 'answerCall' || event === 'answer-call' || event === 'callAccepted' || event === 'call-accepted') {
          processCallAccepted(data);
        } else if (event === 'iceCandidate' || event === 'ice-candidate') {
          processIceCandidate(data);
        } else if (event === 'rejectCall' || event === 'reject-call' || event === 'callRejected' || event === 'call-rejected') {
          processCallRejected(data);
        } else if (event === 'endCall' || event === 'end-call' || event === 'callEnded' || event === 'call-ended') {
          processCallEnded(data);
        } else if (event === 'toggleMedia' || event === 'toggle-media') {
          processToggleMedia(data);
        }
      };
    }

    // 2. Socket.io Listeners
    if (socket) {
      socket.on('incomingCall', processIncomingCall);
      socket.on('incoming-call', processIncomingCall);

      socket.on('callAccepted', processCallAccepted);
      socket.on('call-accepted', processCallAccepted);

      socket.on('iceCandidate', processIceCandidate);
      socket.on('ice-candidate', processIceCandidate);

      socket.on('callRejected', processCallRejected);
      socket.on('call-rejected', processCallRejected);

      socket.on('callEnded', processCallEnded);
      socket.on('call-ended', processCallEnded);

      socket.on('toggleMedia', processToggleMedia);
      socket.on('toggle-media', processToggleMedia);
    }

    return () => {
      if (socket) {
        socket.off('incomingCall', processIncomingCall);
        socket.off('incoming-call', processIncomingCall);
        socket.off('callAccepted', processCallAccepted);
        socket.off('call-accepted', processCallAccepted);
        socket.off('iceCandidate', processIceCandidate);
        socket.off('ice-candidate', processIceCandidate);
        socket.off('callRejected', processCallRejected);
        socket.off('call-rejected', processCallRejected);
        socket.off('callEnded', processCallEnded);
        socket.off('call-ended', processCallEnded);
        socket.off('toggleMedia', processToggleMedia);
        socket.off('toggle-media', processToggleMedia);
      }
    };
  }, [
    socket,
    currentUser,
    processIncomingCall,
    processCallAccepted,
    processIceCandidate,
    processCallRejected,
    processCallEnded,
    processToggleMedia,
  ]);

  return {
    callState,
    callType,
    targetUser,
    callerInfo,
    localStream,
    remoteStream,
    isMicMuted,
    isVideoOff,
    isScreenSharing,
    remoteMicMuted,
    remoteVideoOff,
    callDuration,
    startCall,
    acceptCall,
    rejectCall,
    endCall,
    toggleMic,
    toggleVideo,
    toggleScreenShare,
  };
}
