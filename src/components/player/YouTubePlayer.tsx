'use client';

import React, { useEffect, useRef, useState } from 'react';
import { VideoItem, mockPlaylist } from '@/lib/supabase';

declare global {
  interface Window {
    onYouTubeIframeAPIReady: () => void;
    YT: any;
  }
}

export default function Player() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [playlist, setPlaylist] = useState<VideoItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLive, setIsLive] = useState(false);
  const playerRef = useRef<any>(null);
  const [skipCount, setSkipCount] = useState(0);
  const [isActuallyPlaying, setIsActuallyPlaying] = useState(false);
  
  const lastSyncTimeRef = useRef(0);
  const syncLockRef = useRef(false);

  // Load playlist and re-fetch every 30s to keep it fresh
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
        console.error('Playlist error:', err);
        setPlaylist(mockPlaylist);
      } finally {
        setIsLoading(false);
      }
    };
    fetchPlaylist();
    const interval = setInterval(fetchPlaylist, 30000);
    return () => clearInterval(interval);
  }, []);

  const getSyncInfo = (items: VideoItem[]) => {
    if (items.length === 0) return { videoId: '', startSeconds: 0, isLive: true };
    const now = Math.floor(Date.now() / 1000);
    const epoch = 1735689600; // Jan 1, 2025
    
    // Check for VODs
    const vods = items.filter(i => (i.duration || 0) > 0);
    if (vods.length > 0) {
      const totalDuration = items.reduce((acc, item) => acc + (item.duration || 300), 0);
      const elapsed = (now - epoch) % totalDuration;
      let cumulative = 0;
      
      // Simple offset logic: use skipCount to jump to the "next" logical video
      // Each skip adds an hour of "elapsed" time to find a different video
      const adjustedElapsed = (elapsed + (skipCount * 3600)) % totalDuration;
      
      for (let i = 0; i < items.length; i++) {
        const itemDuration = items[i].duration || 300;
        if (adjustedElapsed < cumulative + itemDuration) {
          return { 
            videoId: items[i].youtube_id, 
            startSeconds: Math.floor(adjustedElapsed - cumulative),
            isLive: false 
          };
        }
        cumulative += itemDuration;
      }
    }

    // Live Stream fallback
    const index = (Math.floor(now / 3600) + skipCount) % items.length;
    return { videoId: items[index].youtube_id, startSeconds: 0, isLive: true };
  };

  const synchronize = async (forceLoad = false) => {
    if (!playerRef.current?.loadVideoById || playlist.length === 0 || syncLockRef.current) return;
    
    syncLockRef.current = true;
    const { videoId, startSeconds, isLive: liveStatus } = getSyncInfo(playlist);
    setIsLive(liveStatus);

    try {
      const videoData = playerRef.current.getVideoData?.();
      const loadedVideoId = videoData?.video_id;

      if (loadedVideoId !== videoId || forceLoad) {
        setIsActuallyPlaying(false);
        if (liveStatus) {
          playerRef.current.loadVideoById(videoId);
        } else {
          playerRef.current.loadVideoById(videoId, startSeconds);
        }
        playerRef.current.playVideo();
        playerRef.current.mute(); // Start muted to guarantee start
        lastSyncTimeRef.current = Date.now();
      } else {
        const state = playerRef.current.getPlayerState();
        if (state !== 1 && state !== 3) {
          playerRef.current.playVideo();
        }
      }
    } catch (error) {
      console.error('Sync failed:', error);
    } finally {
      syncLockRef.current = false;
    }
  };

  // YouTube API Script Loading
  useEffect(() => {
    if (typeof window === 'undefined') return;
    
    const tag = document.createElement('script');
    tag.src = "https://www.youtube.com/iframe_api";
    const firstScriptTag = document.getElementsByTagName('script')[0];
    firstScriptTag.parentNode?.insertBefore(tag, firstScriptTag);

    window.onYouTubeIframeAPIReady = () => {
      if (!containerRef.current) return;
      
      const player = new window.YT.Player(containerRef.current, {
        playerVars: {
          autoplay: 1,
          controls: 0,
          modestbranding: 1,
          rel: 0,
          iv_load_policy: 3,
          disablekb: 1,
          enablejsapi: 1,
          origin: window.location.origin
        },
        events: {
          onReady: (event: any) => {
            playerRef.current = event.target;
            if (playlist.length > 0) synchronize(true);
          },
          onStateChange: (event: any) => {
            // state 1 = Playing
            if (event.data === 1) {
              setIsActuallyPlaying(true);
              lastSyncTimeRef.current = Date.now();
            }
            // state 0 = Ended
            if (event.data === 0) {
              synchronize(true);
            }
          },
          onError: (event: any) => {
            console.error('YT Error:', event.data);
            setSkipCount(prev => prev + 1);
            setTimeout(() => synchronize(true), 1000);
          }
        }
      });
    };

    return () => {
      if (playerRef.current) playerRef.current.destroy();
    };
  }, [playlist]);

  // Watchdog: detect stuck state (error screen / permanent buffering)
  useEffect(() => {
    const watchdog = setInterval(() => {
      if (!playerRef.current?.getPlayerState) return;
      
      const state = playerRef.current.getPlayerState();
      const timeSinceSync = Date.now() - lastSyncTimeRef.current;

      // If video hasn't REACHED 'playing' state within 6 seconds of a load attempt
      if (!isActuallyPlaying && timeSinceSync > 6000) {
        console.warn('Playback Watchdog: Video failed to start. Skipping...');
        setSkipCount(prev => prev + 1);
        synchronize(true);
      }

      // If it's playing but drift occurs (only for VODs)
      if (isActuallyPlaying && !isLive && timeSinceSync > 20000) {
        synchronize(); // Subtle sync
      }
    }, 4000);

    return () => clearInterval(watchdog);
  }, [playlist, isActuallyPlaying, isLive, skipCount]);

  // Global interaction unmuter
  useEffect(() => {
    const unmute = () => {
      if (playerRef.current) {
        playerRef.current.unMute();
        playerRef.current.setVolume(100);
        playerRef.current.playVideo();
      }
    };
    window.addEventListener('mousedown', unmute);
    window.addEventListener('touchstart', unmute);
    return () => {
      window.removeEventListener('mousedown', unmute);
      window.removeEventListener('touchstart', unmute);
    };
  }, []);

  return (
    <div className="fixed inset-0 w-screen h-screen bg-black overflow-hidden flex items-center justify-center">
      {/* 
        HARD SHIELD ZOOM (3x):
        Drastically zooms the player to push all YouTube error text and UI edges 
        completely out of the viewport. This makes even a 'crash' look clean.
      */}
      <div className="relative w-full h-full overflow-hidden flex items-center justify-center" 
           style={{ transform: 'scale(3)', width: '100vw', height: '100vh' }}>
        <div ref={containerRef} className="w-full h-full pointer-events-none" />
      </div>

      {/* Interaction block - invisible but blocks YouTube's internal titles/hover */}
      <div className="absolute inset-0 z-20 pointer-events-auto cursor-none bg-transparent" />

      {/* Blackout Overlay - Stays until video is CONFIRMED playing */}
      <div className={`absolute inset-0 z-[25] bg-black transition-opacity duration-1000 ${isActuallyPlaying ? 'opacity-0' : 'opacity-100'}`} />

      {/* Perimeter Safe Guard - Double-layer black ring */}
      <div className="absolute inset-0 pointer-events-none z-30 ring-[20vw] ring-black" />

      {/* Broadcast Info */}
      {!isLoading && (
        <div className="absolute top-8 left-8 z-40 transition-opacity duration-500 opacity-80">
          <div className="bg-red-600 px-3 py-1.5 rounded-full text-[10px] font-bold text-white flex items-center gap-2 border border-white/20 shadow-xl">
            <div className={`w-2 h-2 bg-white rounded-full ${isActuallyPlaying ? 'animate-pulse' : ''}`} />
            LIVE TRANSMISSION
          </div>
        </div>
      )}

      {isLoading && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black">
          <div className="w-8 h-8 border-2 border-white/20 border-t-white rounded-full animate-spin" />
        </div>
      )}
    </div>
  );
}
