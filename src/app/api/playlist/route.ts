import { NextResponse } from 'next/server';
import { VideoItem, mockPlaylist, supabase } from '@/lib/supabase';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const host = request.headers.get('host') || 'localhost:3000';
  const protocol = host.includes('localhost') ? 'http' : 'https';
  const baseUrl = `${protocol}://${host}`;

  let playlist: VideoItem[] = mockPlaylist;

  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('playlist')
        .select('*')
        .order('order', { ascending: true });

      if (data && !error) {
        playlist = data;
      }
    } catch (e) {
      console.error('Error fetching from Supabase:', e);
    }
  }

  let m3uContent = '#EXTM3U\n';

  playlist.forEach((item) => {
    m3uContent += `#EXTINF:-1 tvg-id="${item.id}" tvg-name="${item.title}" group-title="YouTube Live",${item.title}\n`;
    m3uContent += `${baseUrl}/api/stream?v=${item.youtube_id}\n`;
  });

  return new Response(m3uContent, {
    headers: {
      'Content-Type': 'application/x-mpegurl',
      'Content-Disposition': 'attachment; filename="playlist.m3u8"',
    },
  });
}
