import { useState, useEffect, useRef } from 'react';
import { CallSession } from '../types';
import { db } from '../lib/firebase';
import { doc, updateDoc } from 'firebase/firestore';
import { Phone, Video, Mic, MicOff, VideoOff, Volume2, Shield, User, Monitor } from 'lucide-react';

interface CallModalProps {
  currentCall: CallSession;
  currentUserId: string;
  onClose: () => void;
}

export default function CallModal({ currentCall, currentUserId, onClose }: CallModalProps) {
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(currentCall.type === 'audio');
  const [isSpeakerOn, setIsSpeakerOn] = useState(true);
  const [callDuration, setCallDuration] = useState(0);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const isIncoming = currentCall.receiverId === currentUserId && currentCall.status === 'ringing';
  const isOutgoing = currentCall.callerId === currentUserId && currentCall.status === 'ringing';
  const isConnected = currentCall.status === 'connected';

  useEffect(() => {
    if (isConnected) {
      timerRef.current = setInterval(() => {
        setCallDuration((prev) => prev + 1);
      }, 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
      setCallDuration(0);
    }

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isConnected]);

  const handleDecline = async () => {
    try {
      const callRef = doc(db, 'calls', currentCall.id);
      await updateDoc(callRef, { status: 'declined' });
      onClose();
    } catch (e) {
      console.error('Error declining call:', e);
      onClose();
    }
  };

  const handleAccept = async () => {
    try {
      const callRef = doc(db, 'calls', currentCall.id);
      await updateDoc(callRef, { status: 'connected' });
    } catch (e) {
      console.error('Error accepting call:', e);
    }
  };

  const handleEnd = async () => {
    try {
      const callRef = doc(db, 'calls', currentCall.id);
      await updateDoc(callRef, { status: 'ended' });
      onClose();
    } catch (e) {
      console.error('Error ending call:', e);
      onClose();
    }
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Determine whose info to show as the "Other Person"
  const isCaller = currentCall.callerId === currentUserId;
  const otherPersonName = isCaller ? currentCall.receiverName : currentCall.callerName;
  const otherPersonPhoto = isCaller ? currentCall.receiverPhoto : currentCall.callerPhoto;

  return (
    <div className="fixed inset-0 z-50 bg-black text-white flex flex-col justify-between p-6 overflow-hidden md:max-w-[420px] md:h-[740px] md:mx-auto md:my-auto md:inset-x-0 md:inset-y-0 md:rounded-3xl md:shadow-2xl md:border md:border-zinc-800">
      
      {/* Encryption Header Indicator */}
      <div className="flex items-center justify-center gap-1.5 text-[10px] text-emerald-400 font-medium py-1.5 px-3 bg-emerald-950/40 rounded-full w-fit mx-auto mt-2">
        <Shield className="w-3 h-3" />
        End-to-End Encrypted Calling
      </div>

      {/* Main Video or Audio Screen */}
      <div className="flex-1 flex flex-col items-center justify-center relative my-4">
        {isVideoOff ? (
          /* AUDIO CALL INTERFACE - Beautiful Pulsing Ripples */
          <div className="flex flex-col items-center">
            <div className="relative flex items-center justify-center w-36 h-36">
              {/* Outer pulsing rings */}
              <div className="absolute inset-0 rounded-full bg-teal-500/10 animate-ping duration-1000" />
              <div className="absolute inset-4 rounded-full bg-teal-500/20 animate-pulse" />
              
              <div className={`w-28 h-28 rounded-full bg-gradient-to-tr ${otherPersonPhoto || 'from-teal-500 to-emerald-600'} flex items-center justify-center text-4xl shadow-xl border-4 border-slate-900`}>
                <User className="w-12 h-12 text-white" />
              </div>
            </div>

            <h3 className="text-xl font-bold mt-6 text-slate-100">{otherPersonName}</h3>
            
            <p className="text-sm font-medium text-slate-400 mt-2">
              {isIncoming && 'Incoming Audio Call...'}
              {isOutgoing && 'Calling...'}
              {isConnected && `Connected • ${formatDuration(callDuration)}`}
            </p>
          </div>
        ) : (
          /* VIDEO CALL INTERFACE */
          <div className="absolute inset-0 w-full h-full rounded-2xl overflow-hidden bg-slate-900 flex items-center justify-center">
            {/* Main Remote Video Feed Simulation */}
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-900">
              {/* Background gradient blur */}
              <div className={`absolute inset-0 opacity-20 bg-gradient-to-tr ${otherPersonPhoto || 'from-teal-500 to-emerald-600'} blur-xl scale-125`} />
              
              {/* Remote avatar centered */}
              <div className="relative flex flex-col items-center z-10">
                <div className={`w-24 h-24 rounded-full bg-gradient-to-tr ${otherPersonPhoto || 'from-teal-500 to-emerald-600'} flex items-center justify-center text-3xl shadow-lg border-2 border-slate-700`}>
                  <User className="w-10 h-10 text-white" />
                </div>
                <h3 className="text-lg font-bold mt-4 text-slate-100">{otherPersonName}</h3>
                <p className="text-xs text-slate-400 mt-1">
                  {isIncoming && 'Incoming Video Call...'}
                  {isOutgoing && 'Ringing...'}
                  {isConnected && `Connected • ${formatDuration(callDuration)}`}
                </p>
              </div>

              {/* Animated wave pattern overlay for active calls */}
              {isConnected && (
                <div className="absolute bottom-6 left-6 right-6 h-12 flex items-end justify-center gap-1 overflow-hidden opacity-30">
                  {[...Array(16)].map((_, i) => (
                    <div
                      key={i}
                      className="w-1 bg-teal-400 rounded-full"
                      style={{
                        height: `${Math.random() * 100}%`,
                        animation: `pulse 1s ease-in-out infinite alternate`,
                        animationDelay: `${i * 0.05}s`
                      }}
                    />
                  ))}
                </div>
              )}
            </div>

            {/* Local Video Picture-in-Picture (bottom right) */}
            {isConnected && (
              <div className="absolute bottom-4 right-4 w-28 h-40 bg-slate-800 rounded-xl border-2 border-slate-700 shadow-2xl overflow-hidden flex flex-col items-center justify-center">
                <div className="w-10 h-10 rounded-full bg-slate-700 flex items-center justify-center text-white">
                  <User className="w-5 h-5" />
                </div>
                <span className="text-[9px] font-semibold text-slate-400 mt-1.5 uppercase">You</span>
                <span className="absolute bottom-2 left-2 p-1 rounded bg-black/60 text-[8px] font-mono flex items-center gap-1 text-slate-300">
                  <Monitor className="w-2.5 h-2.5" /> Live
                </span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Button Controls Container */}
      <div className="p-4 bg-slate-900/80 backdrop-blur-md rounded-2xl border border-slate-800/80 shadow-2xl space-y-4">
        
        {/* Connection status ticker */}
        {isConnected && (
          <div className="flex items-center justify-between px-2">
            <span className="text-[10px] font-medium text-slate-400">Audio/Video Quality</span>
            <span className="text-[10px] font-semibold text-teal-400 flex items-center gap-1">
              <div className="w-1.5 h-1.5 bg-teal-400 rounded-full animate-pulse" /> HD Stereo
            </span>
          </div>
        )}

        {/* Action Button Row */}
        <div className="flex items-center justify-center gap-5">
          {/* Incoming Call Accept/Decline State */}
          {isIncoming ? (
            <>
              <button
                onClick={handleDecline}
                className="w-14 h-14 bg-rose-600 hover:bg-rose-700 active:scale-95 text-white rounded-full flex items-center justify-center shadow-lg shadow-rose-600/20 cursor-pointer transition"
              >
                <Phone className="w-6 h-6 rotate-[135deg]" />
              </button>
              <button
                onClick={handleAccept}
                className="w-14 h-14 bg-teal-500 hover:bg-teal-600 active:scale-95 text-white rounded-full flex items-center justify-center shadow-lg shadow-teal-500/20 cursor-pointer transition"
              >
                {currentCall.type === 'video' ? <Video className="w-6 h-6" /> : <Phone className="w-6 h-6" />}
              </button>
            </>
          ) : (
            /* Active Call Controls (Mute, Video-Toggle, End-Call) */
            <>
              {/* Mic Toggle Button */}
              <button
                onClick={() => setIsMuted(!isMuted)}
                className={`w-11 h-11 rounded-full flex items-center justify-center cursor-pointer transition ${
                  isMuted ? 'bg-red-600 text-white' : 'bg-slate-800 text-slate-200 hover:bg-slate-700'
                }`}
              >
                {isMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
              </button>

              {/* End Call Button */}
              <button
                onClick={handleEnd}
                className="w-14 h-14 bg-rose-600 hover:bg-rose-700 active:scale-95 text-white rounded-full flex items-center justify-center shadow-lg shadow-rose-600/20 cursor-pointer transition"
              >
                <Phone className="w-6 h-6 rotate-[135deg]" />
              </button>

              {/* Video Camera Toggle Button */}
              <button
                onClick={() => setIsVideoOff(!isVideoOff)}
                className={`w-11 h-11 rounded-full flex items-center justify-center cursor-pointer transition ${
                  isVideoOff ? 'bg-slate-800 text-slate-400' : 'bg-slate-800 text-slate-200 hover:bg-slate-700'
                }`}
              >
                {isVideoOff ? <VideoOff className="w-5 h-5" /> : <Video className="w-5 h-5" />}
              </button>
            </>
          )}
        </div>
      </div>
      
    </div>
  );
}
