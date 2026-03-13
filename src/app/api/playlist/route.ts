import { NextResponse } from 'next/server';
import { VideoItem, mockPlaylist, supabase } from '@/lib/supabase';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const format = searchParams.get('format');
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

  if (format === 'json') {
    return NextResponse.json(playlist);
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

export async function POST(request: Request) {
  if (!supabase) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 501 });
  }

  try {
    const newPlaylist: VideoItem[] = await request.json();
    
    // Simple but destructive update for 24/7 stream: 
    // Clear old and insert new. Order is maintained by the 'order' field.
    const { error: deleteError } = await supabase
      .from('playlist')
      .delete()
      .neq('id', 'placeholder_force_delete_all');

    if (deleteError) throw deleteError;

    const { error: insertError } = await supabase
      .from('playlist')
      .insert(newPlaylist.map((item, index) => ({
        ...item,
        order: index,
      })));

    if (insertError) throw insertError;

    return NextResponse.json({ success: true, count: newPlaylist.length });
  } catch (error: any) {
    console.error('Save failed:', error);
    return NextResponse.json({ error: 'Save failed', details: error.message }, { status: 500 });
  }
}
