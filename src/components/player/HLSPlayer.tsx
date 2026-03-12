'use client';

import React, { useEffect, useRef, useState } from 'react';
import Hls from 'hls.js';
import { Volume2, VolumeX, Maximize2, Activity } from 'lucide-react';

export default function HLSPlayer() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isMuted, setIsMuted] = useState(true);
  const [isPlaying, setIsPlaying] = useState(false);
  const [hasError, setHasError] = useState(false);

  const streamUrl = '/live/index.m3u8';

  useEffect(() => {
    let hls: Hls;

    if (videoRef.current) {
        const video = videoRef.current;

        if (Hls.isSupported()) {
            hls = new Hls({
                enableWorker: true,
                lowLatencyMode: true,
            });
            hls.loadSource(streamUrl);
            hls.attachMedia(video);
            hls.on(Hls.Events.MANIFEST_PARSED, () => {
                video.play().catch(() => {
                    console.log("Autoplay blocked, waiting for user interaction");
                    setIsPlaying(false);
                });
            });

            hls.on(Hls.Events.ERROR, (event, data) => {
                if (data.fatal) {
                    switch (data.type) {
                        case Hls.ErrorTypes.NETWORK_ERROR:
                            console.log("Network error, trying to recover...");
                            hls.startLoad();
                            break;
                        case Hls.ErrorTypes.MEDIA_ERROR:
                            console.log("Media error, trying to recover...");
                            hls.recoverMediaError();
                            break;
                        default:
                            console.error("Fatal error, cannot recover");
                            setHasError(true);
                            hls.destroy();
                            break;
                    }
                }
            });
        }
        else if (video.canPlayType('application/vnd.apple.mpegurl')) {
            video.src = streamUrl;
            video.addEventListener('loadedmetadata', () => {
                video.play().catch(() => setIsPlaying(false));
            });
        }
    }

    return () => {
        if (hls) {
            hls.destroy();
        }
    };
  }, [streamUrl]);

  const toggleMute = () => {
    if (videoRef.current) {
        videoRef.current.muted = !videoRef.current.muted;
        setIsMuted(videoRef.current.muted);
    }
  };

  const toggleFullScreen = () => {
    if (videoRef.current) {
        if (videoRef.current.requestFullscreen) {
            videoRef.current.requestFullscreen();
        }
    }
  };

  return (
    <div className="w-full aspect-video bg-black rounded-3xl overflow-hidden shadow-[0_0_50px_rgba(0,0,0,0.5)] border border-white/5 relative group">
      <video 
        ref={videoRef} 
        className="w-full h-full object-cover"
        muted={isMuted}
        playsInline
        onPlay={() => setIsPlaying(true)}
      />

      {/* Control Overlays */}
      <div className="absolute top-6 left-6 flex items-center gap-3 pointer-events-none z-10">
        <div className="bg-red-600 text-white text-[11px] font-black px-2.5 py-1 rounded flex items-center gap-2 shadow-lg animate-pulse">
          <Activity className="w-3 h-3" />
          24/7 LIVE
        </div>
        <div className="bg-black/40 backdrop-blur-xl border border-white/10 text-white text-[10px] font-bold px-3 py-1 rounded-full uppercase tracking-widest shadow-xl">
          1080p Crystal Stream
        </div>
      </div>

      {/* Interactive Controls */}
      <div className="absolute bottom-6 right-6 flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-all duration-300 transform translate-y-2 group-hover:translate-y-0 z-10">
        <button 
          onClick={toggleMute}
          className="p-3 bg-white/10 backdrop-blur-2xl hover:bg-white/20 rounded-2xl border border-white/10 text-white transition-all active:scale-90"
        >
          {isMuted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
        </button>
        <button 
          onClick={toggleFullScreen}
          className="p-3 bg-white/10 backdrop-blur-2xl hover:bg-white/20 rounded-2xl border border-white/10 text-white transition-all active:scale-90"
        >
          <Maximize2 className="w-5 h-5" />
        </button>
      </div>

      {/* Centered Unmute Prompt */}
      {isMuted && isPlaying && (
        <button 
          onClick={toggleMute}
          className="absolute inset-0 flex items-center justify-center bg-black/20 hover:bg-black/40 transition-colors z-20 group/unmute"
        >
          <div className="bg-white/10 backdrop-blur-3xl border border-white/20 px-8 py-4 rounded-[2rem] flex items-center gap-4 animate-bounce shadow-[0_20px_50px_rgba(0,0,0,0.3)] group-hover/unmute:scale-105 transition-transform">
            <div className="w-10 h-10 bg-blue-600 rounded-full flex items-center justify-center shadow-inner">
                <VolumeX className="w-5 h-5 text-white animate-pulse" />
            </div>
            <div className="flex flex-col items-start leading-tight">
                <span className="text-white font-black text-sm uppercase tracking-tighter">Click to Unmute</span>
                <span className="text-white/40 text-[9px] font-bold uppercase tracking-widest">Experience 1080p Sound</span>
            </div>
          </div>
        </button>
      )}

      {/* Connection Error State */}
      {hasError && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950 gap-4 z-30">
            <div className="w-16 h-16 bg-red-600/20 rounded-full flex items-center justify-center border border-red-600/30">
                <Activity className="w-8 h-8 text-red-600" />
            </div>
            <div className="text-center">
                <h3 className="text-white font-bold">Stream Offline</h3>
                <p className="text-slate-500 text-xs">Waiting for encoder to connect...</p>
            </div>
        </div>
      )}

      {/* Vignette Effect */}
      <div className="absolute inset-0 pointer-events-none bg-gradient-to-t from-black/40 via-transparent to-black/40" />
    </div>
  );
}
