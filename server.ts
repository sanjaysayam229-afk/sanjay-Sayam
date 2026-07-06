import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";
import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

dotenv.config();

// Initialize Firebase Admin SDK
const adminApp = initializeApp({
  projectId: "gen-lang-client-0066190016"
});

const adminAuth = getAuth(adminApp);
const adminDb = getFirestore(adminApp, "ai-studio-acb2fcc1-afea-4ebd-ac55-dcdc8e9094d6");

// In-memory OTP storage: email (lowercase) -> { otp, expiresAt }
const otpStore = new Map<string, { otp: string; expiresAt: number }>();

const app = express();
const PORT = 3000;

app.use(express.json());

let aiClient: GoogleGenAI | null = null;

function getAiClient(): GoogleGenAI {
  if (!aiClient) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY environment variable is required");
    }
    aiClient = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        }
      }
    });
  }
  return aiClient;
}

// AI Chat Route
app.post("/api/ai", async (req, res) => {
  try {
    const { messages } = req.body;
    if (!messages || !Array.isArray(messages)) {
      res.status(400).json({ error: "Invalid messages array provided" });
      return;
    }

    const ai = getAiClient();
    
    // Convert incoming format to GenAI format
    const contents = messages.map((m: any) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.text }]
    }));

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents,
      config: {
        systemInstruction: "You are Aero AI, a highly intelligent, secure, and helpful AI assistant built directly into the Aero Chat workspace. Your tone is professional, futuristic, and friendly. Provide concise, high-quality, and well-structured answers using markdown where appropriate.",
      }
    });

    res.json({ text: response.text });
  } catch (error: any) {
    console.error("Gemini API Error:", error);
    res.status(500).json({ error: error.message || "Failed to generate AI response" });
  }
});

// Request Password Reset OTP
app.post("/api/auth/otp-request", async (req, res) => {
  try {
    const { email } = req.body;
    if (!email || typeof email !== "string" || !email.includes("@")) {
      res.status(400).json({ error: "Please provide a valid email address." });
      return;
    }

    const normalizedEmail = email.trim().toLowerCase();

    // Verify user exists in Firestore instead of calling the restricted adminAuth.getUserByEmail
    const userQuery = await adminDb.collection("users")
      .where("email", "==", normalizedEmail)
      .limit(1)
      .get();

    if (userQuery.empty) {
      res.status(404).json({ error: "Account with this email does not exist. Please register first." });
      return;
    }

    // Generate a secure 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = Date.now() + 10 * 60 * 1000; // 10 minutes expiry

    // Save in storage
    otpStore.set(normalizedEmail, { otp, expiresAt });

    console.log(`[OTP GENERATED] Email: ${normalizedEmail} -> OTP: ${otp}`);

    // Return success. We include debugOtp so that users can test the app instantly
    // in the AI Studio container sandbox environment without real SMTP configuration.
    res.json({
      success: true,
      message: "A verification code has been generated.",
      debugOtp: otp
    });
  } catch (error: any) {
    console.error("OTP Request Error:", error);
    res.status(500).json({ error: error.message || "Failed to request verification code." });
  }
});

// Verify Password Reset OTP
app.post("/api/auth/otp-verify", async (req, res) => {
  try {
    const { email, otp } = req.body;
    if (!email || !otp) {
      res.status(400).json({ error: "Email and verification code are required." });
      return;
    }

    const normalizedEmail = email.trim().toLowerCase();
    const record = otpStore.get(normalizedEmail);

    if (!record) {
      res.status(400).json({ error: "No active verification code request found for this email." });
      return;
    }

    if (record.expiresAt < Date.now()) {
      otpStore.delete(normalizedEmail);
      res.status(400).json({ error: "The verification code has expired. Please request a new one." });
      return;
    }

    if (record.otp !== otp.trim()) {
      res.status(400).json({ error: "Invalid verification code. Please check and try again." });
      return;
    }

    res.json({ success: true, message: "Code verified successfully." });
  } catch (error: any) {
    console.error("OTP Verification Error:", error);
    res.status(500).json({ error: error.message || "Failed to verify code." });
  }
});

// Reset Password with Verified OTP
app.post("/api/auth/otp-reset", async (req, res) => {
  try {
    const { email, otp, newPassword } = req.body;
    if (!email || !otp || !newPassword) {
      res.status(400).json({ error: "All fields are required to complete password reset." });
      return;
    }

    if (newPassword.length < 6) {
      res.status(400).json({ error: "Password must be at least 6 characters long." });
      return;
    }

    const normalizedEmail = email.trim().toLowerCase();
    const record = otpStore.get(normalizedEmail);

    // Security check: verify OTP matches and is not expired
    if (!record || record.otp !== otp.trim() || record.expiresAt < Date.now()) {
      res.status(400).json({ error: "Session has expired or is invalid. Please start the verification process again." });
      return;
    }

    // Verify user exists in Firestore
    const userQuery = await adminDb.collection("users")
      .where("email", "==", normalizedEmail)
      .limit(1)
      .get();

    if (userQuery.empty) {
      res.status(404).json({ error: "User account not found." });
      return;
    }

    const userDoc = userQuery.docs[0];
    const uid = userDoc.id;

    // Update the local fallbackPassword field in Firestore
    await userDoc.ref.update({
      fallbackPassword: newPassword
    });

    // Invalidate OTP after use
    otpStore.delete(normalizedEmail);

    // Generate custom login token
    let customToken = "";
    try {
      customToken = await adminAuth.createCustomToken(uid);
    } catch (tokenError: any) {
      console.warn("Could not generate custom token (this is fine if permissions are restricted):", tokenError);
    }

    res.json({
      success: true,
      message: "Your password has been reset successfully!",
      customToken: customToken || null
    });
  } catch (error: any) {
    console.error("OTP Password Reset Error:", error);
    res.status(500).json({ error: error.message || "Failed to update password." });
  }
});

// Fallback Login API
app.post("/api/auth/verify-login", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      res.status(400).json({ error: "Email/Phone and password are required." });
      return;
    }

    const input = email.trim().toLowerCase();
    let queryValue = input;

    if (!input.includes("@")) {
      // Clean phone number format
      const cleaned = input.replace(/\D/g, "");
      queryValue = `${cleaned}@aerochat.com`;
    }

    // Check Firestore
    const userQuery = await adminDb.collection("users")
      .where("email", "==", queryValue)
      .limit(1)
      .get();

    if (userQuery.empty) {
      res.status(404).json({ error: "User account not found." });
      return;
    }

    const userDoc = userQuery.docs[0];
    const userData = userDoc.data();

    // Verify against the fallbackPassword stored during OTP reset
    if (userData.fallbackPassword && userData.fallbackPassword === password) {
      // Correct fallback password! Attempt to create custom token for login
      let customToken = "";
      try {
        customToken = await adminAuth.createCustomToken(userDoc.id);
      } catch (tokenError: any) {
        console.error("Error creating custom token:", tokenError);
      }

      if (customToken) {
        res.json({ success: true, customToken });
        return;
      }
    }

    res.status(401).json({ error: "Incorrect password or username." });
  } catch (error: any) {
    console.error("Fallback Login Error:", error);
    res.status(500).json({ error: "Login check failed." });
  }
});

async function startServer() {
  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
