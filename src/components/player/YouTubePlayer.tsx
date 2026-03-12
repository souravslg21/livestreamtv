'use client';

import React, { useEffect, useRef, useState } from 'react';
import YouTubePlayer from 'youtube-player';
import { VideoItem, mockPlaylist, supabase } from '@/lib/supabase';

export default function Player() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [currentVideoIndex, setCurrentVideoIndex] = useState(0);
  const [playlist, setPlaylist] = useState<VideoItem[]>(mockPlaylist);
  const playerRef = useRef<any>(null);

  useEffect(() => {
    // If supabase is available, we could fetch real data here
    if (supabase) {
      // Future implementation: fetch from supabase
    }
  }, []);

  useEffect(() => {
    if (!containerRef.current || playerRef.current) return;

    playerRef.current = YouTubePlayer(containerRef.current, {
      playerVars: {
        autoplay: 1,
        controls: 1,
        modestbranding: 1,
        rel: 0,
      },
    });

    playerRef.current.on('stateChange', (event: any) => {
      // event.data === 0 means the video ended
      if (event.data === 0) {
        handleVideoEnd();
      }
    });

    return () => {
      if (playerRef.current) {
        playerRef.current.destroy();
      }
    };
  }, []);

  useEffect(() => {
    if (playerRef.current && playlist.length > 0) {
      const video = playlist[currentVideoIndex];
      playerRef.current.loadVideoById(video.youtube_id);
    }
  }, [currentVideoIndex, playlist]);

  const handleVideoEnd = () => {
    setCurrentVideoIndex((prev) => (prev + 1) % playlist.length);
  };

  return (
    <div className="w-full aspect-video bg-black rounded-2xl overflow-hidden shadow-2xl border border-white/10 relative group">
      <div ref={containerRef} className="w-full h-full" />
      <div className="absolute top-4 left-4 flex items-center gap-2 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity">
        <div className="bg-red-600 text-white text-[10px] font-bold px-2 py-0.5 rounded tracking-wider flex items-center gap-1">
          <div className="w-1.5 h-1.5 bg-white rounded-full animate-pulse" />
          LIVE
        </div>
        <div className="bg-black/60 backdrop-blur-md text-white text-[10px] font-medium px-2 py-0.5 rounded border border-white/10 uppercase tracking-tight">
          {playlist[currentVideoIndex]?.title || 'Loading...'}
        </div>
      </div>
    </div>
  );
}
