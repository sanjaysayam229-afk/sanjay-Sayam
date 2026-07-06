export interface UserProfile {
  id: string;
  email: string;
  displayName: string;
  photoURL: string;
  status: string;
  online: boolean;
  lastSeen: string;
  typingIn?: string | null;
}

export interface ChatRoom {
  id: string;
  isGroup: boolean;
  name?: string;
  participantIds: string[];
  createdAt: string;
  createdBy?: string;
  groupIcon?: string;
  lastMessageText?: string;
  lastMessageSenderId?: string;
  lastMessageTime?: string;
  unreadCount?: { [userId: string]: number };
}

export interface Message {
  id: string;
  senderId: string;
  senderName: string;
  text: string;
  type: 'text' | 'image' | 'video' | 'document' | 'audio';
  fileUrl?: string;
  fileName?: string;
  fileSize?: number;
  timestamp: string;
  delivered: boolean;
  readBy: string[]; // List of user IDs who have read the message
  voiceDuration?: number; // In seconds
  isEncrypted?: boolean;
}

export interface CallSession {
  id: string;
  callerId: string;
  callerName: string;
  callerPhoto?: string;
  receiverId: string;
  receiverName: string;
  receiverPhoto?: string;
  type: 'audio' | 'video';
  status: 'ringing' | 'connected' | 'ended' | 'declined';
  timestamp: string;
}

export interface BackupHistory {
  id: string;
  timestamp: string;
  messageCount: number;
  sizeKb: number;
}
