'use client';

import React, { useState } from 'react';
import { Plus, Trash2, GripVertical, Save, Trash, Zap, RefreshCw } from 'lucide-react';
import { VideoItem, mockPlaylist } from '@/lib/supabase';

export default function AdminPanel() {
  const [playlist, setPlaylist] = useState<VideoItem[]>([]);
  const [newUrl, setNewUrl] = useState('');
  const [title, setTitle] = useState('');
  const [isLive, setIsLive] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  // Load initial playlist
  React.useEffect(() => {
    fetch('/api/playlist?format=json')
      .then(res => res.json())
      .then(data => {
        setPlaylist(data);
        setIsLoading(false);
      })
      .catch(err => {
        console.error('Failed to load playlist:', err);
        setIsLoading(false);
      });
  }, []);

  const addVideo = async () => {
    if (!newUrl) return;
    
    // Extract YouTube ID
    const match = newUrl.match(/(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
    const videoId = match ? match[1] : newUrl;
    
    if (videoId.length !== 11) {
      alert('Invalid YouTube URL or ID');
      return;
    }

    setIsSaving(true);
    try {
      // Fetch metadata automatically
      const res = await fetch(`/api/video/info?v=${videoId}`);
      const info = await res.json();

      const newItem: VideoItem = {
        id: Math.random().toString(36).substr(2, 9),
        youtube_id: videoId,
        title: title || info.title || `Video ${playlist.length + 1}`,
        duration: info.duration || 0,
        order: playlist.length,
        is_live: isLive,
      };

      setPlaylist([...playlist, newItem]);
      setNewUrl('');
      setTitle('');
      setIsLive(false);
    } catch (error) {
      console.error('Failed to get video info:', error);
      // Still add but with generic name if fetch fails
      const newItem: VideoItem = {
        id: Math.random().toString(36).substr(2, 9),
        youtube_id: videoId,
        title: title || `Video ${playlist.length + 1}`,
        duration: 0,
        order: playlist.length,
        is_live: isLive,
      };
      setPlaylist([...playlist, newItem]);
      setNewUrl('');
      setTitle('');
    } finally {
      setIsSaving(false);
    }
  };

  const refreshTitles = async () => {
    setIsSaving(true);
    const updatedPlaylist = [...playlist];
    
    for (let i = 0; i < updatedPlaylist.length; i++) {
      const video = updatedPlaylist[i];
      // Only refresh if generic or empty
      if (video.title.startsWith('Video ') || !video.title) {
        try {
          const res = await fetch(`/api/video/info?v=${video.youtube_id}`);
          if (res.ok) {
            const info = await res.json();
            if (info.title) {
              updatedPlaylist[i] = { 
                ...video, 
                title: info.title,
                duration: info.duration || video.duration 
              };
            }
          }
        } catch (e) {
          console.error(`Failed to refresh title for ${video.youtube_id}`, e);
        }
      }
    }
    
    setPlaylist(updatedPlaylist);
    setIsSaving(false);
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const res = await fetch('/api/playlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(playlist),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.details || 'Save failed');
      }

      alert('Playlist saved successfully!');
    } catch (error: any) {
      console.error('Save failed:', error);
      alert(`Error saving playlist: ${error.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  const updateTitle = (id: string, newTitle: string) => {
    setPlaylist(playlist.map(item => 
      item.id === id ? { ...item, title: newTitle } : item
    ));
  };

  const removeVideo = (id: string) => {
    setPlaylist(playlist.filter(item => item.id !== id));
  };

  const toggleLive = (id: string) => {
    setPlaylist(playlist.map(item => 
      item.id === id ? { ...item, is_live: !item.is_live } : item
    ));
  };

  if (isLoading) {
    return (
      <div className="w-full max-w-2xl glass rounded-3xl p-8 flex flex-col items-center justify-center min-h-[400px]">
        <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
        <p className="mt-4 text-slate-400 font-medium tracking-widest text-xs uppercase">Loading Playlist...</p>
      </div>
    );
  }

  return (
    <div className="w-full max-w-2xl glass rounded-3xl p-8 flex flex-col gap-8 shadow-2xl">
      <div className="flex flex-col gap-2">
        <h2 className="text-2xl font-outfit font-bold text-slate-100 uppercase tracking-tight">Management Console</h2>
        <p className="text-sm text-slate-500">Curate and synchronize your digital broadcast.</p>
      </div>

      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <input 
            type="text" 
            placeholder="YouTube URL or ID" 
            value={newUrl}
            onChange={(e) => setNewUrl(e.target.value)}
            className="bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-blue-500 transition-colors text-white"
          />
          <input 
            type="text" 
            placeholder="Custom Title (Optional)" 
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-blue-500 transition-colors text-white"
          />
        </div>
        
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2 cursor-pointer group">
            <div className={`w-10 h-6 rounded-full transition-colors relative ${isLive ? 'bg-red-600' : 'bg-slate-700'}`}>
              <input 
                type="checkbox" 
                className="sr-only" 
                checked={isLive}
                onChange={(e) => setIsLive(e.target.checked)}
              />
              <div className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform ${isLive ? 'translate-x-4' : ''}`} />
            </div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 group-hover:text-slate-200 transition-colors">
              Treat as Live Stream
            </span>
          </label>
        </div>

        <button 
          onClick={addVideo}
          disabled={isSaving}
          className="bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 text-white font-bold py-3 rounded-xl flex items-center justify-center gap-2 transition-all active:scale-95"
        >
          {isSaving ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Plus className="w-4 h-4" />}
          Add to Queue
        </button>
      </div>

      <div className="flex flex-col gap-3 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
        {playlist.map((video, index) => (
          <div key={video.id} className="bg-white/5 border border-white/5 rounded-xl p-4 flex items-center justify-between group hover:bg-white/10 transition-all">
            <div className="flex items-center gap-4 flex-1">
              <span className="text-[10px] font-bold text-slate-600 w-4">{index + 1}</span>
              <img 
                src={`https://img.youtube.com/vi/${video.youtube_id}/default.jpg`} 
                alt={video.title} 
                className="w-12 h-9 rounded object-cover shadow-lg"
              />
              <div className="flex flex-col flex-1">
                <div className="flex items-center gap-2">
                  <input 
                    type="text"
                    value={video.title}
                    onChange={(e) => updateTitle(video.id, e.target.value)}
                    className="bg-transparent border-none text-sm font-semibold text-slate-200 focus:outline-none focus:ring-1 focus:ring-blue-500/30 rounded px-1 -ml-1 w-full"
                  />
                  {video.is_live && (
                    <span className="bg-red-600/20 text-red-500 text-[8px] font-black px-1.5 py-0.5 rounded border border-red-500/30 uppercase tracking-tighter shrink-0">
                      LIVE
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-slate-500 font-mono tracking-tighter uppercase">{video.youtube_id}</span>
                  <span className="text-[10px] text-slate-600 font-bold">•</span>
                  <span className="text-[10px] text-slate-500 font-bold">{Math.floor(video.duration / 60)}:{(video.duration % 60).toString().padStart(2, '0')}</span>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button 
                onClick={() => toggleLive(video.id)}
                className={`p-2 rounded-lg transition-colors ${video.is_live ? 'text-red-500' : 'text-slate-600 hover:text-slate-400'}`}
                title={video.is_live ? "Mark as Video" : "Mark as Live"}
              >
                <Zap className={`w-4 h-4 ${video.is_live ? 'fill-red-500' : ''}`} />
              </button>
              <button 
                onClick={() => removeVideo(video.id)}
                className="p-2 text-slate-500 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all font-bold"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="pt-4 border-t border-white/5 flex flex-col gap-4">
        <div className="flex justify-between items-center">
          <p className="text-[10px] text-slate-600 uppercase tracking-widest font-black">
            {playlist.length} Segments Buffered
          </p>
          <div className="flex gap-2">
            <button 
              onClick={refreshTitles}
              disabled={isSaving}
              className="text-slate-500 hover:text-slate-300 text-[10px] font-black uppercase tracking-widest px-4 py-2 rounded-lg flex items-center gap-2 transition-all border border-white/5"
            >
              <RefreshCw className={`w-3 h-3 ${isSaving ? 'animate-spin' : ''}`} />
              Refresh Original Names
            </button>
          </div>
        </div>
        
        <button 
          onClick={handleSave}
          disabled={isSaving}
          className="bg-white/10 hover:bg-white/20 text-blue-400 text-[11px] font-black uppercase tracking-widest w-full py-4 rounded-xl flex items-center justify-center gap-2 transition-all active:scale-95 border border-blue-500/20 shadow-xl shadow-blue-500/5 group"
        >
          {isSaving ? (
            <div className="w-3 h-3 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
          ) : (
            <Save className="w-3 h-3 group-hover:scale-110 transition-transform" />
          )}
          Push Changes
        </button>
      </div>
    </div>
  );
}
