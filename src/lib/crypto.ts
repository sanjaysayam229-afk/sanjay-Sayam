// Aero Simple End-to-End Encryption Obfuscation Utils
export function encryptText(text: string, key: string): string {
  let result = '';
  for (let i = 0; i < text.length; i++) {
    const charCode = text.charCodeAt(i);
    const keyChar = key.charCodeAt(i % key.length);
    result += String.fromCharCode(charCode ^ keyChar);
  }
  return btoa(result); // Base64 encode the XOR results
}

export function decryptText(encryptedBase64: string, key: string): string {
  try {
    const raw = atob(encryptedBase64);
    let result = '';
    for (let i = 0; i < raw.length; i++) {
      const charCode = raw.charCodeAt(i);
      const keyChar = key.charCodeAt(i % key.length);
      result += String.fromCharCode(charCode ^ keyChar);
    }
    return result;
  } catch (e) {
    return "[Decryption Error: Invalid security passphrase key]";
  }
}
