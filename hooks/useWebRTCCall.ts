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
      // Audio context might be restricted before user gesture
    }
  }, []);

  const playRingtone = useCallback(() => {
    stopTones();
    const trigger = () => {
      playTone(852, 1209, 1.2); // WhatsApp incoming call tone dual-frequency
    };
    trigger();
    ringtoneTimerRef.current = setInterval(trigger, 2500);
  }, [playTone, stopTones]);

  const playRingback = useCallback(() => {
    stopTones();
    const trigger = () => {
      playTone(440, 480, 1.5); // Classic US/UK call ringback
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
  // Helper: Get User Media Stream
  // ----------------------------------------------------
  const getMedia = useCallback(async (type: CallType) => {
    try {
      const constraints: MediaStreamConstraints = {
        audio: true,
        video: type === 'video' ? { width: { ideal: 1280 }, height: { ideal: 720 } } : false,
      };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      setLocalStream(stream);
      return stream;
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : 'Camera/Microphone permission denied';
      toast.error(errorMsg);
      throw err;
    }
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
      if (event.candidate && socket) {
        socket.emit('iceCandidate', { to: targetUserId, candidate: event.candidate });
        socket.emit('ice-candidate', { to: targetUserId, candidate: event.candidate });
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
  }, [socket, stopTones, cleanupCall]);

  // ----------------------------------------------------
  // Start Outgoing Call
  // ----------------------------------------------------
  const startCall = useCallback(async (userToCall: CallUser, type: CallType) => {
    if (!socket || !isConnected) {
      toast.error('Socket connection offline. Unable to initiate call.');
      return;
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
        id: currentUser?.id,
        name: currentUser?.name || currentUser?.username || 'User',
        username: currentUser?.username,
        avatar: currentUser?.profilePhoto,
      };

      socket.emit('callUser', {
        to: userToCall.id,
        offer,
        callType: type,
        callerInfo: callerData,
      });

      socket.emit('call-user', {
        to: userToCall.id,
        offer,
        callType: type,
        callerInfo: callerData,
      });
    } catch {
      cleanupCall();
    }
  }, [socket, isConnected, playRingback, getMedia, createPeerConnection, currentUser, cleanupCall]);

  // ----------------------------------------------------
  // Accept Incoming Call
  // ----------------------------------------------------
  const acceptCall = useCallback(async () => {
    if (!callerInfo || !pendingOfferRef.current || !socket) return;

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

      socket.emit('answerCall', { to: callerInfo.id, answer });
      socket.emit('answer-call', { to: callerInfo.id, answer });

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
  }, [callerInfo, socket, stopTones, getMedia, callType, createPeerConnection, cleanupCall]);

  // ----------------------------------------------------
  // Reject Incoming Call
  // ----------------------------------------------------
  const rejectCall = useCallback(() => {
    if (callerInfo && socket) {
      socket.emit('rejectCall', { to: callerInfo.id });
      socket.emit('reject-call', { to: callerInfo.id });
    }
    cleanupCall();
  }, [callerInfo, socket, cleanupCall]);

  // ----------------------------------------------------
  // End Active Call
  // ----------------------------------------------------
  const endCall = useCallback(() => {
    const peerId = targetUser?.id || callerInfo?.id;
    if (peerId && socket) {
      socket.emit('endCall', { to: peerId });
      socket.emit('end-call', { to: peerId });
    }
    toast.info('Call ended');
    cleanupCall();
  }, [targetUser, callerInfo, socket, cleanupCall]);

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
        if (peerId && socket) {
          socket.emit('toggleMedia', { to: peerId, type: 'audio', enabled: audioTrack.enabled });
          socket.emit('toggle-media', { to: peerId, type: 'audio', enabled: audioTrack.enabled });
        }
      }
    }
  }, [localStream, targetUser, callerInfo, socket]);

  const toggleVideo = useCallback(() => {
    if (localStream) {
      const videoTrack = localStream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        setIsVideoOff(!videoTrack.enabled);

        const peerId = targetUser?.id || callerInfo?.id;
        if (peerId && socket) {
          socket.emit('toggleMedia', { to: peerId, type: 'video', enabled: videoTrack.enabled });
          socket.emit('toggle-media', { to: peerId, type: 'video', enabled: videoTrack.enabled });
        }
      }
    }
  }, [localStream, targetUser, callerInfo, socket]);

  const toggleScreenShare = useCallback(async () => {
    if (!peerConnectionRef.current || !localStream) return;

    const pc = peerConnectionRef.current;
    const senders = pc.getSenders();
    const videoSender = senders.find((s) => s.track && s.track.kind === 'video');

    if (isScreenSharing) {
      // Revert to camera
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
  // Socket Signal Listeners
  // ----------------------------------------------------
  useEffect(() => {
    if (!socket || !isConnected) return;

    // 1. Incoming Call Event
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const handleIncomingCall = (data: any) => {
      if (callState !== 'idle') {
        // Busy signal back to caller
        socket.emit('rejectCall', { to: data.callerInfo?.id || data.from, reason: 'busy' });
        socket.emit('reject-call', { to: data.callerInfo?.id || data.from, reason: 'busy' });
        return;
      }

      setCallState('incoming');
      setCallType(data.callType || 'video');
      setCallerInfo(data.callerInfo || { id: data.from, name: 'Incoming Call' });
      pendingOfferRef.current = data.offer;
      playRingtone();
    };

    // 2. Call Accepted Event
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const handleCallAccepted = async (data: any) => {
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
    };

    // 3. ICE Candidate Event
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const handleIceCandidate = async (data: any) => {
      if (peerConnectionRef.current && data.candidate) {
        try {
          await peerConnectionRef.current.addIceCandidate(new RTCIceCandidate(data.candidate));
        } catch {
          // Candidate error ignore
        }
      }
    };

    // 4. Call Rejected Event
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const handleCallRejected = (data: any) => {
      if (data?.reason === 'busy') {
        toast.info('User is currently on another call');
      } else {
        toast.info('Call declined');
      }
      cleanupCall();
    };

    // 5. Call Ended Event
    const handleCallEnded = () => {
      toast.info('Call ended by remote user');
      cleanupCall();
    };

    // 6. Media Toggle Event
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const handleToggleMedia = (data: any) => {
      if (data.type === 'audio') {
        setRemoteMicMuted(!data.enabled);
      } else if (data.type === 'video') {
        setRemoteVideoOff(!data.enabled);
      }
    };

    socket.on('incomingCall', handleIncomingCall);
    socket.on('incoming-call', handleIncomingCall);

    socket.on('callAccepted', handleCallAccepted);
    socket.on('call-accepted', handleCallAccepted);

    socket.on('iceCandidate', handleIceCandidate);
    socket.on('ice-candidate', handleIceCandidate);

    socket.on('callRejected', handleCallRejected);
    socket.on('call-rejected', handleCallRejected);

    socket.on('callEnded', handleCallEnded);
    socket.on('call-ended', handleCallEnded);

    socket.on('toggleMedia', handleToggleMedia);
    socket.on('toggle-media', handleToggleMedia);

    return () => {
      socket.off('incomingCall', handleIncomingCall);
      socket.off('incoming-call', handleIncomingCall);
      socket.off('callAccepted', handleCallAccepted);
      socket.off('call-accepted', handleCallAccepted);
      socket.off('iceCandidate', handleIceCandidate);
      socket.off('ice-candidate', handleIceCandidate);
      socket.off('callRejected', handleCallRejected);
      socket.off('call-rejected', handleCallRejected);
      socket.off('callEnded', handleCallEnded);
      socket.off('call-ended', handleCallEnded);
      socket.off('toggleMedia', handleToggleMedia);
      socket.off('toggle-media', handleToggleMedia);
    };
  }, [socket, isConnected, callState, playRingtone, stopTones, cleanupCall]);

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
