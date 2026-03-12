import { NextResponse } from 'next/server';
import ytdl from '@distube/ytdl-core';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const videoId = searchParams.get('v');

  if (!videoId) {
    return NextResponse.json({ error: 'Video ID is required' }, { status: 400 });
  }

  try {
    const info = await ytdl.getInfo(videoId);
    
    // Find HLS format (m3u8)
    const format = ytdl.chooseFormat(info.formats, { quality: 'highest', filter: 'audioandvideo' });
    
    // For live streams, ytdl-core usually provides an hlsManifestUrl
    const hlsUrl = info.formats.find(f => f.isHLS || f.url.includes('m3u8'))?.url;

    if (!hlsUrl) {
      // If not a live stream or HLS not found, try to get a regular URL
      const bestFormat = ytdl.chooseFormat(info.formats, { quality: 'highest' });
      if (bestFormat && bestFormat.url) {
        return NextResponse.redirect(bestFormat.url);
      }
      return NextResponse.json({ error: 'No streamable URL found' }, { status: 404 });
    }

    return NextResponse.redirect(hlsUrl);
  } catch (error: any) {
    console.error('Error fetching YouTube stream:', error);
    return NextResponse.json({ error: 'Failed to fetch stream', details: error.message }, { status: 500 });
  }
}
