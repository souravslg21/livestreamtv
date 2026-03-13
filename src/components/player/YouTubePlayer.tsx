'use client';

import React, { useEffect, useRef, useState } from 'react';
import { VideoItem, mockPlaylist } from '@/lib/supabase';

declare global {
  interface Window {
    onYouTubeIframeAPIReady: () => void;
    YT: any;
  }
}

type PlayerStatus = 'LOADING_PLAYLIST' | 'LOADING_API' | 'INITIALIZING_PLAYER' | 'SYNCING' | 'PLAYING' | 'ERROR';

export default function Player() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [playlist, setPlaylist] = useState<VideoItem[]>([]);
  const [status, setStatus] = useState<PlayerStatus>('LOADING_PLAYLIST');
  const playerRef = useRef<any>(null);
  const [isActuallyPlaying, setIsActuallyPlaying] = useState(false);
  
  // High-Speed Recovery State
  const skipOffsetRef = useRef(0);
  const lastSyncTimeRef = useRef(0);
  const blockedVideosRef = useRef<Set<string>>(new Set());
  const syncLockRef = useRef(false);
  const hasEverStartedRef = useRef(false);

  // Load playlist once
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
        setStatus(prev => prev === 'LOADING_PLAYLIST' ? 'LOADING_API' : prev);
      } catch (err) {
        console.error('Playlist error:', err);
        setPlaylist(mockPlaylist);
        setStatus(prev => prev === 'LOADING_PLAYLIST' ? 'LOADING_API' : prev);
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
    elapsed = (elapsed + (skipOffsetRef.current * 300)) % totalDuration;
    
    let cumulative = 0;
    for (let i = 0; i < items.length; i++) {
      const itemDuration = items[i].duration || 300;
      if (elapsed < cumulative + itemDuration) {
        const videoId = items[i].youtube_id;
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
        // Only show full loading if we haven't started yet or it's a hard force
        if (!hasEverStartedRef.current) setStatus('SYNCING');
        
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

  // YouTube API Script Loading (One-time)
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const createPlayer = () => {
      if (!containerRef.current || playerRef.current) return;
      
      setStatus('INITIALIZING_PLAYER');
      const player = new window.YT.Player(containerRef.current, {
        playerVars: {
          autoplay: 1,
          mute: 1, // Required for guaranteed browser autoplay
          controls: 0,
          modestbranding: 1,
          rel: 0,
          iv_load_policy: 3,
          disablekb: 1,
          enablejsapi: 1,
          origin: window.location.origin,
          widget_referrer: window.location.origin
        },
        events: {
          onReady: (event: any) => {
            playerRef.current = event.target;
            // Immediate sync attempt if playlist is ready
            if (playlist.length > 0) synchronize(true);
            else setStatus('SYNCING'); // Wait for playlist
          },
          onStateChange: (event: any) => {
            if (event.data === 1) { // Playing
              setStatus('PLAYING');
              setIsActuallyPlaying(true);
              hasEverStartedRef.current = true;
              lastSyncTimeRef.current = Date.now();
            }
            if (event.data === 0) { // Video Ended
              console.log('Video ended, forcing next segment...');
              skipOffsetRef.current += 1; // Advance to ensure we don't reload the same
              synchronize(true);
            }
          },
          onError: (event: any) => {
            const data = playerRef.current?.getVideoData?.();
            if (data?.video_id) {
              blockedVideosRef.current.add(data.video_id);
            }
            skipOffsetRef.current += 1;
            setTimeout(() => synchronize(true), 1000);
          }
        }
      });
    };

    if (window.YT && window.YT.Player) {
      createPlayer();
    } else {
      const tag = document.createElement('script');
      tag.src = "https://www.youtube.com/iframe_api";
      const firstScriptTag = document.getElementsByTagName('script')[0];
      firstScriptTag.parentNode?.insertBefore(tag, firstScriptTag);
      window.onYouTubeIframeAPIReady = createPlayer;
    }

    return () => {
      // Don't destroy on every re-render, only on full unmount
    };
  }, []);

  // Sync when playlist arrives
  useEffect(() => {
    if (playlist.length > 0 && playerRef.current) {
        synchronize(true);
    }
  }, [playlist]);

  // Watchdog: Detect stuck player
  useEffect(() => {
    const watchdog = setInterval(() => {
      if (!playerRef.current?.getPlayerState) return;
      
      const state = playerRef.current.getPlayerState();
      const timeSinceSync = Date.now() - lastSyncTimeRef.current;

      // Skip stuck or restricted videos (12s threshold)
      if (status !== 'PLAYING' && state !== 3 && timeSinceSync > 12000) {
        console.warn('Watchdog skip triggered');
        const data = playerRef.current?.getVideoData?.();
        if (data?.video_id) blockedVideosRef.current.add(data.video_id);
        skipOffsetRef.current += 1;
        synchronize(true);
      }
    }, 5000);

    return () => clearInterval(watchdog);
  }, [playlist, status]);

  const handleInteraction = () => {
    if (playerRef.current) {
      try {
        playerRef.current.unMute();
        playerRef.current.setVolume(100);
        playerRef.current.playVideo();
        // If we are already playing but just muted, help the UI catch up
        const state = playerRef.current.getPlayerState();
        if (state === 1) {
          setStatus('PLAYING');
          setIsActuallyPlaying(true);
        }
      } catch (e) {
        console.warn('Interaction sync failed', e);
      }
    }
  };

  useEffect(() => {
    window.addEventListener('mousedown', handleInteraction);
    return () => window.removeEventListener('mousedown', handleInteraction);
  }, []);

  const getLoadingMessage = () => {
    switch (status) {
      case 'LOADING_PLAYLIST': return 'Syncing Broadcast Queue...';
      case 'LOADING_API': return 'Connecting to Signal Layer...';
      case 'INITIALIZING_PLAYER': return 'Calibrating Visuals...';
      case 'SYNCING': return 'Stabilizing Stream...';
      default: return 'Establishing Connection...';
    }
  };

  return (
    <div className="fixed inset-0 w-screen h-screen bg-black overflow-hidden flex items-center justify-center">
      <div className="relative w-full h-full overflow-hidden flex items-center justify-center scale-[1.1]">
        <div ref={containerRef} className="w-full h-full pointer-events-none" />
      </div>

      <div className="absolute inset-0 z-20 pointer-events-auto cursor-none bg-transparent" onClick={handleInteraction} />
      <div className="absolute inset-0 pointer-events-none z-30 ring-[5vw] ring-black/10 transition-opacity duration-1000" />

      {/* Broadcasting Badge */}
      <div className="absolute top-8 left-8 z-40">
        <div className="bg-red-600 px-3 py-1.5 rounded-full text-[10px] font-black text-white flex items-center gap-2 animate-pulse border border-white/10 shadow-2xl">
          <div className="w-2 h-2 bg-white rounded-full" />
          BROADCASTING LIVE
        </div>
      </div>

      {status !== 'PLAYING' && (
        <div 
          className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-black transition-all duration-700"
          onClick={handleInteraction}
        >
          <div className="w-12 h-12 border-2 border-white/10 border-t-white rounded-full animate-spin mb-6" />
          <div className="flex flex-col items-center gap-2">
            <span className="text-white/60 text-[10px] font-black uppercase tracking-[0.4em] animate-pulse">
                {getLoadingMessage()}
            </span>
            <span className="text-white/20 text-[8px] font-bold uppercase tracking-widest mt-4">
                Tap to jump start broadcast
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
