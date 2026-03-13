import { NextResponse } from 'next/server';
import ytdl from '@distube/ytdl-core';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const videoId = searchParams.get('v');

  if (!videoId) {
    return NextResponse.json({ error: 'Video ID is required' }, { status: 400 });
  }

  try {
    // Primary attempt: ytdl-core (provides duration)
    try {
      const info = await ytdl.getBasicInfo(videoId);
      return NextResponse.json({
        title: info.videoDetails.title,
        duration: parseInt(info.videoDetails.lengthSeconds),
        thumbnail: info.videoDetails.thumbnails[0]?.url,
      });
    } catch (ytdlError) {
      console.warn('ytdl-core failed, attempting oEmbed fallback...', ytdlError);
      
      // Fallback: oEmbed (very reliable for title/thumbnail)
      const oEmbedRes = await fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`);
      if (oEmbedRes.ok) {
        const data = await oEmbedRes.json();
        return NextResponse.json({
          title: data.title,
          duration: 0, // oEmbed doesn't provide duration
          thumbnail: data.thumbnail_url,
          source: 'oembed'
        });
      }
      throw ytdlError; // If fallback also fails, throw the original error
    }
  } catch (error: any) {
    console.error('Error fetching video info:', error);
    return NextResponse.json({ error: 'Failed to fetch video info', details: error.message }, { status: 500 });
  }
}
