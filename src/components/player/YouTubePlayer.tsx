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
  const playerRef = useRef<any>(null);
  const [isActuallyPlaying, setIsActuallyPlaying] = useState(false);
  
  // High-Speed Recovery State
  const skipOffsetRef = useRef(0);
  const lastSyncTimeRef = useRef(0);
  const blockedVideosRef = useRef<Set<string>>(new Set());
  const syncLockRef = useRef(false);

  // Load playlist
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
  }, []);

  const getSyncInfo = (items: VideoItem[]) => {
    if (items.length === 0) return { videoId: '', startSeconds: 0 };
    const now = Math.floor(Date.now() / 1000);
    const epoch = 1735689600; // Jan 1, 2025
    
    const totalDuration = items.reduce((acc, item) => acc + (item.duration || 300), 0);
    let elapsed = (now - epoch) % totalDuration;
    
    // Recovery: Add skipOffset to elapsed to bypass restricted content
    // Each skipOffset represents skipping a roughly 5-minute segment
    elapsed = (elapsed + (skipOffsetRef.current * 300)) % totalDuration;
    
    let cumulative = 0;
    for (let i = 0; i < items.length; i++) {
      const itemDuration = items[i].duration || 300;
      if (elapsed < cumulative + itemDuration) {
        const videoId = items[i].youtube_id;
        
        // If this specific video is known to be blocked, recursively find the next
        if (blockedVideosRef.current.has(videoId)) {
          skipOffsetRef.current += 1;
          return getSyncInfo(items);
        }

        return { 
          videoId, 
          startSeconds: Math.floor(elapsed - cumulative)
        };
      }
      cumulative += itemDuration;
    }
    return { videoId: items[0].youtube_id, startSeconds: 0 };
  };

  const synchronize = async (forceLoad = false) => {
    if (!playerRef.current?.loadVideoById || playlist.length === 0 || syncLockRef.current) return;
    
    syncLockRef.current = true;
    const { videoId, startSeconds } = getSyncInfo(playlist);

    try {
      const videoData = playerRef.current.getVideoData?.();
      const loadedVideoId = videoData?.video_id;

      if (loadedVideoId !== videoId || forceLoad) {
        setIsActuallyPlaying(false);
        playerRef.current.loadVideoById(videoId, startSeconds);
        playerRef.current.playVideo();
        playerRef.current.unMute();
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

    const initPlayer = () => {
      if (!containerRef.current || playerRef.current) return;
      
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
            if (event.data === 1) {
              setIsActuallyPlaying(true);
              lastSyncTimeRef.current = Date.now();
            }
            if (event.data === 0) synchronize(true); // Ended
          },
          onError: (event: any) => {
            const data = playerRef.current?.getVideoData?.();
            if (data?.video_id) {
              console.warn(`Video ${data.video_id} is restricted. Blacklisting...`);
              blockedVideosRef.current.add(data.video_id);
            }
            skipOffsetRef.current += 1;
            setTimeout(() => synchronize(true), 500);
          }
        }
      });
    };

    if (window.YT && window.YT.Player) {
      initPlayer();
    } else {
      const tag = document.createElement('script');
      tag.src = "https://www.youtube.com/iframe_api";
      const firstScriptTag = document.getElementsByTagName('script')[0];
      firstScriptTag.parentNode?.insertBefore(tag, firstScriptTag);
      window.onYouTubeIframeAPIReady = initPlayer;
    }

    return () => {
      if (playerRef.current) {
        playerRef.current.destroy();
        playerRef.current = null;
      }
    };
  }, [playlist]);

  // Watchdog: Detect "Video unavailable" overlays that don't trigger onError
  useEffect(() => {
    const watchdog = setInterval(() => {
      if (!playerRef.current?.getPlayerState) return;
      
      const state = playerRef.current.getPlayerState();
      const timeSinceSync = Date.now() - lastSyncTimeRef.current;

      // If video hasn't reached 'playing' (1) or 'buffering' (3) within 5 seconds
      // OR if it's stuck in 'unstarted' (-1) despite a load attempt
      if (!isActuallyPlaying && state !== 3 && timeSinceSync > 5000) {
        console.warn('Watchdog detected stuck player. Attempting skip...');
        const data = playerRef.current?.getVideoData?.();
        if (data?.video_id) {
            blockedVideosRef.current.add(data.video_id);
        }
        skipOffsetRef.current += 1;
        synchronize(true);
      }
    }, 3000);

    return () => clearInterval(watchdog);
  }, [playlist, isActuallyPlaying]);

  // Global interaction unmuter
  useEffect(() => {
    const unmute = () => {
      if (playerRef.current) {
        playerRef.current.unMute();
        playerRef.current.playVideo();
      }
    };
    window.addEventListener('mousedown', unmute);
    return () => window.removeEventListener('mousedown', unmute);
  }, []);

  return (
    <div className="fixed inset-0 w-screen h-screen bg-black overflow-hidden flex items-center justify-center">
      {/* 
        Strategic Scale (1.1):
        Zoomed in just enough to hide watermarks while preserving 
        the maximum possible video area.
      */}
      <div className="relative w-full h-full overflow-hidden flex items-center justify-center scale-[1.1]">
        <div ref={containerRef} className="w-full h-full pointer-events-none" />
      </div>

      <div className="absolute inset-0 z-20 pointer-events-auto cursor-none bg-transparent" />
      <div className="absolute inset-0 pointer-events-none z-30 ring-[5vw] ring-black/20" />

      {/* Broadcasting Badge */}
      <div className="absolute top-8 left-8 z-40">
        <div className="bg-red-600 px-3 py-1.5 rounded-full text-[10px] font-black text-white flex items-center gap-2 animate-pulse border border-white/10 shadow-2xl">
          <div className="w-2 h-2 bg-white rounded-full" />
          BROADCASTING LIVE
        </div>
      </div>

      {(isLoading || !isActuallyPlaying) && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black">
          <div className="w-8 h-8 border-2 border-white/20 border-t-white rounded-full animate-spin" />
        </div>
      )}
    </div>
  );
}
