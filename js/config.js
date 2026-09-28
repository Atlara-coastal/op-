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
export const SUPABASE_URL = '';
export const SUPABASE_ANON_KEY = '';

// Firebase (push notifications) — your own Firebase project for OP. These
// web keys are public by design.
export const FIREBASE_CONFIG = {
  apiKey: '',
  authDomain: '',
  projectId: '',
  storageBucket: '',
  messagingSenderId: '',
  appId: ''
};
export const FIREBASE_VAPID_KEY = '';

// Internal domain used to turn a plain username into a Supabase Auth email.
// Do not change this after users have been created, or logins will break.
export const AUTH_USERNAME_DOMAIN = 'users.op.internal';
