// Service Worker Disabled
// This file exists to prevent 404 errors if a browser attempts to re-fetch an old registration.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', () => self.clients.claim());