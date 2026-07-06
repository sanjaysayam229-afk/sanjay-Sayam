import React, { useState } from 'react';
import { auth, db } from '../lib/firebase';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, signInAnonymously } from 'firebase/auth';
import { doc, setDoc, getDoc } from 'firebase/firestore';
import { Mail, Phone, Lock, User, Sparkles, LogIn, ShieldAlert, Key, ArrowLeft, CheckCircle2 } from 'lucide-react';
import Logo from './Logo';

interface AuthProps {
  onAuthSuccess: (userId: string) => void;
}

const DEMO_ACCOUNTS = [
  { email: 'alice@aerochat.com', password: 'password123', name: 'Alice (Demo)', color: 'from-pink-500 to-rose-500', status: 'In a meeting • Aero Chat' },
  { email: 'bob@aerochat.com', password: 'password123', name: 'Bob (Demo)', color: 'from-blue-500 to-indigo-600', status: 'Available • Aero Chat' },
  { email: 'charlie@aerochat.com', password: 'password123', name: 'Charlie (Demo)', color: 'from-amber-400 to-orange-600', status: 'At the gym • Aero Chat' }
];

export default function Auth({ onAuthSuccess }: AuthProps) {
  const [isRegistering, setIsRegistering] = useState(false);
  const [authMethod, setAuthMethod] = useState<'phone' | 'email'>('phone');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [phone, setPhone] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // OTP Password Reset States
  const [isResettingPassword, setIsResettingPassword] = useState(false);
  const [resetStep, setResetStep] = useState(1); // 1: Email, 2: OTP, 3: New Password
  const [resetEmail, setResetEmail] = useState('');
  const [resetOtp, setResetOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [simulatedOtp, setSimulatedOtp] = useState('');
  const [resetSuccessMessage, setResetSuccessMessage] = useState('');

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      let finalEmail = email.trim();
      
      if (authMethod === 'phone') {
        const cleanedPhone = phone.replace(/\D/g, '');
        if (cleanedPhone.length < 10) {
          setError('Please enter a valid phone number with at least 10 digits.');
          setIsLoading(false);
          return;
        }
        finalEmail = `${cleanedPhone}@aerochat.com`;
      } else {
        if (!finalEmail.includes('@')) {
          setError('Please enter a valid email address.');
          setIsLoading(false);
          return;
        }
      }

      if (isRegistering) {
        // Sign up
        const userCredential = await createUserWithEmailAndPassword(auth, finalEmail, password);
        const user = userCredential.user;

        // Set profile in Firestore
        await setDoc(doc(db, 'users', user.uid), {
          id: user.uid,
          email: finalEmail,
          phoneNumber: authMethod === 'phone' ? phone : '',
          displayName: displayName || (authMethod === 'phone' ? phone : finalEmail.split('@')[0]),
          photoURL: 'from-teal-400 to-emerald-600',
          status: 'Hey there! I am using Aero Chat.',
          online: true,
          fallbackPassword: password, // Save here to ensure password reset fallback works
          lastSeen: new Date().toISOString()
        });

        onAuthSuccess(user.uid);
      } else {
        // Sign in
        try {
          const userCredential = await signInWithEmailAndPassword(auth, finalEmail, password);
          
          // Also update their fallbackPassword in Firestore so it remains in sync
          try {
            const { updateDoc } = await import('firebase/firestore');
            await updateDoc(doc(db, 'users', userCredential.user.uid), {
              fallbackPassword: password
            });
          } catch (updateErr) {
            console.warn("Could not update fallbackPassword in background:", updateErr);
          }

          onAuthSuccess(userCredential.user.uid);
        } catch (err: any) {
          console.warn("Standard sign-in failed, checking custom login fallback...", err);
          
          try {
            const res = await fetch('/api/auth/verify-login', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ email: finalEmail, password })
            });
            const data = await res.json();
            
            if (res.ok && data.customToken) {
              const { signInWithCustomToken, updatePassword } = await import('firebase/auth');
              const userCredential = await signInWithCustomToken(auth, data.customToken);
              
              // Automatically sync the main Firebase Auth password so standard login works next time!
              try {
                await updatePassword(userCredential.user, password);
                console.log("Password synchronized with Firebase Auth successfully!");
              } catch (syncErr) {
                console.warn("Could not automatically update Firebase Auth password:", syncErr);
              }
              
              onAuthSuccess(userCredential.user.uid);
              return;
            }
          } catch (fallbackErr) {
            console.error("Custom login fallback failed:", fallbackErr);
          }

          if (err && err.code === 'auth/operation-not-allowed') {
            setError('Notice: Email/Password Authentication is not enabled in this Firebase project. Please click "Secure Guest Login" below to connect as a guest instantly.');
          } else {
            setError(err.message || 'Authentication failed. Please check credentials.');
          }
        }
      }
    } catch (err: any) {
      console.error(err);
      if (err && err.code === 'auth/operation-not-allowed') {
        setError('Notice: Email/Password Authentication is not enabled in this Firebase project. Please click "Secure Guest Login" below to connect as a guest instantly.');
      } else {
        setError(err.message || 'Authentication failed. Please check credentials.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleGuestLogin = async () => {
    setError('');
    setIsLoading(true);
    try {
      localStorage.removeItem('manualLogout');
      const userCredential = await signInAnonymously(auth);
      const user = userCredential.user;

      // Set profile in Firestore for anonymous user
      const userDocRef = doc(db, 'users', user.uid);
      const docSnap = await getDoc(userDocRef);
      if (!docSnap.exists()) {
        await setDoc(userDocRef, {
          id: user.uid,
          email: 'guest@aerochat.com',
          displayName: `Guest-${user.uid.slice(0, 5)}`,
          photoURL: 'from-purple-400 to-pink-500',
          status: 'Exploring Aero Chat as Guest.',
          online: true,
          lastSeen: new Date().toISOString()
        });
      }
      onAuthSuccess(user.uid);
    } catch (err: any) {
      console.error('Anonymous login failed:', err);
      if (err && err.code === 'auth/operation-not-allowed') {
        setError('Notice: Anonymous Sign-In is disabled on this Firebase project as well. Please contact your system administrator or check the console.');
      } else {
        setError(`Guest Login Failed: ${err.message || 'Unknown error'}`);
      }
    } finally {
      setIsLoading(false);
    }
  };

  // Demo account quick launcher
  const handleDemoLogin = async (demo: typeof DEMO_ACCOUNTS[0]) => {
    setError('');
    setIsLoading(true);
    try {
      let userCredential;
      try {
        // Try to log in first
        userCredential = await signInWithEmailAndPassword(auth, demo.email, demo.password);
      } catch (e: any) {
        if (e && e.code === 'auth/operation-not-allowed') {
          throw e;
        }
        // If account doesn't exist, register it first
        userCredential = await createUserWithEmailAndPassword(auth, demo.email, demo.password);
        await setDoc(doc(db, 'users', userCredential.user.uid), {
          id: userCredential.user.uid,
          email: demo.email,
          displayName: demo.name,
          photoURL: demo.color,
          status: demo.status,
          online: true,
          lastSeen: new Date().toISOString()
        });
      }
      onAuthSuccess(userCredential.user.uid);
    } catch (err: any) {
      console.error('Demo registration failed:', err);
      if (err && err.code === 'auth/operation-not-allowed') {
        setError('Notice: Demo logins are currently unavailable because Email/Password authentication is disabled in this Firebase project. Please click "Secure Guest Login" below.');
      } else {
        setError('Failed to load demo session.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  // OTP Reset handlers
  const handleRequestOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setResetSuccessMessage('');
    setIsLoading(true);
    setSimulatedOtp('');

    try {
      const res = await fetch('/api/auth/otp-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: resetEmail })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to generate verification code.');
      }
      if (data.debugOtp) {
        setSimulatedOtp(data.debugOtp);
      }
      setResetStep(2);
    } catch (err: any) {
      setError(err.message || 'Verification request failed. Please verify the email is correct.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const res = await fetch('/api/auth/otp-verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: resetEmail, otp: resetOtp })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Invalid verification code.');
      }
      setResetStep(3);
    } catch (err: any) {
      setError(err.message || 'Invalid verification code. Please check and try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const res = await fetch('/api/auth/otp-reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: resetEmail, otp: resetOtp, newPassword })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to update password.');
      }
      
      setResetSuccessMessage('Your password has been reset successfully! Please log in with your new password.');
      setEmail(resetEmail); // autofill email field
      
      // Reset state fields
      setResetStep(1);
      setResetEmail('');
      setResetOtp('');
      setNewPassword('');
      setSimulatedOtp('');
      setIsResettingPassword(false);
    } catch (err: any) {
      setError(err.message || 'Failed to update password.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCancelReset = () => {
    setIsResettingPassword(false);
    setResetStep(1);
    setResetEmail('');
    setResetOtp('');
    setNewPassword('');
    setSimulatedOtp('');
    setError('');
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-black flex flex-col items-center justify-center p-4 relative overflow-hidden">
      {/* Decorative background elements */}
      <div className="absolute inset-x-0 top-0 h-52 bg-gradient-to-b from-teal-500/10 to-transparent pointer-events-none" />

      {/* Subtle giant background watermark of the custom VSY interlocking logo */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-[0.03] dark:opacity-[0.015] z-0 select-none">
        <Logo className="w-[650px] h-[650px]" variant="currentColor" />
      </div>

      {/* Main container */}
      <div 
        className="w-full max-w-md bg-white dark:bg-zinc-950 rounded-3xl shadow-2xl border border-slate-100 dark:border-zinc-800/60 p-8 relative overflow-hidden transition-all"
        style={{ fontStyle: 'italic', fontWeight: 'bold', fontFamily: 'Times New Roman', textDecorationLine: 'none', lineHeight: '25px' }}
      >
        
        {/* App Branding */}
        <div className="text-center mb-6">
          <div className="w-16 h-16 rounded-3xl bg-slate-50 dark:bg-black mx-auto flex items-center justify-center text-teal-500 shadow-md border border-slate-100 dark:border-zinc-800/80 mb-3 p-2">
            <Logo className="w-12 h-12 animate-pulse" variant="brand" />
          </div>
          <h2 
            className="text-2xl font-bold text-slate-800 dark:text-slate-100 tracking-tight"
          >
            {isResettingPassword ? 'Security Center' : 'Whisper Chat'}
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            {isResettingPassword 
              ? `Step ${resetStep} of 3: Reset Secure Password`
              : isRegistering ? 'Create your secure account' : 'Sign in to access your secure chat sessions'}
          </p>
        </div>

        {/* Secure Channels / Privacy Protocols Badge Grid */}
        {!isResettingPassword && (
          <div 
            className="mb-6 p-2.5 rounded-2xl bg-teal-50/50 dark:bg-teal-950/10 border border-teal-100/30 dark:border-teal-900/20"
          >
            <p 
              className="text-[10px] font-bold text-teal-600 dark:text-teal-400 uppercase tracking-wider mb-2 text-center"
            >
              Active Security Protocols Enforced
            </p>
            <div className="grid grid-cols-2 gap-1 text-[10px] text-slate-600 dark:text-slate-400">
              <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-white/70 dark:bg-slate-900/60 shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping" />
                <span className="truncate">Whisper Chat (Default)</span>
              </div>
              <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-white/70 dark:bg-slate-900/60 shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
                <span className="w-1.5 h-1.5 rounded-full bg-teal-500" />
                <span className="truncate">Private Message</span>
              </div>
              <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-white/70 dark:bg-slate-900/60 shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
                <span className="w-1.5 h-1.5 rounded-full bg-cyan-500" />
                <span className="truncate">SecureChat & SafeMessage</span>
              </div>
              <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-white/70 dark:bg-slate-900/60 shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
                <span className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
                <span className="truncate">SecretTalk / SilentMsg</span>
              </div>
            </div>
          </div>
        )}

        {/* Success message banner */}
        {resetSuccessMessage && (
          <div className="mb-5 p-3 bg-emerald-50 dark:bg-emerald-950/20 text-emerald-600 dark:text-emerald-400 text-xs rounded-xl flex items-center gap-2 border border-emerald-100 dark:border-emerald-900/30">
            <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
            <p className="leading-snug font-medium">{resetSuccessMessage}</p>
          </div>
        )}

        {error && (
          <div className="mb-5 p-3 bg-rose-50 dark:bg-rose-950/20 text-rose-600 dark:text-rose-400 text-xs rounded-xl flex items-center gap-2 border border-rose-100 dark:border-rose-900/30 animate-shake">
            <ShieldAlert className="w-4 h-4 flex-shrink-0" />
            <p className="leading-snug">{error}</p>
          </div>
        )}

        {/* CONDITIONALLY RENDER OTP PASSWORD RESET FLOW */}
        {isResettingPassword ? (
          <div className="space-y-4">
            {/* STEP 1: Enter Email to Request OTP */}
            {resetStep === 1 && (
              <form onSubmit={handleRequestOtp} className="space-y-4">
                <div>
                  <label 
                    className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider block mb-1"
                    style={{ backgroundColor: '#706767' }}
                  >
                    Registered Email Address
                  </label>
                  <div className="relative">
                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400">
                      <Mail className="w-4 h-4" />
                    </span>
                    <input
                      type="email"
                      required
                      value={resetEmail}
                      onChange={(e) => setResetEmail(e.target.value)}
                      placeholder="your-email@domain.com"
                      className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 dark:text-white bg-transparent text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full py-3 bg-teal-500 hover:bg-teal-600 text-white rounded-xl text-sm font-semibold shadow-lg shadow-teal-500/15 transition disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer mt-2"
                >
                  {isLoading ? 'Requesting...' : 'Request Verification Code'}
                </button>
              </form>
            )}

            {/* STEP 2: Verify OTP Code */}
            {resetStep === 2 && (
              <form onSubmit={handleVerifyOtp} className="space-y-4">
                {/* Debug Sandbox Sim Card */}
                {simulatedOtp && (
                  <div className="p-4 bg-purple-50 dark:bg-purple-950/20 border border-purple-100 dark:border-purple-900/30 rounded-2xl text-xs text-purple-700 dark:text-purple-300 space-y-1.5 animate-bounce">
                    <div className="font-bold flex items-center gap-1.5 text-purple-800 dark:text-purple-400">
                      <Sparkles className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />
                      Sandbox OTP Code (Test Simulation)
                    </div>
                    <p className="opacity-90">Since this sandbox does not require external SMTP configuration, use the code below to test:</p>
                    <div className="text-center font-mono text-xl tracking-[0.25em] font-extrabold text-purple-600 dark:text-purple-400 py-2 bg-white dark:bg-slate-900 border border-purple-200/40 rounded-xl shadow-inner">
                      {simulatedOtp}
                    </div>
                  </div>
                )}

                <div>
                  <label className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider block mb-1">
                    Enter 6-Digit Code
                  </label>
                  <div className="relative">
                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400">
                      <Key className="w-4 h-4" />
                    </span>
                    <input
                      type="text"
                      required
                      maxLength={6}
                      pattern="\d{6}"
                      value={resetOtp}
                      onChange={(e) => setResetOtp(e.target.value.replace(/\D/g, ''))}
                      placeholder="123456"
                      className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 dark:text-white bg-transparent text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 font-mono tracking-widest text-center text-lg font-bold"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full py-3 bg-teal-500 hover:bg-teal-600 text-white rounded-xl text-sm font-semibold shadow-lg shadow-teal-500/15 transition disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer mt-2"
                >
                  {isLoading ? 'Verifying...' : 'Verify Code'}
                </button>
              </form>
            )}

            {/* STEP 3: Enter New Password */}
            {resetStep === 3 && (
              <form onSubmit={handleResetPassword} className="space-y-4">
                <div>
                  <label className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider block mb-1">
                    Enter New Password
                  </label>
                  <div className="relative">
                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400">
                      <Lock className="w-4 h-4" />
                    </span>
                    <input
                      type="password"
                      required
                      minLength={6}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="Minimum 6 characters"
                      className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 dark:text-white bg-transparent text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full py-3 bg-teal-500 hover:bg-teal-600 text-white rounded-xl text-sm font-semibold shadow-lg shadow-teal-500/15 transition disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer mt-2"
                >
                  {isLoading ? 'Updating...' : 'Save New Password'}
                </button>
              </form>
            )}

            <button
              type="button"
              onClick={handleCancelReset}
              className="w-full py-2.5 text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 text-xs font-bold transition flex items-center justify-center gap-1.5 mt-2 cursor-pointer animate-pulse"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Cancel and Return to Sign In
            </button>
          </div>
        ) : (
          /* STANDARD LOGIN AND REGISTRATION VIEWS */
          <>
            {/* Prominent Direct No-Password Entry */}
            <div className="mb-6 p-4 rounded-3xl bg-gradient-to-br from-emerald-50/70 to-teal-50/70 dark:from-emerald-950/15 dark:to-teal-950/15 border border-emerald-100/30 dark:border-teal-900/20 shadow-sm text-center">
              <p className="text-[10px] font-extrabold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider mb-2.5 flex items-center justify-center gap-1">
                <Sparkles className="w-3.5 h-3.5 text-emerald-500 animate-pulse" />
                कोई पासवर्ड या जीमेल की जरूरत नहीं (Direct Access)
              </p>
              <button
                type="button"
                onClick={handleGuestLogin}
                disabled={isLoading}
                className="w-full py-3.5 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white rounded-2xl text-sm font-extrabold shadow-lg shadow-teal-500/20 hover:shadow-teal-500/35 transition-all duration-300 disabled:opacity-50 flex flex-col items-center justify-center gap-0.5 cursor-pointer transform hover:-translate-y-0.5 active:translate-y-0"
              >
                <span className="flex items-center gap-1.5">
                  बिना पासवर्ड डायरेक्ट प्रवेश (Direct Entry)
                </span>
                <span className="text-[9px] text-emerald-100/90 font-medium tracking-wide">
                  Bypass Password & Email — Enter Instantly
                </span>
              </button>
            </div>

            <div className="relative my-5">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-slate-100 dark:border-zinc-800/40"></div>
              </div>
              <div className="relative flex justify-center text-[9px] uppercase font-bold tracking-widest text-slate-400">
                <span className="bg-white dark:bg-zinc-950 px-3">OR SECURE MANUALLY</span>
              </div>
            </div>

            {/* Tab switch for Phone vs Email */}
            <div 
              className="grid grid-cols-2 p-1 bg-slate-100 dark:bg-black rounded-2xl mb-5 border border-slate-200/30 dark:border-zinc-800/40"
            >
              <button
                type="button"
                onClick={() => { setAuthMethod('phone'); setError(''); }}
                className={`py-2 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer ${
                  authMethod === 'phone'
                    ? 'bg-white dark:bg-zinc-900 text-teal-600 dark:text-teal-400 shadow-sm border border-slate-200/20 dark:border-zinc-800/30'
                    : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
                }`}
              >
                <Phone className="w-3.5 h-3.5" />
                Phone & Password
              </button>
              <button
                type="button"
                onClick={() => { setAuthMethod('email'); setError(''); }}
                className={`py-2 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer ${
                  authMethod === 'email'
                    ? 'bg-white dark:bg-zinc-900 text-teal-600 dark:text-teal-400 shadow-sm border border-slate-200/20 dark:border-zinc-800/30'
                    : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
                }`}
              >
                <Mail className="w-3.5 h-3.5" />
                Email & Password
              </button>
            </div>

            <form onSubmit={handleAuth} className="space-y-4">
              {isRegistering && (
                <div>
                  <label 
                    className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider block mb-1"
                  >
                    Display Name
                  </label>
                  <div className="relative">
                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400">
                      <User className="w-4 h-4" />
                    </span>
                    <input
                      type="text"
                      required
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      placeholder="John Doe"
                      className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 dark:text-white bg-transparent text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                    />
                  </div>
                </div>
              )}

              {authMethod === 'phone' ? (
                <div>
                  <label 
                    className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider block mb-1"
                  >
                    Phone Number
                  </label>
                  <div className="relative">
                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400">
                      <Phone className="w-4 h-4" />
                    </span>
                    <input
                      type="tel"
                      required
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="e.g., 9876543210"
                      className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 dark:text-white bg-transparent text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                    />
                  </div>
                </div>
              ) : (
                <div>
                  <label 
                    className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider block mb-1"
                  >
                    Email Address
                  </label>
                  <div className="relative">
                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400">
                      <Mail className="w-4 h-4" />
                    </span>
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="name@domain.com"
                      className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 dark:text-white bg-transparent text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                    />
                  </div>
                </div>
              )}

              <div>
                <label className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider block mb-1">
                  Secure Password
                </label>
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400">
                    <Lock className="w-4 h-4" />
                  </span>
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 dark:text-white bg-transparent text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                  />
                </div>

                {/* Forgot Password Link */}
                {!isRegistering && (
                  <div className="flex justify-end mt-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        setIsResettingPassword(true);
                        setResetEmail(email);
                        setError('');
                      }}
                      className="text-[11px] text-teal-500 hover:underline font-bold transition cursor-pointer"
                    >
                      Forgot Password? (OTP Reset)
                    </button>
                  </div>
                )}
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full py-3 bg-teal-500 hover:bg-teal-600 text-white rounded-xl text-sm font-semibold shadow-lg shadow-teal-500/15 transition disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer mt-2"
              >
                <LogIn className="w-4 h-4" />
                {isLoading ? 'Processing...' : isRegistering ? 'Create Account' : 'Sign In'}
              </button>
            </form>

            {/* Switch mode */}
            <div className="text-center mt-5 text-xs">
              <button
                onClick={() => setIsRegistering(!isRegistering)}
                className="text-teal-500 hover:underline font-semibold cursor-pointer"
              >
                {isRegistering ? 'Already have an account? Sign In' : 'New here? Create a secure account'}
              </button>
            </div>

            {/* Demo Fast Sandbox Login Grid */}
            <div className="mt-8 pt-6 border-t border-slate-100 dark:border-slate-800">
              <h4 className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider text-center mb-3">
                Developer Sandbox Accounts (1-Click Login)
              </h4>
              <div className="grid grid-cols-3 gap-2">
                {DEMO_ACCOUNTS.map((demo) => (
                  <button
                    key={demo.email}
                    onClick={() => handleDemoLogin(demo)}
                    disabled={isLoading}
                    className="flex flex-col items-center p-2.5 rounded-xl bg-slate-50 hover:bg-slate-100 dark:bg-slate-950/40 dark:hover:bg-slate-900 border border-slate-100 dark:border-slate-800 transition active:scale-95 text-center group cursor-pointer"
                  >
                    <div className={`w-8 h-8 rounded-full bg-gradient-to-tr ${demo.color} flex items-center justify-center text-xs text-white font-bold group-hover:scale-105 transition`}>
                      {demo.name[0]}
                    </div>
                    <span className="text-[10px] font-bold text-slate-700 dark:text-slate-300 mt-1.5 leading-tight truncate max-w-full">
                      {demo.name.split(' ')[0]}
                    </span>
                    <span className="text-[8px] text-slate-400 uppercase mt-0.5 font-semibold tracking-wider">
                      Test Active
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </>
        )}

      </div>
    </div>
  );
}
