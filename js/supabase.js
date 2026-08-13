// ===== SUPABASE STORAGE =====
// Uploads photos to Supabase so they're shareable online

const SUPABASE_URL = 'https://sedgohupnmmacdfwdata.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNlZGdvaHVwbm1tYWNkZndkYXRhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY2Mjk2NDAsImV4cCI6MjEwMjIwNTY0MH0.uxR6kRDnfq3XKzshvWm3Pgcm_sTWZcTsl5n6A5P0-fg';
const BUCKET = 'photos';

const storage = {
  async upload(dataURL) {
    try {
      // Convert dataURL to blob
      const response = await fetch(dataURL);
      const blob = await response.blob();
      
      // Generate unique filename
      const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const filename = `us_${ts}.jpg`;
      
      // Upload to Supabase Storage
      const res = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${filename}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
          'Content-Type': 'image/jpeg',
        },
        body: blob,
      });
      
      if (!res.ok) {
        const err = await res.text();
        console.error('Upload failed:', err);
        return null;
      }
      
      // Return public URL
      const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${filename}`;
      console.log('Uploaded:', publicUrl);
      return publicUrl;
    } catch (e) {
      console.error('Upload error:', e);
      return null;
    }
  },
  
  async listPhotos() {
    try {
      const res = await fetch(`${SUPABASE_URL}/storage/v1/object/list/${BUCKET}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          prefix: '',
          limit: 50,
          offset: 0,
          sortBy: { column: 'created_at', order: 'desc' },
        }),
      });
      
      if (!res.ok) return [];
      
      const data = await res.json();
      // Filter to only images, build public URLs
      return data
        .filter(item => item.name.endsWith('.jpg') || item.name.endsWith('.png'))
        .map(item => ({
          url: `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${item.name}`,
          name: item.name,
          created: item.created_at,
        }));
    } catch (e) {
      console.error('List error:', e);
      return [];
    }
  },
};
