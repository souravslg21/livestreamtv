'use client';

import React, { useEffect, useRef, useState } from 'react';
import YouTubePlayer from 'youtube-player';
import { VideoItem, mockPlaylist, supabase } from '@/lib/supabase';

export default function Player() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [currentVideoIndex, setCurrentVideoIndex] = useState(0);
  const [playlist, setPlaylist] = useState<VideoItem[]>(mockPlaylist);
  const [isMuted, setIsMuted] = useState(true);
  const playerRef = useRef<any>(null);

  const getSyncInfo = (items: VideoItem[]) => {
    if (items.length === 0) return { index: 0, startSeconds: 0 };
    
    // Calculate total duration, assuming 5 mins (300s) for items with 0 duration
    const totalDuration = items.reduce((acc, item) => acc + (item.duration || 300), 0);
    const now = Math.floor(Date.now() / 1000);
    const epoch = 1735689600; // Jan 1, 2025 00:00:00 UTC
    const elapsed = (now - epoch) % totalDuration;

    let cumulative = 0;
    for (let i = 0; i < items.length; i++) {
      const itemDuration = items[i].duration || 300;
      if (elapsed < cumulative + itemDuration) {
        return { index: i, startSeconds: Math.floor(elapsed - cumulative) };
      }
      cumulative += itemDuration;
    }
    return { index: 0, startSeconds: 0 };
  };

  useEffect(() => {
    // If supabase is available, we could fetch real data here
    if (supabase) {
      // Future implementation: fetch from supabase
    }

    const { index } = getSyncInfo(playlist);
    setCurrentVideoIndex(index);
  }, []);

  useEffect(() => {
    if (!containerRef.current || playerRef.current) return;

    playerRef.current = YouTubePlayer(containerRef.current, {
      playerVars: {
        autoplay: 1,
        controls: 0,
        modestbranding: 1,
        rel: 0,
        iv_load_policy: 3,
        disablekb: 1,
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
      const { index, startSeconds } = getSyncInfo(playlist);
      const video = playlist[index];
      
      // Load and seek directly
      playerRef.current.loadVideoById(video.youtube_id, startSeconds);
      
      playerRef.current.playVideo();
      playerRef.current.mute();
      
      if (index !== currentVideoIndex) {
        setCurrentVideoIndex(index);
      }
    }
  }, [playlist]);

  useEffect(() => {
    if (playerRef.current && playlist.length > 0) {
      const video = playlist[currentVideoIndex];
      // Simply load the video. Since we track currentVideoIndex, 
      // we don't need to manually check the internal player state with getVideoData
      playerRef.current.loadVideoById(video.youtube_id);
    }
  }, [currentVideoIndex]);

  const handleVideoEnd = () => {
    setCurrentVideoIndex((prev) => (prev + 1) % playlist.length);
  };

  const toggleMute = () => {
    if (playerRef.current) {
      if (isMuted) {
        playerRef.current.unMute();
        setIsMuted(false);
      } else {
        playerRef.current.mute();
        setIsMuted(true);
      }
    }
  };

  return (
    <div className="w-full aspect-video bg-black rounded-2xl overflow-hidden shadow-2xl border border-white/10 relative group">
      {/* Hide YouTube Branding Masks */}
      <div className="absolute top-0 left-0 w-full h-12 bg-black/60 z-10 pointer-events-none" />
      <div className="absolute bottom-0 right-0 w-40 h-20 bg-black/60 z-10 pointer-events-none" />
      
      <div ref={containerRef} className="w-full h-full scale-[1.01]" />
      <div className="absolute top-4 left-4 flex items-center gap-2 pointer-events-none z-20">
        <div className="bg-red-600 text-white text-[10px] font-bold px-2 py-0.5 rounded tracking-wider flex items-center gap-1 shadow-lg">
          <div className="w-1.5 h-1.5 bg-white rounded-full animate-pulse" />
          {playlist[currentVideoIndex]?.is_live ? 'LIVE NOW' : 'BROADCASTING'}
        </div>
        <div className="bg-black/60 backdrop-blur-md text-white text-[10px] font-medium px-2 py-0.5 rounded border border-white/10 uppercase tracking-tight shadow-lg">
          {playlist[currentVideoIndex]?.title || 'Loading...'}
        </div>
      </div>

      {isMuted && (
        <button 
          onClick={toggleMute}
          className="absolute inset-0 flex items-center justify-center bg-black/20 group-hover:bg-black/40 transition-colors z-20"
        >
          <div className="bg-white/10 backdrop-blur-xl border border-white/20 px-6 py-3 rounded-2xl flex items-center gap-3 animate-bounce shadow-2xl">
            <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center">
              <div className="w-4 h-4 bg-white rounded-full animate-ping" />
            </div>
            <span className="text-white font-bold text-sm uppercase tracking-widest">Click to Unmute</span>
          </div>
        </button>
      )}
    </div>
  );
}
