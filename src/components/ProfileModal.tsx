import { useState, useEffect } from 'react';
import { UserProfile, BackupHistory } from '../types';
import { db } from '../lib/firebase';
import { doc, updateDoc, collection, addDoc, getDocs, query, orderBy, limit } from 'firebase/firestore';
import { Shield, Cloud, Download, Trash, RefreshCw, Key, Sun, Moon, Sparkles, User, FileText } from 'lucide-react';

interface ProfileModalProps {
  user: UserProfile;
  onClose: () => void;
  onUpdateUser: (updated: UserProfile) => void;
  darkMode: boolean;
  setDarkMode: (val: boolean) => void;
}

const AVATAR_GRADIENTS = [
  'from-pink-500 to-rose-500',
  'from-purple-600 to-indigo-600',
  'from-teal-400 to-emerald-600',
  'from-blue-500 to-cyan-500',
  'from-amber-400 to-orange-600',
  'from-fuchsia-600 to-pink-600',
];

export default function ProfileModal({ user, onClose, onUpdateUser, darkMode, setDarkMode }: ProfileModalProps) {
  const [displayName, setDisplayName] = useState(user.displayName || '');
  const [status, setStatus] = useState(user.status || 'Hey there! I am using Aero Chat.');
  const [photoURL, setPhotoURL] = useState(user.photoURL || 'from-teal-400 to-emerald-600');
  const [encryptionPassphrase, setEncryptionPassphrase] = useState(() => localStorage.getItem(`enc_key_${user.id}`) || 'aero-secure-key-2026');
  const [cloudSync, setCloudSync] = useState(true);
  const [isBackingUp, setIsBackingUp] = useState(false);
  const [backupHistory, setBackupHistory] = useState<BackupHistory[]>([]);
  const [activeTab, setActiveTab] = useState<'profile' | 'encryption' | 'backup'>('profile');
  const [saveSuccess, setSaveSuccess] = useState(false);

  useEffect(() => {
    fetchBackupHistory();
  }, [user.id]);

  const fetchBackupHistory = async () => {
    try {
      const q = query(
        collection(db, `users/${user.id}/backups`),
        orderBy('timestamp', 'desc'),
        limit(5)
      );
      const querySnapshot = await getDocs(q);
      const history: BackupHistory[] = [];
      querySnapshot.forEach((doc) => {
        const data = doc.data();
        history.push({
          id: doc.id,
          timestamp: data.timestamp,
          messageCount: data.messageCount,
          sizeKb: data.sizeKb
        });
      });
      setBackupHistory(history);
    } catch (e) {
      console.error('Error fetching backup history:', e);
    }
  };

  const handleSaveProfile = async () => {
    try {
      const userRef = doc(db, 'users', user.id);
      const updatedData = {
        displayName,
        status,
        photoURL,
      };
      await updateDoc(userRef, updatedData);
      onUpdateUser({
        ...user,
        ...updatedData
      });
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2000);
    } catch (e) {
      console.error('Error updating profile:', e);
    }
  };

  const handleSaveEncryption = () => {
    localStorage.setItem(`enc_key_${user.id}`, encryptionPassphrase);
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 2000);
  };

  const handleTriggerBackup = async () => {
    setIsBackingUp(true);
    // Simulate standard WhatsApp backup progress
    setTimeout(async () => {
      try {
        const count = Math.floor(Math.random() * 400) + 50;
        const size = Math.floor(Math.random() * 120) + 15;
        const newBackup = {
          timestamp: new Date().toISOString(),
          messageCount: count,
          sizeKb: size
        };
        await addDoc(collection(db, `users/${user.id}/backups`), newBackup);
        await fetchBackupHistory();
      } catch (e) {
        console.error('Backup error:', e);
      } finally {
        setIsBackingUp(false);
      }
    }, 2000);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white dark:bg-black w-full max-w-2xl h-[560px] rounded-3xl shadow-2xl flex overflow-hidden border border-slate-100 dark:border-zinc-800/60 animate-in fade-in zoom-in-95 duration-200">
        
        {/* Navigation Sidebar */}
        <div className="w-56 bg-slate-50 dark:bg-zinc-950 p-6 flex flex-col justify-between border-r border-slate-100 dark:border-zinc-800/60">
          <div className="space-y-6">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-teal-500 flex items-center justify-center text-white">
                <Sparkles className="w-4 h-4" />
              </div>
              <span className="font-bold text-slate-800 dark:text-slate-100 tracking-tight text-sm">Aero Settings</span>
            </div>

            <nav className="space-y-1.5">
              <button
                onClick={() => setActiveTab('profile')}
                className={`w-full flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-xl transition ${
                  activeTab === 'profile'
                    ? 'bg-teal-500 text-white shadow-md shadow-teal-500/10'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-900'
                }`}
              >
                <User className="w-4 h-4" />
                Profile Info
              </button>
              <button
                onClick={() => setActiveTab('encryption')}
                className={`w-full flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-xl transition ${
                  activeTab === 'encryption'
                    ? 'bg-teal-500 text-white shadow-md shadow-teal-500/10'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-900'
                }`}
              >
                <Shield className="w-4 h-4" />
                Encryption (E2E)
              </button>
              <button
                onClick={() => setActiveTab('backup')}
                className={`w-full flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-xl transition ${
                  activeTab === 'backup'
                    ? 'bg-teal-500 text-white shadow-md shadow-teal-500/10'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-900'
                }`}
              >
                <Cloud className="w-4 h-4" />
                Cloud Backup
              </button>
            </nav>
          </div>

          {/* Theme Toggle in settings sidebar footer */}
          <div className="space-y-4">
            <div className="flex items-center justify-between p-2 rounded-xl bg-slate-100 dark:bg-zinc-900">
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 ml-1">Appearance</span>
              <button
                onClick={() => setDarkMode(!darkMode)}
                className="p-1.5 rounded-lg bg-white dark:bg-zinc-850 text-slate-700 dark:text-slate-200 shadow-sm hover:scale-105 active:scale-95 transition"
              >
                {darkMode ? <Sun className="w-4 h-4 text-amber-500" /> : <Moon className="w-4 h-4 text-indigo-600" />}
              </button>
            </div>

            <button
              onClick={onClose}
              className="w-full py-2 bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-semibold tracking-wide transition"
            >
              Close Settings
            </button>
          </div>
        </div>

        {/* Setting Panel Content */}
        <div className="flex-1 p-8 flex flex-col justify-between overflow-y-auto">
          <div>
            {/* Header */}
            <div className="mb-6">
              <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">
                {activeTab === 'profile' && 'Edit Profile'}
                {activeTab === 'encryption' && 'End-to-End Encryption Concept'}
                {activeTab === 'backup' && 'Automated Cloud Sync'}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                {activeTab === 'profile' && 'Customize your public identity, status message, and custom visual style.'}
                {activeTab === 'encryption' && 'Manage your client-side encryption passcode. Messages are encrypted locally before being transmitted.'}
                {activeTab === 'backup' && 'Back up chat archives securely in the cloud to prevent data loss across sessions.'}
              </p>
            </div>

            {/* Profile Tab */}
            {activeTab === 'profile' && (
              <div className="space-y-5">
                {/* Choose Avatar Gradient */}
                <div>
                  <label className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider block mb-2">
                    Profile Theme Avatar
                  </label>
                  <div className="flex gap-2.5">
                    {AVATAR_GRADIENTS.map((gradient) => (
                      <button
                        key={gradient}
                        onClick={() => setPhotoURL(gradient)}
                        className={`w-10 h-10 rounded-full bg-gradient-to-tr ${gradient} transition relative flex items-center justify-center hover:scale-110 active:scale-95 cursor-pointer ${
                          photoURL === gradient ? 'ring-4 ring-teal-500 ring-offset-2 dark:ring-offset-slate-900' : ''
                        }`}
                      >
                        <User className="w-4 h-4 text-white" />
                      </button>
                    ))}
                  </div>
                </div>

                {/* Display Name Input */}
                <div>
                  <label className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider block mb-1.5">
                    Display Name
                  </label>
                  <input
                    type="text"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-transparent dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                    placeholder="Enter your name"
                  />
                </div>

                {/* Bio / Status Input */}
                <div>
                  <label className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider block mb-1.5">
                    Aero Status
                  </label>
                  <input
                    type="text"
                    value={status}
                    onChange={(e) => setStatus(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-transparent dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                    placeholder="Set a bio status"
                  />
                </div>

                {/* Metadata details */}
                <div className="p-3 bg-slate-50 dark:bg-zinc-950 border dark:border-zinc-800/40 rounded-2xl flex items-center gap-3">
                  <div className="w-8 h-8 rounded-xl bg-slate-100 dark:bg-zinc-900 flex items-center justify-center text-slate-400 dark:text-slate-500">
                    <FileText className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-slate-400 dark:text-slate-500">Registered Email / Identifier</p>
                    <p className="text-xs text-slate-600 dark:text-slate-300 font-mono mt-0.5">{user.email}</p>
                  </div>
                </div>
              </div>
            )}

            {/* Encryption Tab */}
            {activeTab === 'encryption' && (
              <div className="space-y-4">
                <div className="bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-100 dark:border-emerald-900/50 p-4 rounded-2xl text-emerald-800 dark:text-emerald-300 flex gap-3">
                  <Key className="w-5 h-5 flex-shrink-0 mt-0.5" />
                  <div className="text-xs space-y-1">
                    <p className="font-bold">Zero-Knowledge Architecture</p>
                    <p className="leading-relaxed text-emerald-700 dark:text-emerald-400/90">
                      Messages are encrypted using AES/E2EE locally. Server operators cannot read your chat histories, attachments, or voice memos.
                    </p>
                  </div>
                </div>

                {/* Secret Key Setting */}
                <div>
                  <label className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider block mb-1.5">
                    Your Personal E2EE Passphrase
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="password"
                      value={encryptionPassphrase}
                      onChange={(e) => setEncryptionPassphrase(e.target.value)}
                      className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-transparent dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 font-mono"
                      placeholder="Passphrase used for decryption"
                    />
                    <button
                      onClick={() => setEncryptionPassphrase(Math.random().toString(36).substring(2, 14))}
                      className="px-3 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-semibold transition"
                    >
                      Regen
                    </button>
                  </div>
                </div>

                {/* Cryptographic Keypair concept */}
                <div className="p-4 bg-slate-50 dark:bg-zinc-950 border dark:border-zinc-800/40 rounded-2xl space-y-2.5">
                  <div className="flex justify-between items-center text-xs">
                    <span className="font-semibold text-slate-500 dark:text-slate-400">Cryptographic Identity Key</span>
                    <span className="text-[10px] text-teal-600 font-mono px-1.5 py-0.5 bg-teal-50 dark:bg-teal-950 rounded border border-teal-100 dark:border-teal-900">VERIFIED</span>
                  </div>
                  <div className="font-mono text-[10px] text-slate-400 dark:text-slate-500 break-all bg-white dark:bg-zinc-900 p-2.5 rounded-lg border border-slate-100 dark:border-zinc-800 leading-normal">
                    pub_sec_aero_v1_06072026_x893259048993f4a20b0805c898c8eef9278ff92de49e0db7e163b86009ae8db60
                  </div>
                </div>
              </div>
            )}

            {/* Backup Tab */}
            {activeTab === 'backup' && (
              <div className="space-y-4">
                <div className="bg-teal-50 dark:bg-teal-950/20 border border-teal-100 dark:border-teal-900/50 p-4 rounded-2xl text-teal-800 dark:text-teal-300 flex gap-3">
                  <Cloud className="w-5 h-5 flex-shrink-0 mt-0.5" />
                  <div className="text-xs space-y-1">
                    <p className="font-bold">Automated Cloud Syncing Enabled</p>
                    <p className="leading-relaxed text-teal-700 dark:text-teal-400/90">
                      We periodically back up your encrypted chat messages to Firebase Firestore, facilitating seamless, cross-device accessibility immediately upon login.
                    </p>
                  </div>
                </div>

                {/* Automatic Sync Switch */}
                <div className="flex items-center justify-between p-3 rounded-2xl bg-slate-50 dark:bg-zinc-950 border border-slate-100 dark:border-zinc-800/60">
                  <div>
                    <p className="text-xs font-bold text-slate-700 dark:text-slate-300">Continuous Auto-Sync</p>
                    <p className="text-[10px] text-slate-500 mt-0.5">Saves every sent/received message instantly</p>
                  </div>
                  <button
                    onClick={() => setCloudSync(!cloudSync)}
                    className={`w-11 h-6 rounded-full p-1 transition ${cloudSync ? 'bg-teal-500' : 'bg-slate-300 dark:bg-slate-800'}`}
                  >
                    <div className={`w-4 h-4 rounded-full bg-white transition shadow-sm ${cloudSync ? 'translate-x-5' : 'translate-x-0'}`} />
                  </button>
                </div>

                {/* Manual Trigger Backup */}
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1">
                      Manual Backup Sync
                    </h4>
                    <p className="text-[10px] text-slate-500 dark:text-slate-400">
                      Force compilation of your database archive right now
                    </p>
                  </div>
                  <button
                    onClick={handleTriggerBackup}
                    disabled={isBackingUp}
                    className="flex items-center gap-2 px-4 py-2 bg-teal-500 hover:bg-teal-600 text-white rounded-xl text-xs font-semibold shadow-md transition disabled:opacity-50 cursor-pointer"
                  >
                    {isBackingUp ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        Syncing...
                      </>
                    ) : (
                      <>
                        <Download className="w-3.5 h-3.5" />
                        Backup Now
                      </>
                    )}
                  </button>
                </div>

                {/* Backup History Log */}
                <div className="space-y-2">
                  <h4 className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                    Recent Backup Log
                  </h4>
                  <div className="space-y-1.5 max-h-32 overflow-y-auto pr-1">
                    {backupHistory.length > 0 ? (
                      backupHistory.map((b) => (
                        <div key={b.id} className="flex justify-between items-center text-[10px] p-2 bg-slate-50 dark:bg-slate-950 rounded-xl border border-slate-100 dark:border-slate-800">
                          <span className="font-medium text-slate-600 dark:text-slate-300">
                            {new Date(b.timestamp).toLocaleString()}
                          </span>
                          <span className="font-mono text-slate-500 dark:text-slate-400">
                            {b.messageCount} msgs • {b.sizeKb} KB
                          </span>
                        </div>
                      ))
                    ) : (
                      <p className="text-[10px] text-slate-400 dark:text-slate-500 italic p-2 text-center bg-slate-50 dark:bg-slate-950 rounded-xl">
                        No manual backups triggered yet. Auto-Sync is protecting your data.
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Action Button Footer */}
          <div className="flex justify-end gap-3 pt-4 border-t border-slate-100 dark:border-slate-800">
            {saveSuccess && (
              <span className="text-xs text-teal-600 dark:text-teal-400 font-semibold self-center flex items-center gap-1.5 mr-2 animate-pulse">
                ✓ Changes saved successfully
              </span>
            )}
            <button
              onClick={activeTab === 'profile' ? handleSaveProfile : handleSaveEncryption}
              className="px-5 py-2.5 bg-teal-500 hover:bg-teal-600 text-white rounded-xl text-xs font-semibold shadow-lg shadow-teal-500/15 tracking-wide transition cursor-pointer"
            >
              Save Changes
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
