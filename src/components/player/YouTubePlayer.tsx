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
  const stuckCounterRef = useRef(0);
  const lastTimeRef = useRef(0);

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
        // Using direct load to bypass any internal cues
        await playerRef.current.loadVideoById(videoId, startSeconds);
        await playerRef.current.playVideo().catch(() => {});
        await playerRef.current.unMute().catch(() => {});
      } else {
        const state = await playerRef.current.getPlayerState();
        if (state === 1) { // Playing
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

  // Watchdog: detect stuck state or error screen
  useEffect(() => {
    const watchdog = setInterval(async () => {
      if (!playerRef.current) return;
      
      try {
        const state = await playerRef.current.getPlayerState();
        const currentTime = await playerRef.current.getCurrentTime();
        
        // If state is unstarted (-1), paused (2), cued (5) or ended (0) for too long
        if (state !== 1 || Math.abs(currentTime - lastTimeRef.current) < 0.05) {
          stuckCounterRef.current += 1;
        } else {
          stuckCounterRef.current = 0;
          lastTimeRef.current = currentTime;
        }

        // If stuck for 20 seconds (4 checks), force a hard page reload
        // This is the cleanest way to clear YouTube's internal error states
        if (stuckCounterRef.current >= 4) {
          console.error('Watchdog: Player appears stuck. Performing hard recovery...');
          window.location.reload();
        }
      } catch (e) {
        // Silently handle if player is destroyed mid-check
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
        // Using a proxy-safe origin
        origin: typeof window !== 'undefined' ? window.location.origin : undefined
      },
    });

    playerRef.current = player;

    player.on('stateChange', (event: any) => {
      if (event.data === 0) { // Video ended
        synchronize(true);
      }
    });

    player.on('error', (event: any) => {
      console.error('YouTube Player Error Code:', event.data);
      // Skip ahead or reload on error
      setTimeout(() => synchronize(true), 2000);
    });

    // Global interaction unmuter
    const handleInteraction = () => {
      if (playerRef.current) {
        playerRef.current.unMute().catch(() => {});
        playerRef.current.playVideo().catch(() => {});
      }
      window.removeEventListener('mousedown', handleInteraction);
    };
    window.addEventListener('mousedown', handleInteraction);

    return () => {
      if (playerRef.current) {
        playerRef.current.destroy();
        playerRef.current = null;
      }
      window.removeEventListener('mousedown', handleInteraction);
    };
  }, []);

  // Sync when playlist is updated
  useEffect(() => {
    if (playerRef.current && playlist.length > 0) {
      setTimeout(() => synchronize(true), 1000);
    }
  }, [playlist]);

  return (
    <main className="fixed inset-0 w-screen h-screen bg-black overflow-hidden flex items-center justify-center">
      {/* 
        The "Hard Crop" Style:
        Targeting the inner iframe directly with CSS to ensure it SPILLS outside our container.
        This hides all YouTube UI, titles, watermarks, and error messages.
      */}
      <style>{`
        #yt-player-container iframe {
          width: 200vw !important;
          height: 200vh !important;
          position: absolute !important;
          top: 50% !important;
          left: 50% !important;
          transform: translate(-50%, -50%) !important;
          pointer-events: none !important;
        }
      `}</style>

      <div className="relative w-full h-full overflow-hidden flex items-center justify-center">
        <div 
          id="yt-player-container"
          ref={containerRef} 
          className="w-full h-full pointer-events-none"
        />
        
        {/* Completely block interaction so YouTube can't show hover UI */}
        <div className="absolute inset-0 z-20 pointer-events-auto cursor-none bg-transparent" />
        
        {/* Massive perimeter mask to catch any stray UI or error text */}
        <div className="absolute inset-0 pointer-events-none z-30 ring-[15vw] ring-black" />
      </div>

      {isLoading && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black">
          <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
        </div>
      )}
    </main>
  );
}
