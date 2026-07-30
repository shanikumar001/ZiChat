'use client';

import { useEffect, useRef } from 'react';
import { CallState, CallType, CallUser } from '../../../hooks/useWebRTCCall';
import { getMediaUrl } from '../../../lib/utils';
import {
  Phone,
  PhoneOff,
  Video,
  VideoOff,
  Mic,
  MicOff,
  Monitor,
  Volume2,
  VolumeX,
  User,
  ShieldCheck,
} from 'lucide-react';

interface CallModalProps {
  callState: CallState;
  callType: CallType;
  targetUser: CallUser | null;
  callerInfo: CallUser | null;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  isMicMuted: boolean;
  isVideoOff: boolean;
  isScreenSharing: boolean;
  remoteMicMuted: boolean;
  remoteVideoOff: boolean;
  callDuration: number;
  acceptCall: () => void;
  rejectCall: () => void;
  endCall: () => void;
  toggleMic: () => void;
  toggleVideo: () => void;
  toggleScreenShare: () => void;
}

export function CallModal({
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
  acceptCall,
  rejectCall,
  endCall,
  toggleMic,
  toggleVideo,
  toggleScreenShare,
}: CallModalProps) {
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);

  // Attach local stream to video element
  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream;
    }
  }, [localStream]);

  // Attach remote stream to video element
  useEffect(() => {
    if (remoteVideoRef.current && remoteStream) {
      remoteVideoRef.current.srcObject = remoteStream;
    }
  }, [remoteStream]);

  if (callState === 'idle') return null;

  const activePeer = callState === 'incoming' ? callerInfo : targetUser || callerInfo;
  const peerName = activePeer?.name || activePeer?.username || 'User';
  const peerAvatar = activePeer?.avatar ? getMediaUrl(activePeer.avatar) : null;

  const formatDuration = (sec: number) => {
    const mins = Math.floor(sec / 60);
    const secs = sec % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/85 backdrop-blur-xl p-4 sm:p-6 transition-all duration-300 animate-in fade-in">
      {/* Container Card */}
      <div className="relative w-full max-w-4xl h-[85vh] max-h-[750px] bg-slate-900/90 rounded-3xl border border-slate-800/80 shadow-2xl overflow-hidden flex flex-col justify-between">
        
        {/* Header Bar */}
        <div className="absolute top-0 inset-x-0 z-20 flex items-center justify-between px-6 py-4 bg-gradient-to-b from-slate-950/80 to-transparent">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
              {callType === 'video' ? <Video className="w-5 h-5" /> : <Phone className="w-5 h-5" />}
            </div>
            <div>
              <h3 className="text-white font-semibold text-base sm:text-lg flex items-center gap-2">
                {peerName}
                <ShieldCheck className="w-4 h-4 text-emerald-400 inline" />
              </h3>
              <p className="text-xs text-slate-400 font-medium">
                {callState === 'calling' && 'Calling...'}
                {callState === 'incoming' && `Incoming ${callType === 'video' ? 'Video' : 'Voice'} Call`}
                {callState === 'connected' && formatDuration(callDuration)}
              </p>
            </div>
          </div>

          {/* Call Badge */}
          <div className="px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-semibold uppercase tracking-wider">
            End-to-End Encrypted
          </div>
        </div>

        {/* MAIN BODY / VIDEO GRID */}
        <div className="relative flex-1 w-full h-full bg-slate-950 flex items-center justify-center overflow-hidden">
          
          {/* 1. INCOMING CALL SCREEN */}
          {callState === 'incoming' && (
            <div className="flex flex-col items-center justify-center text-center px-4">
              {/* Pulsing Avatar */}
              <div className="relative mb-6">
                <div className="absolute -inset-4 rounded-full bg-emerald-500/20 animate-ping duration-1000" />
                <div className="absolute -inset-8 rounded-full bg-emerald-500/10 animate-pulse duration-1000" />
                <div className="relative w-32 h-32 rounded-full overflow-hidden border-4 border-emerald-500 shadow-2xl bg-slate-800 flex items-center justify-center">
                  {peerAvatar ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={peerAvatar} alt={peerName} className="w-full h-full object-cover" />
                  ) : (
                    <User className="w-16 h-16 text-slate-400" />
                  )}
                </div>
              </div>
              <h2 className="text-2xl font-bold text-white mb-1">{peerName}</h2>
              <p className="text-slate-400 text-sm mb-8 animate-pulse">
                Incoming ZiChat {callType === 'video' ? 'Video' : 'Voice'} Call...
              </p>

              {/* Action Buttons: Accept / Decline */}
              <div className="flex items-center space-x-8">
                <button
                  onClick={rejectCall}
                  className="group flex flex-col items-center focus:outline-none"
                >
                  <div className="w-16 h-16 rounded-full bg-rose-600 hover:bg-rose-500 text-white flex items-center justify-center shadow-lg shadow-rose-600/40 transition-transform transform group-hover:scale-110">
                    <PhoneOff className="w-8 h-8" />
                  </div>
                  <span className="text-xs text-slate-400 mt-2 font-medium">Decline</span>
                </button>

                <button
                  onClick={acceptCall}
                  className="group flex flex-col items-center focus:outline-none"
                >
                  <div className="w-16 h-16 rounded-full bg-emerald-600 hover:bg-emerald-500 text-white flex items-center justify-center shadow-lg shadow-emerald-600/40 transition-transform transform group-hover:scale-110 animate-bounce">
                    {callType === 'video' ? <Video className="w-8 h-8" /> : <Phone className="w-8 h-8" />}
                  </div>
                  <span className="text-xs text-emerald-400 mt-2 font-semibold">Accept</span>
                </button>
              </div>
            </div>
          )}

          {/* 2. OUTGOING / CALLING SCREEN */}
          {callState === 'calling' && (
            <div className="flex flex-col items-center justify-center text-center px-4">
              <div className="relative mb-6">
                <div className="absolute -inset-6 rounded-full bg-emerald-500/10 animate-pulse" />
                <div className="w-28 h-28 rounded-full overflow-hidden border-2 border-emerald-500/50 shadow-xl bg-slate-800 flex items-center justify-center">
                  {peerAvatar ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={peerAvatar} alt={peerName} className="w-full h-full object-cover" />
                  ) : (
                    <User className="w-14 h-14 text-slate-400" />
                  )}
                </div>
              </div>
              <h2 className="text-2xl font-bold text-white mb-1">{peerName}</h2>
              <p className="text-slate-400 text-sm mb-8 animate-pulse">Ringing...</p>

              <button
                onClick={endCall}
                className="w-14 h-14 rounded-full bg-rose-600 hover:bg-rose-500 text-white flex items-center justify-center shadow-lg shadow-rose-600/40 transition-transform hover:scale-105"
              >
                <PhoneOff className="w-7 h-7" />
              </button>
            </div>
          )}

          {/* 3. CONNECTED ACTIVE CALL SCREEN */}
          {callState === 'connected' && (
            <>
              {/* REMOTE STREAM (Main Screen) */}
              <div className="relative w-full h-full bg-slate-950 flex items-center justify-center">
                {callType === 'video' && !remoteVideoOff && remoteStream ? (
                  <video
                    ref={remoteVideoRef}
                    autoPlay
                    playsInline
                    className="w-full h-full object-cover"
                  />
                ) : (
                  /* Audio Mode or Remote Video Disabled */
                  <div className="flex flex-col items-center justify-center">
                    <div className="relative mb-4">
                      <div className="absolute -inset-6 rounded-full bg-emerald-500/20 animate-pulse duration-1000" />
                      <div className="w-36 h-36 rounded-full overflow-hidden border-4 border-slate-700 shadow-2xl bg-slate-800 flex items-center justify-center">
                        {peerAvatar ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={peerAvatar} alt={peerName} className="w-full h-full object-cover" />
                        ) : (
                          <User className="w-16 h-16 text-slate-400" />
                        )}
                      </div>
                    </div>
                    <h3 className="text-xl font-bold text-white">{peerName}</h3>
                    <p className="text-xs text-emerald-400 mt-1 flex items-center gap-1.5">
                      {remoteMicMuted ? (
                        <>
                          <VolumeX className="w-4 h-4 text-rose-400" /> Muted
                        </>
                      ) : (
                        <>
                          <Volume2 className="w-4 h-4 text-emerald-400 animate-pulse" /> Speaking...
                        </>
                      )}
                    </p>
                  </div>
                )}
              </div>

              {/* LOCAL STREAM PIP (Picture-in-Picture Floating Window) */}
              <div className="absolute top-16 right-4 sm:top-20 sm:right-6 w-32 h-44 sm:w-44 sm:h-60 rounded-2xl overflow-hidden border-2 border-slate-700/80 bg-slate-900 shadow-2xl z-30 transition-all hover:scale-105">
                {callType === 'video' && !isVideoOff && localStream ? (
                  <video
                    ref={localVideoRef}
                    autoPlay
                    playsInline
                    muted
                    className="w-full h-full object-cover transform -scale-x-100"
                  />
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center bg-slate-900 text-slate-400 p-2 text-center">
                    <VideoOff className="w-8 h-8 mb-2 text-slate-500" />
                    <span className="text-[10px] font-medium text-slate-400">Camera Off</span>
                  </div>
                )}
                {isMicMuted && (
                  <div className="absolute bottom-2 left-2 bg-rose-600/90 text-white p-1 rounded-full text-xs">
                    <MicOff className="w-3 h-3" />
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* BOTTOM CONTROLS TOOLBAR (Active Call) */}
        {callState === 'connected' && (
          <div className="absolute bottom-0 inset-x-0 z-20 py-6 px-4 bg-gradient-to-t from-slate-950 via-slate-950/90 to-transparent flex items-center justify-center space-x-4 sm:space-x-6">
            {/* Toggle Mic */}
            <button
              onClick={toggleMic}
              className={`w-12 h-12 sm:w-14 sm:h-14 rounded-full flex items-center justify-center transition-all ${
                isMicMuted
                  ? 'bg-rose-600 text-white shadow-lg shadow-rose-600/30'
                  : 'bg-slate-800 hover:bg-slate-700 text-white border border-slate-700'
              }`}
              title={isMicMuted ? 'Unmute Microphone' : 'Mute Microphone'}
            >
              {isMicMuted ? <MicOff className="w-6 h-6" /> : <Mic className="w-6 h-6" />}
            </button>

            {/* Toggle Camera */}
            {callType === 'video' && (
              <button
                onClick={toggleVideo}
                className={`w-12 h-12 sm:w-14 sm:h-14 rounded-full flex items-center justify-center transition-all ${
                  isVideoOff
                    ? 'bg-rose-600 text-white shadow-lg shadow-rose-600/30'
                    : 'bg-slate-800 hover:bg-slate-700 text-white border border-slate-700'
                }`}
                title={isVideoOff ? 'Turn On Camera' : 'Turn Off Camera'}
              >
                {isVideoOff ? <VideoOff className="w-6 h-6" /> : <Video className="w-6 h-6" />}
              </button>
            )}

            {/* Toggle Screen Share */}
            {callType === 'video' && (
              <button
                onClick={toggleScreenShare}
                className={`w-12 h-12 sm:w-14 sm:h-14 rounded-full flex items-center justify-center transition-all ${
                  isScreenSharing
                    ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-600/30'
                    : 'bg-slate-800 hover:bg-slate-700 text-white border border-slate-700'
                }`}
                title={isScreenSharing ? 'Stop Sharing Screen' : 'Share Screen'}
              >
                <Monitor className="w-6 h-6" />
              </button>
            )}

            {/* End Call */}
            <button
              onClick={endCall}
              className="w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-rose-600 hover:bg-rose-500 text-white flex items-center justify-center shadow-xl shadow-rose-600/40 transition-transform hover:scale-105"
              title="End Call"
            >
              <PhoneOff className="w-7 h-7" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
