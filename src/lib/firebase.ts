import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore, doc, getDoc, setDoc, getDocFromServer } from 'firebase/firestore';

const firebaseConfig = {
  projectId: "gen-lang-client-0066190016",
  appId: "1:893259048993:web:5fc9f07be7483a9ae8db60",
  apiKey: "AIzaSyB3pGUD9r0e9_9IrJZMKe3ArFJ826zTqEQ",
  authDomain: "gen-lang-client-0066190016.firebaseapp.com",
  firestoreDatabaseId: "ai-studio-acb2fcc1-afea-4ebd-ac55-dcdc8e9094d6",
  storageBucket: "gen-lang-client-0066190016.firebasestorage.app",
  messagingSenderId: "893259048993",
  measurementId: ""
};

// Initialize Firebase
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
export const auth = getAuth(app);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

// Ensure Aero AI Bot User exists in Firestore
export async function ensureAeroAIBot() {
  try {
    const aiDocRef = doc(db, 'users', 'aero-ai-bot');
    const snap = await getDoc(aiDocRef);
    if (!snap.exists()) {
      await setDoc(aiDocRef, {
        id: 'aero-ai-bot',
        email: 'ai@whisper.chat',
        displayName: 'Whisper AI',
        photoURL: 'from-purple-600 to-indigo-600',
        status: 'Whisper AI Assistant powered by Gemini',
        online: true,
        lastSeen: new Date().toISOString()
      });
      console.log("Whisper AI Bot user provisioned successfully in Firestore.");
    } else {
      // Keep it updated if it already exists
      await setDoc(aiDocRef, {
        displayName: 'Whisper AI',
        email: 'ai@whisper.chat',
        status: 'Whisper AI Assistant powered by Gemini',
      }, { merge: true });
    }
  } catch (error) {
    console.error("Error ensuring Whisper AI bot user exists:", error);
  }
}

// Validate Firestore connection on boot as mandated
export async function testConnection() {
  try {
    const testDocRef = doc(db, 'test', 'connection');
    await getDocFromServer(testDocRef);
    console.log("Firestore connection verified successfully.");
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error("Please check your Firebase configuration: Client is offline.");
    } else {
      console.warn("Firestore connection check completed. (Expected: document may not exist, but connection is live).", error);
    }
  }
}
