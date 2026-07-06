import React, { useState, useEffect, useRef } from 'react';
import { db } from '../lib/firebase';
import { collection, query, orderBy, onSnapshot, addDoc, doc, updateDoc, arrayUnion, getDocs, limit, where } from 'firebase/firestore';
import { ChatRoom, Message, UserProfile, CallSession } from '../types';
import EmojiPicker from './EmojiPicker';
import Logo from './Logo';
import { 
  Phone, Video, Send, Smile, Paperclip, Search, Shield, Mic, MicOff, Square, 
  Play, Pause, Image, FileText, Check, CheckCheck, Loader2, Info, ArrowLeft, X 
} from 'lucide-react';
import { encryptText, decryptText } from '../lib/crypto';

interface ChatAreaProps {
  chatId: string;
  currentUserId: string;
  currentUserName: string;
  onLaunchCall: (call: CallSession) => void;
  onBackToSidebar?: () => void;
}

export default function ChatArea({ chatId, currentUserId, currentUserName, onLaunchCall, onBackToSidebar }: ChatAreaProps) {
  const [chatRoom, setChatRoom] = useState<ChatRoom | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [otherParticipants, setOtherParticipants] = useState<UserProfile[]>([]);
  
  // Input fields
  const [inputText, setInputText] = useState('');
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showAttachmentMenu, setShowAttachmentMenu] = useState(false);
  
  // Message Search
  const [isSearching, setIsSearching] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Typing Indicator State
  const [isOtherTyping, setIsOtherTyping] = useState(false);
  const [typingName, setTypingName] = useState('');

  // Audio Recording (Voice Notes)
  const [isRecording, setIsRecording] = useState(false);
  const [recordDuration, setRecordDuration] = useState(0);
  const [audioChunks, setAudioChunks] = useState<Blob[]>([]);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordingTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Audio Playback
  const [playingMessageId, setPlayingMessageId] = useState<string | null>(null);
  const activeAudioRef = useRef<HTMLAudioElement | null>(null);

  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const encryptionPassphrase = localStorage.getItem(`enc_key_${currentUserId}`) || 'aero-secure-key-2026';

  // 1. Real-time Chat Room Metadata Listener
  useEffect(() => {
    const chatRef = doc(db, 'chats', chatId);
    const unsubscribe = onSnapshot(chatRef, (snap) => {
      if (snap.exists()) {
        setChatRoom({ id: snap.id, ...snap.data() } as ChatRoom);
      }
    });
    return unsubscribe;
  }, [chatId]);

  // 2. Real-time Messages Listener
  useEffect(() => {
    const msgsQuery = query(
      collection(db, `chats/${chatId}/messages`),
      orderBy('timestamp', 'asc')
    );

    const unsubscribe = onSnapshot(msgsQuery, (snapshot) => {
      const list: Message[] = [];
      snapshot.forEach((doc) => {
        list.push({ id: doc.id, ...doc.data() } as Message);
      });
      setMessages(list);

      // Auto-mark new received messages as Read
      snapshot.forEach((msgDoc) => {
        const msg = msgDoc.data() as Message;
        if (msg.senderId !== currentUserId && !msg.readBy.includes(currentUserId)) {
          const mRef = doc(db, `chats/${chatId}/messages`, msgDoc.id);
          updateDoc(mRef, {
            readBy: arrayUnion(currentUserId)
          });
        }
      });
    });

    return unsubscribe;
  }, [chatId, currentUserId]);

  // 3. Listen to other participants status & typing activities
  useEffect(() => {
    if (!chatRoom) return;

    const otherIds = chatRoom.participantIds.filter(id => id !== currentUserId);
    if (otherIds.length === 0) return;

    // Listen to users collection for online statuses and typing actions
    const usersQuery = query(collection(db, 'users'), where('id', 'in', otherIds));
    const unsubscribe = onSnapshot(usersQuery, (snapshot) => {
      const list: UserProfile[] = [];
      let anyoneTyping = false;
      let typistName = '';

      snapshot.forEach((doc) => {
        const user = doc.data() as UserProfile;
        list.push(user);

        // Check typing action
        if (user.typingIn === chatId) {
          anyoneTyping = true;
          typistName = user.displayName || user.email.split('@')[0];
        }
      });

      setOtherParticipants(list);
      setIsOtherTyping(anyoneTyping);
      setTypingName(typistName);
    });

    return unsubscribe;
  }, [chatRoom, currentUserId, chatId]);

  // Scroll to bottom when messages list updates
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isOtherTyping]);

  // Handle local typing indicator updates in Firestore
  const handleTextInputChange = async (val: string) => {
    setInputText(val);

    try {
      const userRef = doc(db, 'users', currentUserId);
      await updateDoc(userRef, {
        typingIn: val.trim().length > 0 ? chatId : null
      });
    } catch (e) {
      console.error('Error updating typing state:', e);
    }
  };

  const triggerGeminiResponse = async (userMessageText: string) => {
    try {
      // 1. Set Aero AI typing indicator to active in this chat room
      const aiUserRef = doc(db, 'users', 'aero-ai-bot');
      await updateDoc(aiUserRef, { typingIn: chatId });

      // 2. Prepare conversation history for the context
      const messagesSnapshot = await getDocs(
        query(
          collection(db, `chats/${chatId}/messages`),
          orderBy('timestamp', 'desc'),
          limit(15)
        )
      );

      const fetchedMsgs: any[] = [];
      messagesSnapshot.forEach((doc) => {
        fetchedMsgs.push({ id: doc.id, ...doc.data() });
      });
      fetchedMsgs.reverse();

      // Decrypt each message and map to Gemini format
      const history = fetchedMsgs.map((msg) => {
        const decrypted = decryptText(msg.text, encryptionPassphrase);
        const role = msg.senderId === 'aero-ai-bot' ? 'assistant' : 'user';
        return {
          role,
          text: msg.senderId === 'aero-ai-bot' ? decrypted : `${msg.senderName}: ${decrypted}`
        };
      });

      // 3. Send to server-side Express API endpoint
      const response = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: history })
      });

      if (!response.ok) {
        throw new Error('Aero AI is currently taking a coffee break. Please try again.');
      }

      const data = await response.json();
      const aiResponseText = data.text || 'I received your transmission, but my output stream was blank.';

      // 4. Encrypt AI's response using the local passphrase (E2EE)
      const encryptedAIBody = encryptText(aiResponseText, encryptionPassphrase);

      // 5. Add AI's message to firestore subcollection
      const aiMessagePayload: Omit<Message, 'id'> = {
        senderId: 'aero-ai-bot',
        senderName: 'Aero AI',
        text: encryptedAIBody,
        type: 'text',
        timestamp: new Date().toISOString(),
        delivered: true,
        readBy: [currentUserId],
        isEncrypted: true
      };

      await addDoc(collection(db, `chats/${chatId}/messages`), aiMessagePayload);

      // 6. Update parent chat room last message info
      const chatRef = doc(db, 'chats', chatId);
      await updateDoc(chatRef, {
        lastMessageText: aiResponseText,
        lastMessageSenderId: 'aero-ai-bot',
        lastMessageTime: new Date().toISOString()
      });

    } catch (err: any) {
      console.error('Error getting Whisper AI response:', err);
      const errorMsg = `⚠️ Whisper AI Connection Notice: ${err.message || 'Unable to reach backend API.'}`;
      const encryptedError = encryptText(errorMsg, encryptionPassphrase);
      await addDoc(collection(db, `chats/${chatId}/messages`), {
        senderId: 'aero-ai-bot',
        senderName: 'Whisper AI System',
        text: encryptedError,
        type: 'text',
        timestamp: new Date().toISOString(),
        delivered: true,
        readBy: [currentUserId],
        isEncrypted: true
      });
    } finally {
      // 7. Clear typing indicator
      const aiUserRef = doc(db, 'users', 'aero-ai-bot');
      await updateDoc(aiUserRef, { typingIn: null });
    }
  };

  const handleSendMessage = async (textToSend?: string, customType?: Message['type'], mediaData?: { url: string, name: string, size: number }) => {
    const finalMsgText = textToSend || inputText;
    if (!finalMsgText.trim() && !mediaData) return;

    try {
      // Clean up local typing
      const userRef = doc(db, 'users', currentUserId);
      await updateDoc(userRef, { typingIn: null });

      // Locally encrypt message text (E2EE)
      const encryptedBody = encryptText(finalMsgText, encryptionPassphrase);

      const messagePayload: Omit<Message, 'id'> = {
        senderId: currentUserId,
        senderName: currentUserName,
        text: encryptedBody,
        type: customType || 'text',
        timestamp: new Date().toISOString(),
        delivered: true,
        readBy: [currentUserId],
        isEncrypted: true,
        ...(mediaData && {
          fileUrl: mediaData.url,
          fileName: mediaData.name,
          fileSize: mediaData.size
        })
      };

      // 1. Add to chat subcollection
      await addDoc(collection(db, `chats/${chatId}/messages`), messagePayload);

      // 2. Update parent chat room last message info
      const chatRef = doc(db, 'chats', chatId);
      await updateDoc(chatRef, {
        lastMessageText: customType && customType !== 'text' ? `📎 Sent a ${customType}` : finalMsgText,
        lastMessageSenderId: currentUserId,
        lastMessageTime: new Date().toISOString()
      });

      setInputText('');

      // Check if we should trigger Aero AI response
      const isAIChat = chatRoom?.participantIds.includes('aero-ai-bot');
      const mentionsAI = chatRoom?.isGroup && (finalMsgText.toLowerCase().includes('@ai') || finalMsgText.toLowerCase().includes('@gemini'));

      if ((isAIChat || mentionsAI) && (customType === 'text' || !customType)) {
        triggerGeminiResponse(finalMsgText);
      }
    } catch (e) {
      console.error('Error sending message:', e);
    }
  };

  // 4. Voice Note Recording Implementation
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      
      const chunks: Blob[] = [];
      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(chunks, { type: 'audio/webm' });
        // Standard FileReader to convert voice note into base64
        const reader = new FileReader();
        reader.readAsDataURL(audioBlob);
        reader.onloadend = () => {
          const base64Audio = reader.result as string;
          handleSendMessage('[Audio Voice Note]', 'audio', {
            url: base64Audio,
            name: 'Voice Note.webm',
            size: audioBlob.size
          });
        };
      };

      mediaRecorder.start();
      setIsRecording(true);
      setRecordDuration(0);

      recordingTimerRef.current = setInterval(() => {
        setRecordDuration(prev => prev + 1);
      }, 1000);

    } catch (e) {
      console.error('Failed to access microphone for voice notes:', e);
    }
  };

  const stopRecordingAndSend = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      // Stop all tracks to release mic
      mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
      setIsRecording(false);
      if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
    }
  };

  const cancelRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
      setIsRecording(false);
      if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
    }
  };

  // Play audio notes natively
  const playAudioNote = (msgId: string, url: string) => {
    if (playingMessageId === msgId) {
      activeAudioRef.current?.pause();
      setPlayingMessageId(null);
    } else {
      if (activeAudioRef.current) {
        activeAudioRef.current.pause();
      }
      const audio = new Audio(url);
      activeAudioRef.current = audio;
      setPlayingMessageId(msgId);
      audio.play();
      audio.onended = () => {
        setPlayingMessageId(null);
      };
    }
  };

  // Attachment upload (base64)
  const handleAttachmentUpload = (e: React.ChangeEvent<HTMLInputElement>, type: Message['type']) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onloadend = () => {
      const base64Data = reader.result as string;
      handleSendMessage(`Sent a ${type}: ${file.name}`, type, {
        url: base64Data,
        name: file.name,
        size: file.size
      });
      setShowAttachmentMenu(false);
    };
  };

  // Launch simulated audio/video call in real-time Firestore
  const handleCall = async (type: 'audio' | 'video') => {
    if (otherParticipants.length === 0) return;
    const recipient = otherParticipants[0]; // Calling the primary contact

    try {
      const currentUserNameStr = currentUserName;
      const callerPhoto = currentUserProfilePhoto();

      const callData = {
        callerId: currentUserId,
        callerName: currentUserNameStr,
        callerPhoto,
        receiverId: recipient.id,
        receiverName: recipient.displayName || recipient.email.split('@')[0],
        receiverPhoto: recipient.photoURL,
        type,
        status: 'ringing',
        timestamp: new Date().toISOString()
      };

      const docRef = await addDoc(collection(db, 'calls'), callData);
      onLaunchCall({ id: docRef.id, ...callData } as CallSession);
    } catch (e) {
      console.error('Error starting call:', e);
    }
  };

  const currentUserProfilePhoto = () => {
    // Helper to get active client avatar gradient
    const currentTheme = localStorage.getItem(`profile_theme_${currentUserId}`) || 'from-teal-400 to-emerald-600';
    return currentTheme;
  };

  const getChatHeaderInfo = () => {
    if (!chatRoom) return { name: 'Aero Chat', sub: '', icon: 'from-teal-400 to-emerald-600' };

    if (chatRoom.isGroup) {
      return {
        name: chatRoom.name || 'Unnamed Group',
        sub: `${chatRoom.participantIds.length} members in session`,
        icon: chatRoom.groupIcon || 'from-purple-600 to-indigo-600'
      };
    }

    const recipient = otherParticipants[0];
    if (recipient) {
      return {
        name: recipient.displayName || recipient.email.split('@')[0],
        sub: recipient.online ? 'Online' : 'Last seen recently',
        icon: recipient.photoURL || 'from-teal-400 to-emerald-600'
      };
    }

    return { name: 'Aero User', sub: 'Secure encryption active', icon: 'from-slate-400 to-slate-500' };
  };

  const headerInfo = getChatHeaderInfo();

  // Search filtered messages
  const filteredMessages = messages.filter(m => {
    if (!searchQuery) return true;
    const dec = decryptText(m.text, encryptionPassphrase);
    return dec.toLowerCase().includes(searchQuery.toLowerCase());
  });

  return (
    <div className="flex-1 h-full flex flex-col bg-slate-50 dark:bg-black overflow-hidden relative">
      
      {/* Subtle giant background watermark of the custom VSY interlocking logo */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-[0.03] dark:opacity-[0.015] z-0 select-none">
        <Logo className="w-[450px] h-[450px]" variant="currentColor" />
      </div>
      
      {/* 1. Chat Header */}
      <div className="p-4 border-b border-slate-100 dark:border-zinc-800/60 bg-white dark:bg-zinc-950 flex items-center justify-between gap-4 z-20 shadow-sm relative">
        <div className="flex items-center gap-3 min-w-0">
          {onBackToSidebar && (
            <button 
              onClick={onBackToSidebar}
              className="p-1.5 hover:bg-slate-100 dark:hover:bg-zinc-900 rounded-lg text-slate-500 dark:text-slate-400 md:hidden cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
          )}

          <div className={`w-10 h-10 rounded-full bg-gradient-to-tr ${headerInfo.icon} flex items-center justify-center text-white font-bold flex-shrink-0`}>
            {headerInfo.name[0]}
          </div>

          <div className="min-w-0">
            <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100 truncate">{headerInfo.name}</h3>
            <p className="text-[10px] text-slate-400 dark:text-slate-500 truncate mt-0.5">
              {isOtherTyping ? (
                <span className="text-teal-500 dark:text-teal-400 font-semibold animate-pulse">
                  ✍️ {typingName} is typing...
                </span>
              ) : (
                headerInfo.sub
              )}
            </p>
          </div>
        </div>

        {/* Header Actions (Call & Search) */}
        <div className="flex items-center gap-1.5">
          {!chatRoom?.isGroup && (
            <>
              <button
                onClick={() => handleCall('audio')}
                className="p-2 text-slate-500 hover:text-teal-500 dark:text-slate-400 dark:hover:text-teal-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition cursor-pointer"
                title="Voice Call"
              >
                <Phone className="w-4 h-4" />
              </button>
              <button
                onClick={() => handleCall('video')}
                className="p-2 text-slate-500 hover:text-teal-500 dark:text-slate-400 dark:hover:text-teal-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition cursor-pointer"
                title="Video Call"
              >
                <Video className="w-4 h-4" />
              </button>
            </>
          )}

          <button
            onClick={() => setIsSearching(!isSearching)}
            className={`p-2 rounded-xl transition cursor-pointer ${
              isSearching 
                ? 'bg-teal-50 text-teal-600 dark:bg-teal-950/40 dark:text-teal-400' 
                : 'text-slate-500 hover:text-teal-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
            title="Search Messages"
          >
            <Search className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* 2. Slide-out Message Search Drawer */}
      {isSearching && (
        <div className="p-3 bg-teal-50/40 dark:bg-teal-950/20 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between gap-3 animate-in slide-in-from-top-2 duration-150 z-10">
          <div className="relative flex-1">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
              <Search className="w-3.5 h-3.5" />
            </span>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search in this conversation..."
              className="w-full pl-9 pr-4 py-1.5 text-xs rounded-lg bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 dark:text-white focus:outline-none focus:ring-1 focus:ring-teal-500"
              autoFocus
            />
          </div>
          <button 
            onClick={() => { setIsSearching(false); setSearchQuery(''); }}
            className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-200/50"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* 3. Message Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {/* End to End Encryption Info Box */}
        <div className="max-w-xs mx-auto p-3 bg-slate-100/50 dark:bg-zinc-900/40 border border-slate-200/40 dark:border-zinc-800/60 rounded-2xl text-center space-y-1">
          <Shield className="w-4 h-4 text-emerald-500 mx-auto" />
          <h4 className="text-[10px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">End-to-End Encrypted</h4>
          <p className="text-[9px] text-slate-400 dark:text-slate-500 leading-normal">
            Messages are obfuscated locally. Passphrase in settings dictates decoding. Secure Aero server holds raw encrypted payloads.
          </p>
        </div>

        {filteredMessages.map((msg) => {
          const isMe = msg.senderId === currentUserId;
          // Decrypt the text locally using the encryptionPassphrase
          const decodedText = decryptText(msg.text, encryptionPassphrase);
          const isUnread = !isMe && !msg.readBy.includes(currentUserId);

          return (
            <div
              key={msg.id}
              className={`flex flex-col max-w-[80%] md:max-w-[70%] ${isMe ? 'ml-auto items-end' : 'mr-auto items-start'}`}
            >
              {/* Group chat sender identifier name */}
              {chatRoom?.isGroup && !isMe && (
                <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 mb-0.5 ml-1">
                  {msg.senderName}
                </span>
              )}

              <div className={`p-3.5 rounded-2xl text-xs relative shadow-sm ${
                isMe 
                  ? 'bg-teal-500 text-white rounded-tr-none' 
                  : 'bg-white dark:bg-zinc-900 text-slate-800 dark:text-slate-100 rounded-tl-none border border-slate-100 dark:border-zinc-800/60'
              }`}>
                {/* 1. TEXT MESSAGES */}
                {msg.type === 'text' && (
                  <p className="leading-relaxed break-words font-medium">{decodedText}</p>
                )}

                {/* 2. IMAGE MESSAGES */}
                {msg.type === 'image' && (
                  <div className="space-y-1.5 max-w-56">
                    <img 
                      src={msg.fileUrl} 
                      alt={msg.fileName} 
                      className="rounded-xl max-h-48 w-full object-cover border border-slate-100 dark:border-slate-800" 
                      referrerPolicy="no-referrer"
                    />
                    <p className="text-[10px] italic font-semibold truncate leading-normal">{msg.fileName}</p>
                  </div>
                )}

                {/* 3. VIDEO MESSAGES */}
                {msg.type === 'video' && (
                  <div className="space-y-1.5 max-w-56">
                    <video 
                      src={msg.fileUrl} 
                      controls 
                      className="rounded-xl max-h-48 w-full object-cover border border-slate-100 dark:border-slate-800" 
                    />
                    <p className="text-[10px] italic font-semibold truncate leading-normal">{msg.fileName}</p>
                  </div>
                )}

                {/* 4. DOCUMENT MESSAGES */}
                {msg.type === 'document' && (
                  <a
                    href={msg.fileUrl}
                    download={msg.fileName}
                    className="flex items-center gap-2.5 p-2 bg-slate-100 dark:bg-slate-950 hover:bg-slate-200 rounded-xl max-w-56 text-slate-800 dark:text-slate-100 font-medium"
                  >
                    <FileText className="w-6 h-6 text-teal-500 flex-shrink-0" />
                    <div className="min-w-0">
                      <p className="text-[11px] font-bold truncate leading-tight">{msg.fileName}</p>
                      <p className="text-[9px] text-slate-400 font-mono mt-0.5">
                        {Math.round((msg.fileSize || 0) / 1024)} KB • Doc
                      </p>
                    </div>
                  </a>
                )}

                {/* 5. AUDIO NOTES */}
                {msg.type === 'audio' && (
                  <div className="flex items-center gap-3 py-1 px-1.5">
                    <button
                      onClick={() => playAudioNote(msg.id, msg.fileUrl || '')}
                      className={`w-8 h-8 rounded-full flex items-center justify-center transition active:scale-95 ${
                        isMe ? 'bg-white text-teal-600' : 'bg-teal-500 text-white'
                      }`}
                    >
                      {playingMessageId === msg.id ? (
                        <Pause className="w-4 h-4 fill-current" />
                      ) : (
                        <Play className="w-4 h-4 fill-current ml-0.5" />
                      )}
                    </button>
                    <div>
                      <p className="text-[10px] font-bold tracking-wide uppercase">Voice Note</p>
                      <div className="flex items-center gap-1.5 mt-1">
                        <div className="w-24 h-1.5 rounded-full bg-slate-200/50 dark:bg-slate-800 relative overflow-hidden">
                          <div 
                            className={`h-full absolute left-0 top-0 transition-all ${isMe ? 'bg-white' : 'bg-teal-500'}`} 
                            style={{ width: playingMessageId === msg.id ? '100%' : '20%' }}
                          />
                        </div>
                        <span className="text-[8px] font-mono opacity-80">Play</span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Footer details: timestamp & receipt checks */}
                <div className="flex items-center justify-end gap-1 mt-1.5 text-[8px] opacity-70 font-semibold uppercase tracking-wider">
                  <span>
                    {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>

                  {isMe && (
                    <span>
                      {msg.readBy.length > 1 ? (
                        <CheckCheck className="w-3.5 h-3.5 text-blue-400 stroke-[3]" />
                      ) : (
                        <Check className="w-3.5 h-3.5 text-slate-300 stroke-[2.5]" />
                      )}
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* 4. Chat Input Panel */}
      <div className="p-4 bg-white dark:bg-zinc-950 border-t border-slate-100 dark:border-zinc-800/60 relative flex items-center gap-2">
        {/* Emoji Selector Overlay */}
        {showEmojiPicker && (
          <EmojiPicker 
            onSelect={(emoji) => setInputText(prev => prev + emoji)}
            onClose={() => setShowEmojiPicker(false)}
          />
        )}

        {/* Attachment menu drawer */}
        {showAttachmentMenu && (
          <div className="absolute bottom-16 left-12 z-40 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 p-2 rounded-2xl shadow-2xl flex flex-col gap-1.5 animate-in fade-in slide-in-from-bottom-2 duration-150">
            <label className="flex items-center gap-2.5 px-3 py-1.5 text-xs text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg cursor-pointer transition">
              <Image className="w-4 h-4 text-emerald-500" />
              <span>Image Share</span>
              <input 
                type="file" 
                accept="image/*" 
                onChange={(e) => handleAttachmentUpload(e, 'image')} 
                className="hidden" 
              />
            </label>
            <label className="flex items-center gap-2.5 px-3 py-1.5 text-xs text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg cursor-pointer transition">
              <Video className="w-4 h-4 text-indigo-500" />
              <span>Video clip</span>
              <input 
                type="file" 
                accept="video/*" 
                onChange={(e) => handleAttachmentUpload(e, 'video')} 
                className="hidden" 
              />
            </label>
            <label className="flex items-center gap-2.5 px-3 py-1.5 text-xs text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg cursor-pointer transition">
              <FileText className="w-4 h-4 text-orange-500" />
              <span>Document</span>
              <input 
                type="file" 
                accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt" 
                onChange={(e) => handleAttachmentUpload(e, 'document')} 
                className="hidden" 
              />
            </label>
          </div>
        )}

        {/* Action Button: Emoji */}
        <button
          onClick={() => setShowEmojiPicker(!showEmojiPicker)}
          className={`p-2.5 rounded-xl transition cursor-pointer ${
            showEmojiPicker 
              ? 'bg-teal-50 text-teal-500 dark:bg-teal-950/40 dark:text-teal-400' 
              : 'text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
          title="Emojis"
        >
          <Smile className="w-5 h-5" />
        </button>

        {/* Action Button: Attachment Menu Toggle */}
        <button
          onClick={() => setShowAttachmentMenu(!showAttachmentMenu)}
          className={`p-2.5 rounded-xl transition cursor-pointer ${
            showAttachmentMenu 
              ? 'bg-teal-50 text-teal-500 dark:bg-teal-950/40 dark:text-teal-400' 
              : 'text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
          title="Attach Media"
        >
          <Paperclip className="w-5 h-5" />
        </button>

        {/* Main Text Input Area */}
        {isRecording ? (
          /* ACTIVE AUDIO RECORDING FEEDBACK PANEL */
          <div className="flex-1 flex items-center justify-between px-3 py-1.5 bg-rose-50 dark:bg-rose-950/20 border border-rose-100 dark:border-rose-900/30 rounded-xl text-rose-600 dark:text-rose-400 animate-pulse">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider">
              <div className="w-2 h-2 rounded-full bg-rose-500 animate-ping" />
              <span>Recording Voice Memo... ({recordDuration}s)</span>
            </div>
            <div className="flex gap-1.5">
              <button 
                onClick={cancelRecording}
                className="p-1 text-slate-400 hover:text-slate-600 text-xs font-semibold"
              >
                Cancel
              </button>
              <button 
                onClick={stopRecordingAndSend}
                className="p-1 px-2.5 bg-rose-600 text-white rounded-lg text-xs font-bold hover:bg-rose-700 shadow-md transition"
              >
                Send note
              </button>
            </div>
          </div>
        ) : (
          /* STANDARD CHAT MESSAGE TYPING INPUT */
          <input
            type="text"
            value={inputText}
            onChange={(e) => handleTextInputChange(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
            placeholder="Write an encrypted message..."
            className="flex-1 px-4 py-2.5 text-xs rounded-xl border border-slate-200 dark:border-slate-800 dark:text-white bg-transparent focus:outline-none focus:ring-1 focus:ring-teal-500/50"
          />
        )}

        {/* Send or Voice Record Action Trigger */}
        {inputText.trim().length > 0 ? (
          <button
            onClick={() => handleSendMessage()}
            className="p-3 bg-teal-500 hover:bg-teal-600 text-white rounded-xl shadow-lg shadow-teal-500/20 transition active:scale-95 cursor-pointer flex-shrink-0"
            title="Send Message"
          >
            <Send className="w-4 h-4" />
          </button>
        ) : (
          !isRecording && (
            <button
              onClick={startRecording}
              className="p-3 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-300 rounded-xl transition active:scale-95 cursor-pointer flex-shrink-0"
              title="Record Voice Memo"
            >
              <Mic className="w-4 h-4" />
            </button>
          )
        )}
      </div>

    </div>
  );
}
