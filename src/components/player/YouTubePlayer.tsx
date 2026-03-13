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

  // Attempt to unmute and play on interaction
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
    
    const elapsed = (now - epoch) % totalDuration;

    let cumulative = 0;
    for (let i = 0; i < items.length; i++) {
      const itemDuration = items[i].duration || 300;
      if (elapsed < cumulative + itemDuration) {
        // Ensure startSeconds is not exactly at the end to prevent immediate loop issues
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

      // Force load if the video ID doesn't match or if specifically requested
      if (loadedVideoId !== videoId || forceLoad) {
        setCurrentVideoIndex(index);
        // loadVideoById throws if it fails to start
        await playerRef.current.loadVideoById({
          videoId: videoId,
          startSeconds: startSeconds,
        });
        await playerRef.current.playVideo();
        await playerRef.current.unMute().catch(() => {});
      } else {
        // Drift check: only if playing
        if (state === 1) { 
          const currentTime = await playerRef.current.getCurrentTime();
          if (Math.abs(currentTime - startSeconds) > 8) {
             await playerRef.current.seekTo(startSeconds, true);
          }
        } else if (state === 0 || state === 2 || state === 5) {
          // Play if ended (0), paused (2), or cued (5)
          await playerRef.current.playVideo();
        }
      }
    } catch (error) {
      console.error('Sync failed:', error);
      // If a major error occurs, try a full reload in 5 seconds
      setTimeout(() => synchronize(true), 5000);
    } finally {
      syncLockRef.current = false;
    }
  };

  // Initial setup
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
        origin: window.location.origin
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
      // event.data: 2 (invalid param), 5 (HTML5 error), 100 (not found), 101/150 (not allowed)
      // On error, skip to next likely valid state
      setTimeout(() => synchronize(true), 3000);
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

  // Periodic sync
  useEffect(() => {
    if (playlist.length === 0) return;

    const interval = setInterval(() => {
      synchronize();
    }, 15000);

    return () => clearInterval(interval);
  }, [playlist, currentVideoIndex]);

  return (
    <div className="w-full h-full bg-black relative overflow-hidden">
      {/* 
        Ultra-Scale Crop:
        We scale push the branding and UI elements entirely outside the viewport.
      */}
      <div 
        ref={containerRef} 
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[110vw] h-[110vh] scale-[1.15]" 
      />
      
      {/* Interaction block - prevents YouTube UI from showing */}
      <div className="absolute inset-0 z-20 pointer-events-auto cursor-none" />

      {/* Decorative masks to ensure clean edges */}
      <div className="absolute top-0 left-0 w-full h-[5vh] bg-black z-10" />
      <div className="absolute bottom-0 left-0 w-full h-[5vh] bg-black z-10" />
    </div>
  );
}
