'use client';

import React, { useEffect, useRef, useState } from 'react';
import Hls from 'hls.js';
import { Volume2, VolumeX, Maximize2, Activity, RefreshCw } from 'lucide-react';
import { VideoItem, mockPlaylist } from '@/lib/supabase';

export default function HLSPlayer() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [currentVideoIndex, setCurrentVideoIndex] = useState(0);
  const [playlist, setPlaylist] = useState<VideoItem[]>([]);
  const [isMuted, setIsMuted] = useState(true);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const hlsRef = useRef<Hls | null>(null);
  const syncLockRef = useRef(false);

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
    if (!videoRef.current || playlist.length === 0 || syncLockRef.current) return;
    
    syncLockRef.current = true;
    const { index, startSeconds, videoId } = getSyncInfo(playlist);

    try {
      const currentVideo = playlist[currentVideoIndex];
      const shouldLoad = forceLoad || !isPlaying || currentVideoIndex !== index;

      if (shouldLoad) {
        setCurrentVideoIndex(index);
        const streamUrl = `/api/stream?v=${videoId}`;
        setHasError(false);

        if (Hls.isSupported()) {
          if (hlsRef.current) hlsRef.current.destroy();
          const hls = new Hls({
            enableWorker: true,
            lowLatencyMode: true,
            backBufferLength: 0,
          });
          hlsRef.current = hls;
          hls.loadSource(streamUrl);
          hls.attachMedia(videoRef.current);
          hls.on(Hls.Events.MANIFEST_PARSED, () => {
            if (videoRef.current) {
                videoRef.current.currentTime = startSeconds;
                videoRef.current.play().catch(() => setIsPlaying(false));
            }
          });
          hls.on(Hls.Events.ERROR, (event, data) => {
            if (data.fatal) {
               console.error('HLS Fatal Error:', data.type);
               setTimeout(() => synchronize(true), 3000);
            }
          });
        } else if (videoRef.current.canPlayType('application/vnd.apple.mpegurl')) {
          videoRef.current.src = streamUrl;
          videoRef.current.currentTime = startSeconds;
          videoRef.current.play().catch(() => setIsPlaying(false));
        }
      } else {
        // Drift check
        const currentTime = videoRef.current.currentTime;
        if (Math.abs(currentTime - startSeconds) > 8) {
          videoRef.current.currentTime = startSeconds;
        }
      }
    } catch (error) {
      console.error('Sync failed:', error);
    } finally {
      syncLockRef.current = false;
    }
  };

  // Periodic sync and end detection
  useEffect(() => {
    if (playlist.length === 0) return;
    const interval = setInterval(() => synchronize(), 10000);
    
    const video = videoRef.current;
    const handleEnded = () => synchronize(true);
    if (video) video.addEventListener('ended', handleEnded);

    return () => {
      clearInterval(interval);
      if (video) video.removeEventListener('ended', handleEnded);
    };
  }, [playlist, currentVideoIndex]);

  // Initial sync when playlist arrives
  useEffect(() => {
    if (playlist.length > 0) {
      synchronize(true);
    }
  }, [playlist]);

  const toggleMute = () => {
    if (videoRef.current) {
      videoRef.current.muted = !videoRef.current.muted;
      setIsMuted(videoRef.current.muted);
      if (!videoRef.current.muted) videoRef.current.play().catch(() => {});
    }
  };

  return (
    <div className="fixed inset-0 w-screen h-screen bg-black overflow-hidden flex items-center justify-center">
      <video 
        ref={videoRef} 
        className="w-full h-full object-cover"
        muted={isMuted}
        playsInline
        onPlay={() => setIsPlaying(true)}
      />

      {/* Extreme Edge Guards (Black Bars) */}
      <div className="absolute inset-0 pointer-events-none z-30 ring-[10vw] ring-black/20" />

      {/* Professional Status Overlay */}
      <div className="absolute top-8 left-8 flex items-center gap-4 pointer-events-none z-40">
        <div className="bg-red-600/90 text-white text-[10px] font-black px-3 py-1.5 rounded-full flex items-center gap-2 shadow-2xl backdrop-blur-md border border-white/10 animate-pulse">
          <Activity className="w-3 h-3" />
          BROADCASTING LIVE
        </div>
      </div>

      {/* Hidden Control Interaction Block */}
      <div className="absolute inset-0 z-20 pointer-events-auto cursor-none bg-transparent" onClick={toggleMute} />

      {/* Centered Unmute Interaction Prompt (Only if muted and browser blocks autoplay) */}
      {isMuted && (
        <button 
          onClick={toggleMute}
          className="absolute inset-0 flex items-center justify-center bg-black/10 hover:bg-black/30 transition-all z-50 group"
        >
          <div className="bg-white/5 backdrop-blur-3xl border border-white/10 px-10 py-5 rounded-[3rem] flex items-center gap-6 animate-bounce shadow-2xl transition-transform group-hover:scale-110">
            <div className="w-14 h-14 bg-blue-600 rounded-full flex items-center justify-center shadow-lg border border-white/20">
                <VolumeX className="w-6 h-6 text-white" />
            </div>
            <div className="flex flex-col items-start leading-tight">
                <span className="text-white font-black text-lg uppercase tracking-tighter">Click to Unmute</span>
                <span className="text-white/40 text-[10px] font-bold uppercase tracking-[0.2em]">Cinematic Audio is Waiting</span>
            </div>
          </div>
        </button>
      )}

      {/* Global Persistence Watchdog Indicator (Hidden) */}
      <div className="absolute bottom-4 right-4 opacity-5">
         <RefreshCw className="w-4 h-4 text-white animate-spin" />
      </div>

      {isLoading && (
        <div className="absolute inset-0 z-[60] flex items-center justify-center bg-black">
          <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin shadow-2xl" />
        </div>
      )}
    </div>
  );
}
