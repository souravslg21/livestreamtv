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
  const watchdogRef = useRef<NodeJS.Timeout | null>(null);

  // Fallback interaction handler
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

  // Fetch playlist
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
    const totalDuration = items.reduce((acc, item) => acc + (item.duration || 300), 0);
    const now = Math.floor(Date.now() / 1000);
    const epoch = 1735689600; // Jan 1, 2025
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
      const videoData = await playerRef.current.getVideoData();
      const loadedVideoId = videoData?.video_id;

      if (loadedVideoId !== videoId || forceLoad) {
        setCurrentVideoIndex(index);
        // Reset watchdog when loading a new video
        if (watchdogRef.current) clearTimeout(watchdogRef.current);
        
        await playerRef.current.loadVideoById(videoId, startSeconds);
        await playerRef.current.playVideo().catch(() => {});
        await playerRef.current.unMute().catch(() => {});

        // Watchdog: If video doesn't start playing within 8 seconds, force re-sync
        watchdogRef.current = setTimeout(() => {
          playerRef.current?.getPlayerState().then((state: number) => {
            if (state !== 1 && state !== 3) { // Not Playing and not Buffering
              console.warn('Watchdog triggered: Video stuck. Re-syncing...');
              synchronize(true);
            }
          });
        }, 8000);
      } else {
        const state = await playerRef.current.getPlayerState();
        if (state === 1) { 
          const currentTime = await playerRef.current.getCurrentTime();
          if (Math.abs(currentTime - startSeconds) > 10) {
             await playerRef.current.seekTo(startSeconds, true);
          }
        } else if (state === 0 || state === 2 || state === 5 || state === -1) {
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
    if (!containerRef.current || playerRef.current) return;

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
        enablejsapi: 1,
        origin: typeof window !== 'undefined' ? window.location.origin : undefined
      },
    });

    playerRef.current = player;

    player.on('stateChange', (event: any) => {
      // Clear watchdog if it starts playing
      if (event.data === 1 && watchdogRef.current) {
        clearTimeout(watchdogRef.current);
        watchdogRef.current = null;
      }
      
      if (event.data === 0) { // Ended
        synchronize(true);
      }
    });

    player.on('error', (event: any) => {
      console.error('YouTube Player Error:', event.data);
      // On any error (video blocked, deleted, etc.), try to skip to what SHOULD be playing now
      setTimeout(() => synchronize(true), 2000);
    });

    return () => {
      if (playerRef.current) {
        playerRef.current.destroy();
        playerRef.current = null;
      }
      if (watchdogRef.current) clearTimeout(watchdogRef.current);
    };
  }, []);

  useEffect(() => {
    if (playerRef.current && playlist.length > 0) {
      synchronize(true);
    }
  }, [playlist]);

  useEffect(() => {
    if (playlist.length === 0) return;
    const interval = setInterval(() => synchronize(), 15000);
    return () => clearInterval(interval);
  }, [playlist]);

  return (
    <div className="fixed inset-0 w-screen h-screen bg-black overflow-hidden pointer-events-none">
      <div className="w-full h-full pointer-events-auto relative">
        <div 
          ref={containerRef} 
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[120vw] h-[120vh] scale-[1.25]" 
        />
        <div className="absolute inset-0 z-20 pointer-events-auto cursor-none bg-transparent" />
        
        {/* Extreme Edge Guards */}
        <div className="absolute inset-0 border-[10vw] border-black z-30 pointer-events-none" />
      </div>
      
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-black z-50">
          <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
        </div>
      )}
    </div>
  );
}
