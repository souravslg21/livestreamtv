import { NextResponse } from 'next/server';
import ytdl from '@distube/ytdl-core';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const videoId = searchParams.get('v');

  if (!videoId) {
    return NextResponse.json({ error: 'Video ID is required' }, { status: 400 });
  }

  try {
    const info = await ytdl.getBasicInfo(videoId);
    return NextResponse.json({
      title: info.videoDetails.title,
      duration: parseInt(info.videoDetails.lengthSeconds),
      thumbnail: info.videoDetails.thumbnails[0]?.url,
    });
  } catch (error: any) {
    console.error('Error fetching video info:', error);
    return NextResponse.json({ error: 'Failed to fetch video info', details: error.message }, { status: 500 });
  }
}
