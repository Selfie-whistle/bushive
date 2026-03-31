
import admin from 'firebase-admin';

function initAdmin() {
  if (admin.apps.length) {
    return admin;
  }

  const json = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;

  if (!json) {
    throw new Error(
      'FIREBASE_SERVICE_ACCOUNT_JSON is not set. ' +
      'Add it to .env.local or your deployment environment.'
    );
  }

  let serviceAccount;
  try {
    const parsedJson = JSON.parse(json);
    // The private key from environment variables often has escaped newlines.
    // We need to replace them with actual newlines for the SDK to parse it correctly.
    if (parsedJson.private_key) {
        parsedJson.private_key = parsedJson.private_key.replace(/\\n/g, '\n');
    }
    serviceAccount = parsedJson;
  } catch (e: any) {
    throw new Error(
      'FIREBASE_SERVICE_ACCOUNT_JSON is not valid JSON. ' + e.message
    );
  }

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });

  return admin;
}

// ✅ Guaranteed initialization before use
const adminApp = initAdmin();

export const adminDb = adminApp.firestore();
export const adminAuth = adminApp.auth();
