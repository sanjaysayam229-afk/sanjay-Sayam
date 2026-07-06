import { useState, useEffect } from 'react';
import { auth, db, testConnection, ensureAeroAIBot } from './lib/firebase';
import { onAuthStateChanged, signOut, signInAnonymously } from 'firebase/auth';
import { doc, getDoc, updateDoc, collection, query, where, onSnapshot, getDocs, addDoc, setDoc } from 'firebase/firestore';
import { UserProfile, CallSession } from './types';
import Auth from './components/Auth';
import Sidebar from './components/Sidebar';
import ChatArea from './components/ChatArea';
import ProfileModal from './components/ProfileModal';
import CallModal from './components/CallModal';
import Logo from './components/Logo';
import { Sparkles, Shield, AlertTriangle, CloudRain, Lock } from 'lucide-react';
import { encryptText } from './lib/crypto';

export default function App() {
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [authChecking, setAuthChecking] = useState(true);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [darkMode, setDarkMode] = useState(() => localStorage.getItem('darkMode') === 'true');

  // Real-time call tracking
  const [activeCall, setActiveCall] = useState<CallSession | null>(null);

  // Mobile layout state
  const [mobileView, setMobileView] = useState<'sidebar' | 'chat'>('sidebar');

  // 1. Mandated Boot Verification
  useEffect(() => {
    testConnection();
  }, []);

  // 2. Dark/Light Theme Manager
  useEffect(() => {
    const root = window.document.documentElement;
    if (darkMode) {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    localStorage.setItem('darkMode', darkMode.toString());
  }, [darkMode]);

  // 3. Firebase Auth State Listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        // Provision/ensure Aero AI Bot is available once authenticated
        await ensureAeroAIBot();

        // Fetch user document from firestore
        const docRef = doc(db, 'users', user.uid);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
          const profile = docSnap.data() as UserProfile;
          setCurrentUser(profile);

          // Update status to Online
          await updateDoc(docRef, {
            online: true,
            lastSeen: new Date().toISOString()
          });
        } else {
          // Fallback if document doesn't exist
          const profile: UserProfile = {
            id: user.uid,
            email: user.email || 'guest@aerochat.com',
            displayName: user.displayName || `Guest-${user.uid.slice(0, 5)}`,
            photoURL: 'from-teal-400 to-emerald-600',
            status: 'Hey there! I am using Whisper Chat.',
            online: true,
            lastSeen: new Date().toISOString()
          };
          setCurrentUser(profile);

          // Save the anonymous profile to Firestore
          try {
            await setDoc(docRef, profile);
          } catch (writeErr) {
            console.error("Error saving fallback profile to Firestore:", writeErr);
          }
        }
      } else {
        // If user is not logged in and didn't manually log out, log them in anonymously automatically!
        const manualLogout = localStorage.getItem('manualLogout') === 'true';
        if (!manualLogout) {
          try {
            await signInAnonymously(auth);
            return; // onAuthStateChanged will trigger again with the anonymous user
          } catch (err) {
            console.error("Auto anonymous login failed, showing Auth screen:", err);
            setCurrentUser(null);
          }
        } else {
          setCurrentUser(null);
        }
      }
      setAuthChecking(false);
    });

    return unsubscribe;
  }, []);

  // 4. Update online status based on window focus / tab activity
  useEffect(() => {
    if (!currentUser) return;

    const handleVisibilityChange = async () => {
      const userRef = doc(db, 'users', currentUser.id);
      if (document.visibilityState === 'visible') {
        await updateDoc(userRef, { online: true });
      } else {
        await updateDoc(userRef, { 
          online: false,
          lastSeen: new Date().toISOString()
        });
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [currentUser]);

  // 5. Listen to Active Calls for Current User
  useEffect(() => {
    if (!currentUser) return;

    const callsQuery = query(
      collection(db, 'calls'),
      where('status', 'in', ['ringing', 'connected'])
    );

    const unsubscribe = onSnapshot(callsQuery, (snapshot) => {
      let activeSession: CallSession | null = null;
      snapshot.forEach((doc) => {
        const call = { id: doc.id, ...doc.data() } as CallSession;
        // User must be caller or receiver
        if (call.callerId === currentUser.id || call.receiverId === currentUser.id) {
          activeSession = call;
        }
      });
      setActiveCall(activeSession);
    });

    return unsubscribe;
  }, [currentUser]);

  const handleAuthSuccess = async (uid: string) => {
    // Clear manualLogout state since authentication succeeded
    localStorage.removeItem('manualLogout');
    
    // Set user and trigger session
    const docRef = doc(db, 'users', uid);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      setCurrentUser(docSnap.data() as UserProfile);
    }
  };

  const handleLogout = async () => {
    if (currentUser) {
      try {
        const userRef = doc(db, 'users', currentUser.id);
        await updateDoc(userRef, { 
          online: false,
          lastSeen: new Date().toISOString(),
          typingIn: null
        });
      } catch (e) {
        console.error('Logout status update error:', e);
      }
    }
    // Record that logout was manual so we don't automatically sign back in
    localStorage.setItem('manualLogout', 'true');
    await signOut(auth);
    setCurrentUser(null);
    setActiveChatId(null);
  };

  const handleStartAIChat = async () => {
    if (!currentUser) return;
    try {
      // Find if an existing 1-on-1 chat with 'aero-ai-bot' exists in the chats collection
      const chatsQuery = query(
        collection(db, 'chats'),
        where('participantIds', 'array-contains', currentUser.id)
      );
      const snapshot = await getDocs(chatsQuery);
      let existingChatId: string | null = null;
      
      snapshot.forEach((doc) => {
        const data = doc.data();
        if (!data.isGroup && data.participantIds.includes('aero-ai-bot')) {
          existingChatId = doc.id;
        }
      });

      if (existingChatId) {
        setActiveChatId(existingChatId);
      } else {
        // Create new one-to-one chat room with Aero AI
        const newChat = {
          isGroup: false,
          participantIds: [currentUser.id, 'aero-ai-bot'],
          createdAt: new Date().toISOString(),
          lastMessageText: 'Aero AI Session initiated. Say hello!',
          lastMessageTime: new Date().toISOString(),
          lastMessageSenderId: 'aero-ai-bot'
        };
        const docRef = await addDoc(collection(db, 'chats'), newChat);
        
        // Add a welcome message from Aero AI
        const welcomeText = "Hello! I am Aero AI, your Gemini-powered secure workspace assistant. How can I assist you with your chats, tasks, or calculations today? 🚀";
        const encryptionPassphrase = localStorage.getItem(`enc_key_${currentUser.id}`) || 'aero-secure-key-2026';
        const encryptedBody = encryptText(welcomeText, encryptionPassphrase);
        
        await addDoc(collection(db, `chats/${docRef.id}/messages`), {
          senderId: 'aero-ai-bot',
          senderName: 'Aero AI',
          text: encryptedBody,
          type: 'text',
          timestamp: new Date().toISOString(),
          delivered: true,
          readBy: [currentUser.id],
          isEncrypted: true
        });

        setActiveChatId(docRef.id);
      }
    } catch (e) {
      console.error('Error starting AI chat:', e);
    }
  };

  if (authChecking) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-black flex flex-col items-center justify-center p-4">
        <div className="w-10 h-10 border-4 border-teal-500 border-t-transparent rounded-full animate-spin" />
        <span className="text-xs font-semibold text-slate-400 mt-4 tracking-wider uppercase">Loading Aero Session...</span>
      </div>
    );
  }

  if (!currentUser) {
    return <Auth onAuthSuccess={handleAuthSuccess} />;
  }

  return (
    <div className="h-screen w-screen overflow-hidden flex bg-slate-100 dark:bg-black transition-colors">
      
      {/* Settings Dialog Overlay */}
      {isSettingsOpen && (
        <ProfileModal
          user={currentUser}
          onClose={() => setIsSettingsOpen(false)}
          onUpdateUser={(updated) => setCurrentUser(updated)}
          darkMode={darkMode}
          setDarkMode={setDarkMode}
        />
      )}

      {/* Calling Modal Overlay */}
      {activeCall && (
        <CallModal
          currentCall={activeCall}
          currentUserId={currentUser.id}
          onClose={() => setActiveCall(null)}
        />
      )}

      {/* Main Full-Scale Frame */}
      <div className="flex-1 max-w-7xl mx-auto h-full flex overflow-hidden shadow-2xl relative bg-white dark:bg-black md:my-0 md:rounded-none">
        
        {/* SIDEBAR COL */}
        <div className={`h-full ${mobileView === 'sidebar' ? 'block w-full' : 'hidden'} md:block md:w-[350px] flex-shrink-0`}>
          <Sidebar
            currentUserId={currentUser.id}
            activeChatId={activeChatId}
            onSelectChat={(chatId) => {
              setActiveChatId(chatId);
              setMobileView('chat');
            }}
            onOpenSettings={() => setIsSettingsOpen(true)}
            onLogout={handleLogout}
          />
        </div>

        {/* CHAT CHIEF COL */}
        <div className={`h-full flex-1 ${mobileView === 'chat' ? 'block' : 'hidden'} md:block`}>
          {activeChatId ? (
            <ChatArea
              chatId={activeChatId}
              currentUserId={currentUser.id}
              currentUserName={currentUser.displayName || currentUser.email.split('@')[0]}
              onLaunchCall={(call) => setActiveCall(call)}
              onBackToSidebar={() => setMobileView('sidebar')}
            />
          ) : (
            /* Empty Chat Area Placeholder */
            <div className="h-full flex flex-col items-center justify-center p-8 text-center bg-slate-50 dark:bg-black relative overflow-hidden">
              {/* Subtle giant background watermark of the custom VSY interlocking logo */}
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-[0.03] dark:opacity-[0.015] z-0 select-none">
                <Logo className="w-[500px] h-[500px]" variant="currentColor" />
              </div>
              
              <div className="relative z-10 flex flex-col items-center">
                <div className="w-24 h-24 rounded-3xl bg-white dark:bg-zinc-900 flex items-center justify-center mb-6 border border-slate-100 dark:border-zinc-800 p-4 shadow-sm animate-pulse">
                  <Logo className="w-16 h-16" variant="brand" />
                </div>
                
                <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100 tracking-tight">
                  Secure Chat Workspace
                </h2>
                
                <p className="text-xs text-slate-400 dark:text-slate-500 max-w-xs mt-2 leading-relaxed">
                  Choose a conversation from the list or start a new 1-on-1 dialog with a contact to begin transmitting end-to-end encrypted messages.
                </p>

                <div className="flex items-center gap-1.5 text-[10px] text-emerald-500 font-semibold py-1 px-3 bg-emerald-50 dark:bg-emerald-950/20 rounded-full border border-emerald-100 dark:border-emerald-900/30 mt-6 shadow-sm">
                  <Shield className="w-3 h-3" />
                  Zero-Knowledge Transport Layer Enabled
                </div>

                <button
                  onClick={handleStartAIChat}
                  className="mt-6 flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white rounded-2xl text-xs font-bold shadow-lg shadow-indigo-500/20 active:scale-95 transition cursor-pointer"
                >
                  <Sparkles className="w-4 h-4" />
                  Initiate Secure Session with Whisper AI
                </button>
              </div>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
