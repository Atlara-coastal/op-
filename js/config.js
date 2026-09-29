/**
 * OP - Runtime Configuration
 *
 * This is a separate deployment (its own Supabase project, own Firebase
 * project, own cloud accounts) — do NOT reuse JocoAdmin's keys here, or OP
 * would read/write JocoAdmin's database and mix up the two businesses' data.
 *
 * Fill these in with YOUR OWN Supabase project's values (Project Settings >
 * API). The "anon public" key is safe to ship in client code by design —
 * real protection comes from Row Level Security policies on the database
 * (see supabase/schema.sql). NEVER put the "service_role" key here.
 */
export const SUPABASE_URL = 'https://rrcymxvenlgibitivhiz.supabase.co';
export const SUPABASE_ANON_KEY = 'sb_publishable_SupS25GaBie9lrRql-IUuA_ft6VBzMZ';

// Firebase (push notifications) — your own Firebase project for OP. These
// web keys are public by design.
export const FIREBASE_CONFIG = {
  apiKey: 'AIzaSyACQypHsPbTxx3soo9szT6A1icdUF2loAI',
  authDomain: 'opgestion-fbea7.firebaseapp.com',
  projectId: 'opgestion-fbea7',
  storageBucket: 'opgestion-fbea7.firebasestorage.app',
  messagingSenderId: '675989086511',
  appId: '1:675989086511:web:5226c9ff1f923433d6c1da'
};
export const FIREBASE_VAPID_KEY = 'BBl1CLuzEy5UqcKN6BmeeFGXOEo8K-FTFDllTXvK3eE7rw7qBam2Rq6WKQ2gou22ycD0NbLtt8xee1WMIbkkKic';

// Internal domain used to turn a plain username into a Supabase Auth email.
// Do not change this after users have been created, or logins will break.
export const AUTH_USERNAME_DOMAIN = 'users.op.internal';
