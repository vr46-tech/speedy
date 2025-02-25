import { VercelRequest, VercelResponse } from '@vercel/node';
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, query, where, getDocs } from 'firebase/firestore';

// Firebase Configuration (Replace with your own)
const firebaseConfig = {
  apiKey: process.env.FIREBASE_API_KEY,
  authDomain: process.env.FIREBASE_AUTH_DOMAIN,
  projectId: process.env.FIREBASE_PROJECT_ID,
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.FIREBASE_APP_ID
};

// Initialize Firebase & Firestore
const firebaseApp = initializeApp(firebaseConfig);
const db = getFirestore(firebaseApp);

export default async (req: VercelRequest, res: VercelResponse) => {
  try {
    // Get query parameters
    const { date, skillLevel, status, location } = req.query;

    let matchesQuery = collection(db, 'matches');
    let filters = [];

    if (date && date !== 'all') {
      filters.push(where('date', '==', new Date(date as string)));
    }
    if (skillLevel && skillLevel !== 'all') {
      filters.push(where('skillLevel', '==', skillLevel as string));
    }
    if (status && status !== 'all') {
      filters.push(where('status', '==', status as string));
    }
    if (location && location !== 'All Locations') {
      filters.push(where('location', '==', location as string));
    }

    // Apply filters
    if (filters.length > 0) {
      matchesQuery = query(matchesQuery, ...filters);
    }

    // Fetch data
    const snapshot = await getDocs(matchesQuery);
    const matches = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    res.status(200).json({ matches });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch matches', details: error.message });
  }
};

