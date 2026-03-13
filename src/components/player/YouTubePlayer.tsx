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
  const reloadTimeoutRef = useRef<NodeJS.Timeout | null>(null);

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
    if (items.length === 0) return { index: 0, startSeconds: 0, videoId: '' };
    
    // Check if current is a live stream
    // For live streams, we don't calculate an offset, we just play
    const now = Math.floor(Date.now() / 1000);
    const epoch = 1735689600; // Jan 1, 2025
    
    // We only use the epoch sync for VODs (duration > 0)
    // For live streams, we just cycle them
    const vods = items.filter(i => (i.duration || 0) > 0);
    if (vods.length === items.length) {
      const totalDuration = items.reduce((acc, item) => acc + (item.duration || 300), 0);
      const elapsed = (now - epoch) % totalDuration;
      let cumulative = 0;
      for (let i = 0; i < items.length; i++) {
        const itemDuration = items[i].duration || 300;
        if (elapsed < cumulative + itemDuration) {
          return { 
            index: i, 
            startSeconds: Math.floor(elapsed - cumulative),
            videoId: items[i].youtube_id,
            isLive: false
          };
        }
        cumulative += itemDuration;
      }
    }

    // Default to simple cycling or just playing if everything is live
    const cycleIndex = Math.floor(now / 3600) % items.length; // Change every hour if all live
    return { 
      index: cycleIndex, 
      startSeconds: 0, 
      videoId: items[cycleIndex].youtube_id,
      isLive: true
    };
  };

  const synchronize = async (forceLoad = false) => {
    if (!playerRef.current || playlist.length === 0 || syncLockRef.current) return;
    
    syncLockRef.current = true;
    const { index, startSeconds, videoId, isLive } = getSyncInfo(playlist);

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
      } else {
        const state = await playerRef.current.getPlayerState();
        if (state !== 1 && state !== 3) { // Not playing or buffering
           await playerRef.current.playVideo().catch(() => {});
        }
      }
    } catch (error) {
      console.error('Sync failed:', error);
    } finally {
      syncLockRef.current = false;
    }
  };

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
        origin: window.location.origin,
        widget_referrer: window.location.origin
      },
    });

    playerRef.current = player;

    player.on('stateChange', (event: any) => {
      if (event.data === 0) synchronize(true); // Ended
      if (event.data === 1 && reloadTimeoutRef.current) {
        clearTimeout(reloadTimeoutRef.current);
        reloadTimeoutRef.current = null;
      }
    });

    player.on('error', (event: any) => {
      console.error('Player error:', event.data);
      // Auto-skip to next moment on error
      setTimeout(() => synchronize(true), 2000);
    });

    // Detect if playback is frozen for too long
    const watchdog = setInterval(async () => {
      if (!playerRef.current) return;
      const state = await playerRef.current.getPlayerState();
      // If stuck in unstarted (-1), paused (2), or cued (5)
      if (state === -1 || state === 2 || state === 5) {
        playerRef.current.playVideo().catch(() => {});
      }
    }, 5000);

    return () => {
      if (playerRef.current) playerRef.current.destroy();
      clearInterval(watchdog);
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
      window.removeEventListener('mousedown', handleAction);
    };
    window.addEventListener('mousedown', handleAction);
    return () => window.removeEventListener('mousedown', handleAction);
  }, []);

  return (
    <div className="fixed inset-0 w-screen h-screen bg-black overflow-hidden flex items-center justify-center">
      {/* 
        THE BLACKBOX CROP:
        We scale the player to 170% to guarantee ALL YouTube UI is outside the viewport.
        Even the "An error occurred" text is usually centered-ish but we mask it with a z-index ring.
      */}
      <div className="relative w-full h-full overflow-hidden flex items-center justify-center scale-[1.7]">
        <div ref={containerRef} className="w-full h-full pointer-events-none" />
      </div>

      {/* Interaction block & Branding protection */}
      <div className="absolute inset-0 z-20 pointer-events-auto cursor-none bg-transparent" />
      
      {/* Perimeter Safety Mask (Deep Black) */}
      <div className="absolute inset-0 pointer-events-none z-30 ring-[20vw] ring-black" />

      {/* Broadcasting Badge */}
      <div className="absolute top-8 left-8 z-40">
        <div className="bg-red-600 px-3 py-1 rounded text-[10px] font-black text-white flex items-center gap-2 animate-pulse shadow-lg">
          <div className="w-1.5 h-1.5 bg-white rounded-full" />
          BROADCASTING LIVE
        </div>
      </div>

      {isLoading && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black">
          <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
        </div>
      )}
    </div>
  );
}
