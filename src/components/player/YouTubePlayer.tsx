'use client';

import React, { useEffect, useRef, useState } from 'react';
import YouTubePlayer from 'youtube-player';
import { VideoItem, mockPlaylist } from '@/lib/supabase';

export default function Player() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [currentVideoIndex, setCurrentVideoIndex] = useState(0);
  const [playlist, setPlaylist] = useState<VideoItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const playerRef = useRef<any>(null);
  const syncLockRef = useRef(false);
  const errorCountRef = useRef(0);

  // Attempt to unmute and play on interaction (browser policy fallback)
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
    if (items.length === 0) return { index: 0, startSeconds: 0, videoId: '' };
    
    // Fallback duration if missing
    const totalDuration = items.reduce((acc, item) => acc + (item.duration || 300), 0);
    const now = Math.floor(Date.now() / 1000);
    const epoch = 1735689600; // Jan 1, 2025 00:00:00 UTC
    
    // The modulo handles the infinite loop
    const elapsed = (now - epoch) % totalDuration;

    let cumulative = 0;
    for (let i = 0; i < items.length; i++) {
      const itemDuration = items[i].duration || 300;
      if (elapsed < cumulative + itemDuration) {
        const start = Math.max(0, Math.floor(elapsed - cumulative));
        return { 
          index: i, 
          startSeconds: start < itemDuration - 1 ? start : 0,
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
      const state = await playerRef.current.getPlayerState();
      const videoData = await playerRef.current.getVideoData();
      const loadedVideoId = videoData?.video_id;

      if (loadedVideoId !== videoId || forceLoad) {
        setCurrentVideoIndex(index);
        // Using separate arguments for better compatibility with the wrapper
        await playerRef.current.loadVideoById(videoId, startSeconds);
        await playerRef.current.playVideo().catch(() => {});
        await playerRef.current.unMute().catch(() => {});
        errorCountRef.current = 0; // Reset errors on successful load
      } else {
        // Drift check
        if (state === 1) { 
          const currentTime = await playerRef.current.getCurrentTime();
          if (Math.abs(currentTime - startSeconds) > 10) {
             await playerRef.current.seekTo(startSeconds, true);
          }
        } else if (state === 0 || state === 2 || state === 5) {
          await playerRef.current.playVideo().catch(() => {});
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

    // Use standard IFrame API initialization
    const player = YouTubePlayer(containerRef.current, {
      width: '100%',
      height: '100%',
      playerVars: {
        autoplay: 1,
        controls: 0,
        modestbranding: 1,
        rel: 0,
        iv_load_policy: 3,
        disablekb: 1,
        enablejsapi: 1
      },
    });

    playerRef.current = player;

    player.on('stateChange', (event: any) => {
      // 0 = ended
      if (event.data === 0) {
        synchronize(true);
      }
    });

    player.on('error', (event: any) => {
      console.error('YouTube Player Error:', event.data);
      // On persistent error, the epoch synchronization will eventually 
      // move us to the next video in the loop as time progresses.
      // But we can speed it up if several errors occur.
      errorCountRef.current += 1;
      if (errorCountRef.current > 3) {
        console.warn('Too many errors, forcing re-sync...');
        setTimeout(() => synchronize(true), 1000);
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
      setTimeout(() => synchronize(true), 500);
    }
  }, [playlist]);

  // Periodic sync
  useEffect(() => {
    if (playlist.length === 0) return;

    const interval = setInterval(() => {
      synchronize();
    }, 10000); // Check every 10 seconds

    return () => clearInterval(interval);
  }, [playlist]);

  return (
    <div className="fixed inset-0 w-screen h-screen bg-black overflow-hidden pointer-events-none">
      <div className="w-full h-full pointer-events-auto">
        <div className="w-full h-full relative">
          {/* 
            Strategic Crop:
            We scale the player to push the UI elements (branding, title) outside the viewport.
          */}
          <div 
            ref={containerRef} 
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[115vw] h-[115vh] scale-[1.2]" 
          />
          
          {/* Interaction block - prevents YouTube UI from showing */}
          <div className="absolute inset-0 z-20 pointer-events-auto cursor-none bg-transparent" />

          {/* Clean edge masks */}
          <div className="absolute top-0 left-0 w-full h-[10vh] bg-black z-30" />
          <div className="absolute bottom-0 left-0 w-full h-[10vh] bg-black z-30" />
          <div className="absolute top-0 left-0 h-full w-[10vw] bg-black z-30" />
          <div className="absolute top-0 right-0 h-full w-[10vw] bg-black z-30" />
        </div>
      </div>
      
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-black z-50">
          <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
        </div>
      )}
    </div>
  );
}
