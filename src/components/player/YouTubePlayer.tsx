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
  const syncLockRef = useRef(false);

  // Attempt to unmute on first user interaction as a fallback for 
  // browser autoplay restrictions
  useEffect(() => {
    const handleFirstInteraction = () => {
      if (playerRef.current) {
        playerRef.current.unMute().catch(() => {});
        playerRef.current.playVideo().catch(() => {});
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
    const fetchPlaylist = async () => {
      try {
        const res = await fetch('/api/playlist?format=json');
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) {
          setPlaylist(data);
        } else {
          setPlaylist(mockPlaylist);
        }
      } catch (err) {
        console.error('Failed to load playlist:', err);
        setPlaylist(mockPlaylist);
      } finally {
        setIsLoading(false);
      }
    };
    fetchPlaylist();
  }, []);

  const getSyncInfo = (items: VideoItem[]) => {
    if (items.length === 0) return { index: 0, startSeconds: 0 };
    
    const totalDuration = items.reduce((acc, item) => acc + (item.duration || 300), 0);
    const now = Math.floor(Date.now() / 1000);
    const epoch = 1735689600; // Jan 1, 2025 00:00:00 UTC
    
    // The modulo handles the infinite loop
    const elapsed = (now - epoch) % totalDuration;

    let cumulative = 0;
    for (let i = 0; i < items.length; i++) {
      const itemDuration = items[i].duration || 300;
      if (elapsed < cumulative + itemDuration) {
        return { 
          index: i, 
          startSeconds: Math.floor(elapsed - cumulative),
          videoId: items[i].youtube_id 
        };
      }
      cumulative += itemDuration;
    }
    return { index: 0, startSeconds: 0, videoId: items[0].youtube_id };
  };

  const synchronize = async (forceLoad = false) => {
    if (!playerRef.current || playlist.length === 0 || syncLockRef.current) return;
    
    syncLockRef.current = true;
    const { index, startSeconds, videoId } = getSyncInfo(playlist);

    try {
      const currentPlayerState = await playerRef.current.getPlayerState();
      // Use the internal player's video data to see what's actually loaded
      const videoData = await playerRef.current.getVideoData();
      const loadedVideoId = videoData?.video_id;

      if (loadedVideoId !== videoId || forceLoad) {
        setCurrentVideoIndex(index);
        await playerRef.current.loadVideoById(videoId, startSeconds);
        await playerRef.current.playVideo();
        await playerRef.current.unMute().catch(() => {});
      } else {
        // If it's already playing, just check for drift
        if (currentPlayerState === 1) { // 1 = Playing
          const currentTime = await playerRef.current.getCurrentTime();
          if (Math.abs(currentTime - startSeconds) > 5) {
            await playerRef.current.seekTo(startSeconds, true);
          }
        } else if (currentPlayerState === 0 || currentPlayerState === 2 || currentPlayerState === 5) {
          // If ended, paused, or cued but should be playing, start it
          await playerRef.current.playVideo();
          if (!isMuted) await playerRef.current.unMute().catch(() => {});
        }
      }
    } catch (error) {
      console.error('Sync failed:', error);
    } finally {
      syncLockRef.current = false;
    }
  };

  // Initial setup
  useEffect(() => {
    if (!containerRef.current || playerRef.current) return;

    const player = YouTubePlayer(containerRef.current, {
      playerVars: {
        autoplay: 1,
        controls: 0,
        modestbranding: 1,
        rel: 0,
        iv_load_policy: 3,
        disablekb: 1,
        mute: 1, // Start muted to guarantee autoplay
      },
    });

    playerRef.current = player;

    player.on('stateChange', (event: any) => {
      // event.data === 0 means the video ended
      if (event.data === 0) {
        synchronize(true);
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
      synchronize(true);
    }
  }, [playlist]);

  // Periodic sync to catch up and handle looping
  useEffect(() => {
    if (playlist.length === 0) return;

    const interval = setInterval(() => {
      synchronize();
    }, 10000); // Check every 10 seconds

    return () => clearInterval(interval);
  }, [playlist]);

  return (
    <div className="w-full aspect-video bg-black rounded-2xl overflow-hidden shadow-2xl border border-white/10 relative group">
      <div 
        ref={containerRef} 
        className="w-full h-full scale-[1.12]" 
      />
      
      <div className="absolute inset-0 z-20 pointer-events-auto cursor-default" />

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
