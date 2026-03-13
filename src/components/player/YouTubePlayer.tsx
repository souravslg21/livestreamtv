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
  const lastTimeRef = useRef(0);
  const stuckCounterRef = useRef(0);

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
    const totalDuration = items.reduce((acc, item) => acc + (item.duration || 300), 0);
    const now = Math.floor(Date.now() / 1000);
    const epoch = 1735689600; // Jan 1, 2025
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
      const videoData = await playerRef.current.getVideoData();
      const loadedVideoId = videoData?.video_id;

      if (loadedVideoId !== videoId || forceLoad) {
        setCurrentVideoIndex(index);
        await playerRef.current.loadVideoById(videoId, startSeconds);
        await playerRef.current.playVideo().catch(() => {});
        await playerRef.current.unMute().catch(() => {});
      } else {
        const state = await playerRef.current.getPlayerState();
        if (state === 1) { // Playing
          const currentTime = await playerRef.current.getCurrentTime();
          // Reset stuck counter if time is moving
          if (Math.abs(currentTime - lastTimeRef.current) > 0.5) {
            stuckCounterRef.current = 0;
            lastTimeRef.current = currentTime;
          }

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

  // Watchdog loop: runs every 5 seconds to ensure we aren't stuck on an error screen
  useEffect(() => {
    const watchdog = setInterval(async () => {
      if (!playerRef.current) return;
      
      try {
        const state = await playerRef.current.getPlayerState();
        const currentTime = await playerRef.current.getCurrentTime();
        
        // If state is not playing, or time hasn't moved, increment stuck counter
        if (state !== 1 || Math.abs(currentTime - lastTimeRef.current) < 0.1) {
          stuckCounterRef.current += 1;
        } else {
          stuckCounterRef.current = 0;
          lastTimeRef.current = currentTime;
        }

        // If stuck for more than 15 seconds (3 checks), force a payload reload
        if (stuckCounterRef.current >= 3) {
          console.warn('Playback watchdog: detected stuck state. Forcing re-sync...');
          stuckCounterRef.current = 0;
          synchronize(true);
        }
      } catch (e) {
        // Ignore errors during watchdog if player is transitioning
      }
    }, 5000);

    return () => clearInterval(watchdog);
  }, [playlist]);

  // Initial Player setup
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
        enablejsapi: 1,
        origin: window.location.origin
      },
    });

    playerRef.current = player;

    player.on('stateChange', (event: any) => {
      if (event.data === 0) { // Ended
        synchronize(true);
      }
    });

    // Re-attempt unmute on first click anywhere
    const unmuteAll = () => {
      if (playerRef.current) {
        playerRef.current.unMute().catch(() => {});
        playerRef.current.playVideo().catch(() => {});
      }
      window.removeEventListener('mousedown', unmuteAll);
    };
    window.addEventListener('mousedown', unmuteAll);

    return () => {
      if (playerRef.current) {
        playerRef.current.destroy();
        playerRef.current = null;
      }
      window.removeEventListener('mousedown', unmuteAll);
    };
  }, []);

  // Sync on playlist load
  useEffect(() => {
    if (playerRef.current && playlist.length > 0) {
      setTimeout(() => synchronize(true), 1000);
    }
  }, [playlist]);

  return (
    <main className="fixed inset-0 w-screen h-screen bg-black overflow-hidden flex items-center justify-center">
      {/* 
        The "Ultimate Crop" Layout:
        We make the player vastly larger than the viewport (150%) 
        and use relative positioning to ensure the center of the video is shown.
        This effectively hides all YouTube overlays, titles, and error messages 
        which are usually positioned at the edges/corners.
      */}
      <div className="relative w-full h-full overflow-hidden flex items-center justify-center">
        <div 
          ref={containerRef} 
          className="w-[160vw] h-[160vh] min-w-[160vh] min-h-[160vw] pointer-events-none"
          style={{ transform: 'scale(1.2)' }}
        />
        
        {/* Interaction blocker - invisible but blocks YouTube's internal controls */}
        <div className="absolute inset-0 z-20 pointer-events-auto cursor-none bg-transparent" />
        
        {/* Safe Area Edge Protectors (Black Bars to catch any bleeding UI) */}
        <div className="absolute inset-0 pointer-events-none z-30 ring-[15vw] ring-black" />
      </div>

      {isLoading && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black">
          <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
        </div>
      )}
    </main>
  );
}
