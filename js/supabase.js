// ===== SUPABASE STORAGE =====
// Uploads photos to Supabase tied to a per-device ID (no login needed)
//
// ⚠️ NOTE: Replace SUPABASE_ANON_KEY below with your real Supabase anon key.
// The placeholder value will cause all API calls to return 401 Unauthorized.
// Find it in: Supabase Dashboard → Settings → API → Project API keys → anon public

const SUPABASE_URL = 'https://sedgohupnmmacdfwdata.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNlZGdvaHVwbm1tYWNkZndkYXRhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY2Mjk2NDAsImV4cCI6MjEwMjIwNTY0MH0.uxR6kRDnfq3XKzshvWm3Pgcm_sTWZcTsl5n6A5P0-fg';
const BUCKET = 'photos';

// Generate or retrieve per-device ID
function getDeviceId() {
  let id = localStorage.getItem('us_device_id');
  if (!id) {
    id = 'dev_' + Math.random().toString(36).substring(2, 11) + Date.now().toString(36);
    localStorage.setItem('us_device_id', id);
  }
  return id;
}

const storage = {
  deviceId: getDeviceId(),

  async upload(dataURL) {
    try {
      // Convert dataURL to blob
      const response = await fetch(dataURL);
      const blob = await response.blob();

      const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      // Include device ID in path for per-device isolation
      const path = `${this.deviceId}/${ts}.jpg`;

      const res = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${path}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
          'Content-Type': 'image/jpeg',
        },
        body: blob,
      });

      if (!res.ok) {
        const errText = await res.text();
        console.error('Upload failed:', res.status, errText);
        return null;
      }

      const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${path}`;
      return publicUrl;
    } catch (e) {
      console.error('Upload error:', e);
      return null;
    }
  },

  async listPhotos() {
    try {
      // List only THIS device's photos (using folder prefix for isolation)
      const res = await fetch(`${SUPABASE_URL}/storage/v1/object/list/${BUCKET}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          prefix: this.deviceId + '/',
          limit: 50,
          offset: 0,
          sortBy: { column: 'created_at', order: 'desc' },
        }),
      });

      if (!res.ok) {
        console.error('List failed:', res.status);
        return [];
      }

      const data = await res.json();

      // Handle both array response and potential error object
      if (!Array.isArray(data)) {
        console.error('List returned non-array:', data);
        return [];
      }

      return data
        .filter(item => item.name && (item.name.endsWith('.jpg') || item.name.endsWith('.png')))
        .map(item => ({
          url: `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${this.deviceId}/${item.name}`,
          name: item.name,
          created: item.created_at,
        }));
    } catch (e) {
      console.error('List error:', e);
      return [];
    }
  },

  async deletePhoto(url) {
    try {
      // Extract path from URL (everything after /{BUCKET}/)
      const marker = `/${BUCKET}/`;
      const idx = url.indexOf(marker);
      if (idx === -1) {
        console.error('Delete: could not parse path from URL');
        return false;
      }
      const path = url.substring(idx + marker.length);
      // URL-decode in case of encoded characters
      const decodedPath = decodeURIComponent(path);

      const res = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${decodedPath}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        },
      });

      if (!res.ok) {
        console.error('Delete failed:', res.status, await res.text());
        return false;
      }

      return true;
    } catch (e) {
      console.error('Delete error:', e);
      return false;
    }
  },
};
