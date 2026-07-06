import { useState, useEffect } from 'react';
import { db } from '../lib/firebase';
import { collection, query, where, onSnapshot, getDocs, addDoc, getDoc, doc, updateDoc } from 'firebase/firestore';
import { UserProfile, ChatRoom } from '../types';
import { MessageSquare, Users, UserPlus, Search, Settings, Check, CheckCheck, Circle, LogOut, Shield } from 'lucide-react';

interface SidebarProps {
  currentUserId: string;
  activeChatId: string | null;
  onSelectChat: (chatId: string) => void;
  onOpenSettings: () => void;
  onLogout: () => void;
}

export default function Sidebar({ currentUserId, activeChatId, onSelectChat, onOpenSettings, onLogout }: SidebarProps) {
  const [currentUserProfile, setCurrentUserProfile] = useState<UserProfile | null>(null);
  const [chats, setChats] = useState<ChatRoom[]>([]);
  const [contacts, setContacts] = useState<UserProfile[]>([]);
  const [activeTab, setActiveTab] = useState<'chats' | 'contacts' | 'new-group'>('chats');
  const [searchQuery, setSearchQuery] = useState('');
  
  // Group creation state
  const [groupName, setGroupName] = useState('');
  const [selectedContactIds, setSelectedContactIds] = useState<string[]>([]);
  
  // Real-time listener for current user's profile
  useEffect(() => {
    const userDocRef = doc(db, 'users', currentUserId);
    const unsubscribe = onSnapshot(userDocRef, (snap) => {
      if (snap.exists()) {
        setCurrentUserProfile(snap.data() as UserProfile);
      }
    });
    return unsubscribe;
  }, [currentUserId]);

  // Real-time listener for user's chats
  useEffect(() => {
    const chatsQuery = query(
      collection(db, 'chats'),
      where('participantIds', 'array-contains', currentUserId)
    );

    const unsubscribe = onSnapshot(chatsQuery, async (snapshot) => {
      const rooms: ChatRoom[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        rooms.push({
          id: doc.id,
          ...data
        } as ChatRoom);
      });
      
      // Sort by last message time descending
      rooms.sort((a, b) => {
        const timeA = a.lastMessageTime ? new Date(a.lastMessageTime).getTime() : 0;
        const timeB = b.lastMessageTime ? new Date(b.lastMessageTime).getTime() : 0;
        return timeB - timeA;
      });

      setChats(rooms);
    });

    return unsubscribe;
  }, [currentUserId]);

  // Load all users from Firestore as Contacts
  useEffect(() => {
    const contactsQuery = query(collection(db, 'users'));
    const unsubscribe = onSnapshot(contactsQuery, (snapshot) => {
      const usersList: UserProfile[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data() as UserProfile;
        if (data.id !== currentUserId) {
          usersList.push(data);
        }
      });
      setContacts(usersList);
    });
    return unsubscribe;
  }, [currentUserId]);

  const handleStartOneToOneChat = async (contact: UserProfile) => {
    // Check if chat already exists
    const existing = chats.find(
      c => !c.isGroup && c.participantIds.includes(contact.id) && c.participantIds.includes(currentUserId)
    );

    if (existing) {
      onSelectChat(existing.id);
      setActiveTab('chats');
      return;
    }

    // Otherwise, create a new 1-on-1 chat
    try {
      const newChat = {
        isGroup: false,
        participantIds: [currentUserId, contact.id],
        createdAt: new Date().toISOString(),
        lastMessageText: 'Chat started',
        lastMessageTime: new Date().toISOString(),
        lastMessageSenderId: currentUserId
      };

      const docRef = await addDoc(collection(db, 'chats'), newChat);
      onSelectChat(docRef.id);
      setActiveTab('chats');
    } catch (e) {
      console.error('Error starting chat:', e);
    }
  };

  const handleCreateGroup = async () => {
    if (!groupName.trim() || selectedContactIds.length === 0) return;

    try {
      const participantIds = [currentUserId, ...selectedContactIds];
      const newChat = {
        isGroup: true,
        name: groupName.trim(),
        participantIds,
        createdAt: new Date().toISOString(),
        createdBy: currentUserId,
        groupIcon: 'from-purple-600 to-indigo-600',
        lastMessageText: 'Group created',
        lastMessageTime: new Date().toISOString(),
        lastMessageSenderId: currentUserId
      };

      const docRef = await addDoc(collection(db, 'chats'), newChat);
      onSelectChat(docRef.id);
      setGroupName('');
      setSelectedContactIds([]);
      setActiveTab('chats');
    } catch (e) {
      console.error('Error creating group:', e);
    }
  };

  const toggleSelectContact = (id: string) => {
    if (selectedContactIds.includes(id)) {
      setSelectedContactIds(prev => prev.filter(item => item !== id));
    } else {
      setSelectedContactIds(prev => [...prev, id]);
    }
  };

  const getChatDisplayNameAndIcon = (chat: ChatRoom) => {
    if (chat.isGroup) {
      return {
        name: chat.name || 'Unnamed Group',
        icon: chat.groupIcon || 'from-purple-600 to-indigo-600',
        isOnline: false
      };
    }

    // For 1-on-1 chats, find the other participant's profile
    const otherId = chat.participantIds.find(id => id !== currentUserId);
    const otherProfile = contacts.find(c => c.id === otherId);

    if (otherProfile) {
      return {
        name: otherProfile.displayName || otherProfile.email.split('@')[0],
        icon: otherProfile.photoURL || 'from-teal-400 to-emerald-600',
        isOnline: otherProfile.online
      };
    }

    return {
      name: 'Aero User',
      icon: 'from-slate-400 to-slate-600',
      isOnline: false
    };
  };

  // Filter existing chats or contacts based on query
  const filteredChats = chats.filter(chat => {
    const details = getChatDisplayNameAndIcon(chat);
    return details.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
           (chat.lastMessageText && chat.lastMessageText.toLowerCase().includes(searchQuery.toLowerCase()));
  });

  const filteredContacts = contacts.filter(c => 
    (c.displayName || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.email.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="w-full md:w-[350px] flex-shrink-0 h-full border-r border-slate-100 dark:border-zinc-800/60 flex flex-col bg-white dark:bg-black transition-colors">
      
      {/* Current User Header */}
      <div className="p-4 border-b border-slate-100 dark:border-zinc-800/60 flex items-center justify-between gap-3 bg-slate-50/50 dark:bg-zinc-950/40">
        <button 
          onClick={onOpenSettings}
          className="flex items-center gap-3 group text-left cursor-pointer"
        >
          <div className={`w-10 h-10 rounded-full bg-gradient-to-tr ${currentUserProfile?.photoURL || 'from-teal-400 to-emerald-600'} flex items-center justify-center text-white font-bold relative group-hover:scale-105 transition`}>
            {currentUserProfile?.displayName?.[0] || currentUserProfile?.email?.[0] || 'U'}
            <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-emerald-500 border-2 border-white dark:border-zinc-900 rounded-full" />
          </div>
          <div className="max-w-[140px]">
            <h4 className="text-sm font-bold text-slate-800 dark:text-slate-100 truncate">
              {currentUserProfile?.displayName || 'User profile'}
            </h4>
            <p className="text-[10px] text-slate-400 truncate mt-0.5">
              {currentUserProfile?.status || 'Whisper Chatting'}
            </p>
          </div>
        </button>
 
        {/* Header Action Buttons */}
        <div className="flex items-center gap-1">
          <button
            onClick={onOpenSettings}
            className="p-2 text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-zinc-900 rounded-xl transition cursor-pointer"
            title="Settings"
          >
            <Settings className="w-4 h-4" />
          </button>
          <button
            onClick={onLogout}
            className="p-2 text-slate-400 hover:text-rose-600 dark:text-slate-500 dark:hover:text-rose-400 hover:bg-slate-100 dark:hover:bg-zinc-900 rounded-xl transition cursor-pointer"
            title="Log Out"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
 
      {/* Navigation Tabs */}
      <div className="flex px-4 py-2 gap-2 border-b border-slate-50 dark:border-zinc-800 bg-slate-50/30 dark:bg-zinc-950/20">
        <button
          onClick={() => { setActiveTab('chats'); setSearchQuery(''); }}
          className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 text-xs font-bold rounded-xl transition ${
            activeTab === 'chats'
              ? 'bg-teal-50 dark:bg-teal-950/20 text-teal-600 dark:text-teal-400'
              : 'text-slate-500 hover:bg-slate-50 dark:hover:bg-zinc-900/50'
          }`}
        >
          <MessageSquare className="w-3.5 h-3.5" />
          Chats
        </button>
        <button
          onClick={() => { setActiveTab('contacts'); setSearchQuery(''); }}
          className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 text-xs font-bold rounded-xl transition ${
            activeTab === 'contacts'
              ? 'bg-teal-50 dark:bg-teal-950/20 text-teal-600 dark:text-teal-400'
              : 'text-slate-500 hover:bg-slate-50 dark:hover:bg-zinc-900/50'
          }`}
        >
          <Users className="w-3.5 h-3.5" />
          Contacts
        </button>
        <button
          onClick={() => { setActiveTab('new-group'); setSearchQuery(''); }}
          className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 text-xs font-bold rounded-xl transition ${
            activeTab === 'new-group'
              ? 'bg-teal-50 dark:bg-teal-950/40 text-teal-600 dark:text-teal-400'
              : 'text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800/50'
          }`}
        >
          <UserPlus className="w-3.5 h-3.5" />
          New Group
        </button>
      </div>

      {/* Search Bar */}
      {activeTab !== 'new-group' && (
        <div className="p-3">
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
              <Search className="w-3.5 h-3.5" />
            </span>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={activeTab === 'chats' ? 'Search chat sessions...' : 'Search contacts list...'}
              className="w-full pl-9 pr-4 py-2 text-xs rounded-xl bg-slate-100 dark:bg-slate-950 dark:text-white border-none focus:outline-none focus:ring-1 focus:ring-teal-500/50"
            />
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto">
        
        {/* Chats Tab */}
        {activeTab === 'chats' && (
          <div className="divide-y divide-slate-50 dark:divide-slate-800/50">
            {filteredChats.length > 0 ? (
              filteredChats.map((chat) => {
                const details = getChatDisplayNameAndIcon(chat);
                const isActive = chat.id === activeChatId;

                return (
                  <button
                    key={chat.id}
                    onClick={() => onSelectChat(chat.id)}
                    className={`w-full flex items-center gap-3.5 p-4 text-left transition hover:bg-slate-50 dark:hover:bg-slate-800/40 ${
                      isActive ? 'bg-slate-100/80 dark:bg-slate-800/60 border-l-4 border-teal-500' : ''
                    }`}
                  >
                    <div className={`w-11 h-11 rounded-full bg-gradient-to-tr ${details.icon} flex items-center justify-center text-white font-bold relative flex-shrink-0`}>
                      {details.name[0]}
                      {details.isOnline && (
                        <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-emerald-500 border-2 border-white dark:border-slate-900 rounded-full" />
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <h4 className="text-sm font-bold text-slate-800 dark:text-slate-100 truncate">
                          {details.name}
                        </h4>
                        {chat.lastMessageTime && (
                          <span className="text-[10px] text-slate-400 font-medium whitespace-nowrap">
                            {new Date(chat.lastMessageTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        )}
                      </div>
                      
                      <div className="flex items-center justify-between gap-2 mt-1">
                        <p className="text-xs text-slate-500 dark:text-slate-400 truncate flex-1 leading-snug">
                          {chat.lastMessageSenderId === currentUserId && (
                            <span className="text-teal-500 dark:text-teal-400 font-semibold mr-1">You:</span>
                          )}
                          {chat.lastMessageText}
                        </p>
                        
                        {/* Security check symbol indicating E2E */}
                        <Shield className="w-3 h-3 text-slate-300 dark:text-slate-600 flex-shrink-0" />
                      </div>
                    </div>
                  </button>
                );
              })
            ) : (
              <div className="p-8 text-center text-slate-400 dark:text-slate-500 text-xs">
                No conversations found. Create one under the Contacts tab!
              </div>
            )}
          </div>
        )}

        {/* Contacts Tab */}
        {activeTab === 'contacts' && (
          <div className="divide-y divide-slate-50 dark:divide-slate-800/50">
            {filteredContacts.length > 0 ? (
              filteredContacts.map((contact) => (
                <button
                  key={contact.id}
                  onClick={() => handleStartOneToOneChat(contact)}
                  className="w-full flex items-center gap-3.5 p-4 text-left transition hover:bg-slate-50 dark:hover:bg-slate-800/40"
                >
                  <div className={`w-11 h-11 rounded-full bg-gradient-to-tr ${contact.photoURL || 'from-teal-400 to-emerald-600'} flex items-center justify-center text-white font-bold relative flex-shrink-0`}>
                    {contact.displayName?.[0] || contact.email[0]}
                    {contact.online && (
                      <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-emerald-500 border-2 border-white dark:border-slate-900 rounded-full" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="text-sm font-bold text-slate-800 dark:text-slate-100 truncate">
                      {contact.displayName || contact.email.split('@')[0]}
                    </h4>
                    <p className="text-xs text-slate-400 truncate mt-0.5">
                      {contact.status || 'Aero user'}
                    </p>
                  </div>
                </button>
              ))
            ) : (
              <div className="p-8 text-center text-slate-400 dark:text-slate-500 text-xs">
                No contacts registered in sandbox.
              </div>
            )}
          </div>
        )}

        {/* New Group Tab */}
        {activeTab === 'new-group' && (
          <div className="p-4 space-y-4">
            <div>
              <label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider block mb-1">
                Group Name
              </label>
              <input
                type="text"
                value={groupName}
                onChange={(e) => setGroupName(e.target.value)}
                placeholder="Marketing Team, Book Club..."
                className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-800 dark:text-white bg-transparent focus:outline-none focus:ring-1 focus:ring-teal-500"
              />
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider block">
                Select Group Participants ({selectedContactIds.length})
              </label>
              
              <div className="divide-y divide-slate-50 dark:divide-slate-800/50 max-h-56 overflow-y-auto border border-slate-100 dark:border-slate-800 rounded-2xl">
                {contacts.map((contact) => {
                  const isSelected = selectedContactIds.includes(contact.id);
                  return (
                    <button
                      key={contact.id}
                      type="button"
                      onClick={() => toggleSelectContact(contact.id)}
                      className={`w-full flex items-center justify-between p-3 text-left transition hover:bg-slate-50 dark:hover:bg-slate-800/40 ${
                        isSelected ? 'bg-teal-50/40 dark:bg-teal-950/20' : ''
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-full bg-gradient-to-tr ${contact.photoURL || 'from-teal-400 to-emerald-600'} flex items-center justify-center text-white text-xs font-bold`}>
                          {contact.displayName?.[0]}
                        </div>
                        <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                          {contact.displayName}
                        </span>
                      </div>
                      
                      <div className={`w-4 h-4 rounded border flex items-center justify-center transition ${
                        isSelected ? 'bg-teal-500 border-teal-500 text-white' : 'border-slate-300 dark:border-slate-600'
                      }`}>
                        {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            <button
              onClick={handleCreateGroup}
              disabled={!groupName.trim() || selectedContactIds.length === 0}
              className="w-full py-2.5 bg-teal-500 hover:bg-teal-600 text-white rounded-xl text-xs font-semibold shadow-lg shadow-teal-500/15 transition disabled:opacity-40 cursor-pointer"
            >
              Assemble Chat Group
            </button>
          </div>
        )}

      </div>
    </div>
  );
}
