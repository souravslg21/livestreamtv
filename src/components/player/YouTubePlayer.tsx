'use client';

import React, { useEffect, useRef, useState } from 'react';
import YouTubePlayer from 'youtube-player';
import { VideoItem, mockPlaylist } from '@/lib/supabase';

export default function Player() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [playlist, setPlaylist] = useState<VideoItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const playerRef = useRef<any>(null);
  const syncLockRef = useRef(false);
  const skipCountRef = useRef(0);
  const lastSyncTimeRef = useRef(0);

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
        console.error('Playlist fetch error:', err);
        setPlaylist(mockPlaylist);
      } finally {
        setIsLoading(false);
      }
    };
    fetchPlaylist();
  }, []);

  const getSyncInfo = (items: VideoItem[]) => {
    if (items.length === 0) return { videoId: '', startSeconds: 0, isLive: true };
    
    const now = Math.floor(Date.now() / 1000);
    const epoch = 1735689600; // Jan 1, 2025
    
    // Check if we have VODs (duration > 0)
    const vods = items.filter(i => (i.duration || 0) > 0);
    
    if (vods.length > 0) {
      // VOD rotation
      const totalDuration = items.reduce((acc, item) => acc + (item.duration || 300), 0);
      const elapsed = (now - epoch) % totalDuration;
      let cumulative = 0;
      for (let i = 0; i < items.length; i++) {
        const itemDuration = items[i].duration || 300;
        if (elapsed < cumulative + itemDuration) {
          // If skipCount is high, we simulate being later in time to skip this video
          const adjustedElapsed = (elapsed + (skipCountRef.current * 3600)) % totalDuration;
          // Re-calculate based on adjusted elapsed if needed
          return { 
            videoId: items[i].youtube_id, 
            startSeconds: Math.floor(elapsed - cumulative),
            isLive: false 
          };
        }
        cumulative += itemDuration;
      }
    }

    // Live Stream Rotation fallback
    // If multiple live streams, we rotate them if one is failing
    const index = (Math.floor(now / 3600) + skipCountRef.current) % items.length;
    return { 
      videoId: items[index].youtube_id, 
      startSeconds: 0, 
      isLive: true 
    };
  };

  const synchronize = async (forceLoad = false) => {
    if (!playerRef.current || playlist.length === 0 || syncLockRef.current) return;
    
    syncLockRef.current = true;
    const { videoId, startSeconds, isLive } = getSyncInfo(playlist);

    try {
      const videoData = await playerRef.current.getVideoData();
      const loadedVideoId = videoData?.video_id;

      if (loadedVideoId !== videoId || forceLoad) {
        if (isLive) {
          await playerRef.current.loadVideoById(videoId);
        } else {
          await playerRef.current.loadVideoById(videoId, startSeconds);
        }
        await playerRef.current.playVideo().catch(() => {});
        await playerRef.current.unMute().catch(() => {});
        lastSyncTimeRef.current = Date.now();
      } else {
        const state = await playerRef.current.getPlayerState();
        if (state !== 1 && state !== 3) {
          await playerRef.current.playVideo().catch(() => {});
        }
      }
    } catch (error) {
      console.error('Sync failed:', error);
    } finally {
      syncLockRef.current = false;
    }
  };

  // Watchdog: detect stuck state OR persistent unstarted state
  useEffect(() => {
    const watchdog = setInterval(async () => {
      if (!playerRef.current) return;
      try {
        const state = await playerRef.current.getPlayerState();
        const timeSinceLastSync = Date.now() - lastSyncTimeRef.current;

        // If video is stuck in buffering, unstarted, or cued for more than 15 seconds
        if ((state === -1 || state === 3 || state === 5) && timeSinceLastSync > 15000) {
          console.warn('Playback PANIC: Video stuck. Skipping to next channel...');
          skipCountRef.current += 1; // Increment global skip counter
          synchronize(true);
        }
      } catch (e) {}
    }, 5000);

    return () => clearInterval(watchdog);
  }, [playlist]);

  // Initial Player setup
  useEffect(() => {
    if (!containerRef.current) return;

    const player = YouTubePlayer(containerRef.current, {
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
    });

    playerRef.current = player;

    player.on('stateChange', (event: any) => {
      if (event.data === 0) synchronize(true); // Ended
    });

    player.on('error', (event: any) => {
      console.error('YouTube Player Error:', event.data);
      // Immediate panic skip on error
      skipCountRef.current += 1;
      setTimeout(() => synchronize(true), 1000);
    });

    return () => {
      if (playerRef.current) playerRef.current.destroy();
    };
  }, []);

  useEffect(() => {
    if (playlist.length > 0) synchronize(true);
  }, [playlist]);

  // Handle interaction for unmuting
  useEffect(() => {
    const handleAction = () => {
      if (playerRef.current) {
        playerRef.current.unMute().catch(() => {});
        playerRef.current.playVideo().catch(() => {});
      }
    };
    window.addEventListener('mousedown', handleAction);
    return () => window.removeEventListener('mousedown', handleAction);
  }, []);

  return (
    <div className="fixed inset-0 w-screen h-screen bg-black overflow-hidden flex items-center justify-center">
      {/* 
        HYPER-ZOOM (250%):
        We zoom in drastically to pull the center of the video forward.
        This forces ALL edge-based labels, UI, and even the "An error occurred" 
        text (if it's not perfectly centered) out of the visible viewport.
      */}
      <div className="relative w-full h-full overflow-hidden flex items-center justify-center scale-[2.5]">
        <div ref={containerRef} className="w-full h-full pointer-events-none" />
      </div>

      {/* Interaction & Protection Masks */}
      <div className="absolute inset-0 z-20 pointer-events-auto cursor-none bg-transparent" />
      <div className="absolute inset-0 pointer-events-none z-30 ring-[25vw] ring-black" />

      {/* Broadcasting Badge */}
      <div className="absolute top-8 left-8 z-40">
        <div className="bg-red-600 px-3 py-1.5 rounded-full text-[10px] font-black text-white flex items-center gap-2 animate-pulse border border-white/10 shadow-2xl">
          <div className="w-2 h-2 bg-white rounded-full" />
          BROADCASTING LIVE
        </div>
      </div>

      {isLoading && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black">
          <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
        </div>
      )}
    </div>
  );
}
