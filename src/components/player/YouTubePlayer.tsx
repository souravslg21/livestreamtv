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
  const [skipCount, setSkipCount] = useState(0);
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
    const elapsed = (now - epoch) % totalDuration;
    
    // Adjusted elapsed handles skipping a video that might be failing
    const adjustedElapsed = (elapsed + (skipCount * 3600)) % totalDuration;
    
    let cumulative = 0;
    for (let i = 0; i < items.length; i++) {
      const itemDuration = items[i].duration || 300;
      if (adjustedElapsed < cumulative + itemDuration) {
        return { 
          videoId: items[i].youtube_id, 
          startSeconds: Math.floor(adjustedElapsed - cumulative)
        };
      }
      cumulative += itemDuration;
    }
    return { videoId: items[0].youtube_id, startSeconds: 0 };
  };

  const synchronize = async (forceLoad = false) => {
    if (!playerRef.current || playlist.length === 0) return;
    
    const { videoId, startSeconds } = getSyncInfo(playlist);

    try {
      const videoData = playerRef.current.getVideoData?.();
      const loadedVideoId = videoData?.video_id;

      if (loadedVideoId !== videoId || forceLoad) {
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
    }
  };

  // YouTube API initialization
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const initPlayer = () => {
      if (!containerRef.current || playerRef.current) return;
      
      playerRef.current = new window.YT.Player(containerRef.current, {
        height: '100%',
        width: '100%',
        playerVars: {
          autoplay: 1,
          controls: 0,
          modestbranding: 1,
          rel: 0,
          iv_load_policy: 3,
          disablekb: 1,
          enablejsapi: 1,
          mute: 0
        },
        events: {
          onReady: () => {
            if (playlist.length > 0) synchronize(true);
          },
          onStateChange: (event: any) => {
            if (event.data === 0) synchronize(true); // Ended
          },
          onError: () => {
            setSkipCount(prev => prev + 1);
            setTimeout(() => synchronize(true), 2000);
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

  // Sync on interaction to bypass audio blocks
  useEffect(() => {
    const handleAction = () => {
      if (playerRef.current) {
        playerRef.current.unMute();
        playerRef.current.playVideo();
      }
    };
    window.addEventListener('mousedown', handleAction);
    return () => window.removeEventListener('mousedown', handleAction);
  }, []);

  return (
    <div className="fixed inset-0 w-screen h-screen bg-black overflow-hidden flex items-center justify-center">
      <div className="relative w-full h-full overflow-hidden flex items-center justify-center scale-[1.25]">
        <div ref={containerRef} className="w-full h-full pointer-events-none" />
      </div>

      {/* Interaction blocker */}
      <div className="absolute inset-0 z-20 pointer-events-auto cursor-none bg-transparent" />
      
      {/* Subtle edge masks */}
      <div className="absolute inset-0 pointer-events-none z-30 ring-[8vw] ring-black/40" />

      {/* Broadcast Info */}
      <div className="absolute top-8 left-8 z-40">
        <div className="bg-red-600 px-3 py-1.5 rounded text-[10px] font-black text-white flex items-center gap-2 shadow-lg">
          <div className="w-1.5 h-1.5 bg-white rounded-full animate-pulse" />
          BROADCASTING LIVE
        </div>
      </div>

      {isLoading && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black">
          <span className="text-white/20 text-xs font-bold uppercase tracking-widest animate-pulse">Initializing Stream...</span>
        </div>
      )}
    </div>
  );
}
