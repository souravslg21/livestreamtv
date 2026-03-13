'use client';

import React, { useEffect, useRef, useState } from 'react';
import YouTubePlayer from 'youtube-player';
import { VideoItem, mockPlaylist, supabase } from '@/lib/supabase';

export default function Player() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [currentVideoIndex, setCurrentVideoIndex] = useState(0);
  const [playlist, setPlaylist] = useState<VideoItem[]>([]);
  const [isMuted, setIsMuted] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const playerRef = useRef<any>(null);

  // Attempt to unmute on first user interaction as a fallback for 
  // browser autoplay restrictions
  useEffect(() => {
    const handleFirstInteraction = () => {
      if (playerRef.current) {
        playerRef.current.unMute().catch(() => {});
      }
      window.removeEventListener('click', handleFirstInteraction);
      window.removeEventListener('touchstart', handleFirstInteraction);
    };
    window.addEventListener('click', handleFirstInteraction);
    window.addEventListener('touchstart', handleFirstInteraction);
    return () => {
      window.removeEventListener('click', handleFirstInteraction);
      window.removeEventListener('touchstart', handleFirstInteraction);
    };
  }, []);

  // Load playlist on mount
  useEffect(() => {
    fetch('/api/playlist?format=json')
      .then(res => res.json())
      .then(data => {
        setPlaylist(data);
        setIsLoading(false);
      })
      .catch(err => {
        console.error('Failed to load playlist:', err);
        setPlaylist(mockPlaylist); // Fallback to mock on error
        setIsLoading(false);
      });
  }, []);

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

  // Synchronize player with the "universal" wall-clock time
  const synchronize = async (forceSeek = false) => {
    if (!playerRef.current || playlist.length === 0) return;

    const { index, startSeconds } = getSyncInfo(playlist);
    const video = playlist[index];

    try {
      // Check what's currently playing to avoid unnecessary resets
      if (index !== currentVideoIndex || forceSeek) {
        setCurrentVideoIndex(index);
        await playerRef.current.loadVideoById(video.youtube_id, startSeconds);
        await playerRef.current.playVideo();
        await playerRef.current.unMute().catch(() => {});
      } else {
        // Just check for drift if we are already on the right video
        const currentTime = await playerRef.current.getCurrentTime();
        if (Math.abs(currentTime - startSeconds) > 5) {
          await playerRef.current.seekTo(startSeconds, true);
        }
      }
    } catch (error) {
      console.error('Sync failed:', error);
    }
  };

  // Initial setup
  useEffect(() => {
    if (!containerRef.current || playerRef.current) return;

    // Initialize player
    const player = YouTubePlayer(containerRef.current, {
      playerVars: {
        autoplay: 1,
        controls: 0,
        modestbranding: 1,
        rel: 0,
        iv_load_policy: 3,
        disablekb: 1,
      },
    });

    playerRef.current = player;

    player.on('stateChange', (event: any) => {
      // event.data === 0 means the video ended
      if (event.data === 0) {
        handleVideoEnd();
      }
    });

    return () => {
      if (playerRef.current) {
        playerRef.current.destroy();
        playerRef.current = null;
      }
    };
  }, []);

  // Handle playlist updates or initial load
  useEffect(() => {
    if (playerRef.current && playlist.length > 0) {
      // Small delay to ensure player internal state is ready
      const timeout = setTimeout(() => synchronize(true), 500);
      return () => clearTimeout(timeout);
    }
  }, [playlist]);

  // Periodic sync to catch up if window was inactive or drift occurred
  useEffect(() => {
    if (playlist.length === 0) return;

    const interval = setInterval(() => {
      synchronize();
    }, 15000); // Every 15 seconds

    return () => clearInterval(interval);
  }, [playlist, currentVideoIndex]);

  const handleVideoEnd = () => {
    // Small delay to let the player state settle
    setTimeout(() => synchronize(true), 100);
  };

  return (
    <div className="w-full aspect-video bg-black rounded-2xl overflow-hidden shadow-2xl border border-white/10 relative group">
      {/* 
        Interaction Guard & Scale Crop Logic:
        1. Scale the player by 1.15x to push corner branding outside the bounds.
        2. Use a transparent overlay (z-20) to block YouTube's hover UI.
      */}
      <div 
        ref={containerRef} 
        className="w-full h-full scale-[1.12]" 
      />
      
      {/* Interaction block - prevents YouTube UI from showing on hover/click */}
      <div className="absolute inset-0 z-20 pointer-events-auto cursor-default" />

      {/* Aesthetic Masks to catch any stray border elements */}
      <div className="absolute top-0 left-0 w-full h-16 bg-gradient-to-b from-black/80 to-transparent z-10 pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-full h-16 bg-gradient-to-t from-black/80 to-transparent z-10 pointer-events-none" />
      
      <div className="absolute top-4 left-4 flex items-center gap-2 pointer-events-none z-30">
        <div className="bg-red-600 text-white text-[10px] font-bold px-2 py-0.5 rounded tracking-wider flex items-center gap-1 shadow-lg border border-white/10">
          <div className="w-1.5 h-1.5 bg-white rounded-full animate-pulse" />
          {playlist[currentVideoIndex]?.is_live ? 'LIVE NOW' : 'BROADCASTING'}
        </div>
        <div className="bg-black/60 backdrop-blur-md text-white text-[10px] font-medium px-2 py-0.5 rounded border border-white/10 uppercase tracking-tight shadow-md">
          {playlist[currentVideoIndex]?.title || 'Loading...'}
        </div>
      </div>
    </div>
  );
}
