/**
 * Configuration Template for IBM RideMatch
 *
 * SETUP INSTRUCTIONS:
 * 1. Copy this file to config.js: `cp config.example.js config.js`
 * 2. Fill in your actual API keys in config.js
 * 3. NEVER commit config.js to Git (it's in .gitignore)
 *
 * SECURITY NOTE:
 * - config.js is gitignored and will not be committed
 * - Keep your API keys secret
 * - For production, use Firebase App Check for additional security
 */

window.CONFIG = {
  /**
   * Firebase Configuration
   * Get these values from: https://console.firebase.google.com
   * Project Settings > General > Your apps > Firebase SDK snippet > Config
   */
  firebase: {
    apiKey: "YOUR_FIREBASE_API_KEY_HERE",
    authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
    databaseURL: "https://YOUR_PROJECT_ID-default-rtdb.firebaseio.com",
    projectId: "YOUR_PROJECT_ID",
    storageBucket: "YOUR_PROJECT_ID.firebasestorage.app",
    messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
    appId: "YOUR_APP_ID",
    measurementId: "YOUR_MEASUREMENT_ID"
  },

  /**
   * Google Maps API Key
   * Get from: https://console.cloud.google.com/apis/credentials
   *
   * Required APIs to enable:
   * - Maps JavaScript API
   * - Places API
   * - Directions API
   * - Geometry API
   */
  googleMapsApiKey: "YOUR_GOOGLE_MAPS_API_KEY_HERE",

  /**
   * IBM Location
   * AFZ Building F30, Heredia, Costa Rica
   * (No need to change these)
   */
  ibmLocation: {
    lat: 10.0050,
    lng: -84.1167
  }
};
