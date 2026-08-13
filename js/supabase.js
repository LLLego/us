// ===== SUPABASE STORAGE =====
// Uploads photos to Supabase tied to a per-device ID (no login needed)

const SUPABASE_URL = 'https://sedgohupnmmacdfwdata.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNlZGdvaHVwbm1tYWNkZndkYXRhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY2Mjk2NDAsImV4cCI6MjEwMjIwNTY0MH0.uxR6kRDnfq3XKzshvWm3Pgcm_sTWZcTsl5n6A5P0-fg';
const BUCKET = 'photos';

// Generate or retrieve per-device ID
function getDeviceId() {
  let id = localStorage.getItem('us_device_id');
  if (!id) {
    id = 'dev_' + Math.random().toString(36).substr(2, 9) + Date.now().toString(36);
    localStorage.setItem('us_device_id', id);
  }
  return id;
}

const storage = {
  deviceId: getDeviceId(),
  
  async upload(dataURL) {
    try {
      const response = await fetch(dataURL);
      const blob = await response.blob();
      
      const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      // Include device ID in filename so we can filter
      const filename = `${this.deviceId}/${ts}.jpg`;
      
      const res = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${filename}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
          'Content-Type': 'image/jpeg',
        },
        body: blob,
      });
      
      if (!res.ok) {
        console.error('Upload failed:', await res.text());
        return null;
      }
      
      const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${filename}`;
      return publicUrl;
    } catch (e) {
      console.error('Upload error:', e);
      return null;
    }
  },
  
  async listPhotos() {
    try {
      // List only THIS device's photos (using folder prefix)
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
      
      if (!res.ok) return [];
      
      const data = await res.json();
      return data
        .filter(item => item.name.endsWith('.jpg') || item.name.endsWith('.png'))
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
      // Extract filename from URL
      const filename = url.split(`/${BUCKET}/`)[1];
      if (!filename) return false;
      
      const res = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${filename}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        },
      });
      
      return res.ok;
    } catch (e) {
      console.error('Delete error:', e);
      return false;
    }
  },
};

