'use client';

import React, { useState } from 'react';
import { Plus, Trash2, GripVertical, Save, Trash } from 'lucide-react';
import { VideoItem, mockPlaylist } from '@/lib/supabase';

export default function AdminPanel() {
  const [playlist, setPlaylist] = useState<VideoItem[]>(mockPlaylist);
  const [newUrl, setNewUrl] = useState('');
  const [title, setTitle] = useState('');

  const addVideo = () => {
    if (!newUrl) return;
    
    // Extract YouTube ID
    const match = newUrl.match(/(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
    const videoId = match ? match[1] : newUrl;
    
    if (videoId.length !== 11) {
      alert('Invalid YouTube URL or ID');
      return;
    }

    const newItem: VideoItem = {
      id: Math.random().toString(36).substr(2, 9),
      youtube_id: videoId,
      title: title || `Video ${playlist.length + 1}`,
      duration: 0,
      order: playlist.length,
    };

    setPlaylist([...playlist, newItem]);
    setNewUrl('');
    setTitle('');
  };

  const removeVideo = (id: string) => {
    setPlaylist(playlist.filter(item => item.id !== id));
  };

  return (
    <div className="w-full max-w-2xl glass rounded-3xl p-8 flex flex-col gap-8 shadow-2xl">
      <div className="flex flex-col gap-2">
        <h2 className="text-2xl font-outfit font-bold text-slate-100">Playlist Manager</h2>
        <p className="text-sm text-slate-500">Manage your 24/7 YouTube broadcast sources.</p>
      </div>

      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <input 
            type="text" 
            placeholder="YouTube URL or ID" 
            value={newUrl}
            onChange={(e) => setNewUrl(e.target.value)}
            className="bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-blue-500 transition-colors"
          />
          <input 
            type="text" 
            placeholder="Custom Title (Optional)" 
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-blue-500 transition-colors"
          />
        </div>
        <button 
          onClick={addVideo}
          className="bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 rounded-xl flex items-center justify-center gap-2 transition-all active:scale-95"
        >
          <Plus className="w-4 h-4" /> Add to Playlist
        </button>
      </div>

      <div className="flex flex-col gap-3">
        {playlist.map((video, index) => (
          <div key={video.id} className="bg-white/5 border border-white/5 rounded-xl p-4 flex items-center justify-between group hover:bg-white/10 transition-all">
            <div className="flex items-center gap-4">
              <span className="text-xs font-bold text-slate-600 w-4">{index + 1}</span>
              <img 
                src={`https://img.youtube.com/vi/${video.youtube_id}/default.jpg`} 
                alt={video.title} 
                className="w-12 h-9 rounded object-cover"
              />
              <div className="flex flex-col">
                <span className="text-sm font-semibold text-slate-200 line-clamp-1">{video.title}</span>
                <span className="text-[10px] text-slate-500 font-mono tracking-tighter uppercase">{video.youtube_id}</span>
              </div>
            </div>
            <button 
              onClick={() => removeVideo(video.id)}
              className="p-2 text-slate-500 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>

      <div className="pt-4 border-t border-white/5 flex justify-between items-center">
        <p className="text-[10px] text-slate-600 uppercase tracking-widest font-bold">
          {playlist.length} Videos in queue
        </p>
        <button className="text-blue-400 text-xs font-bold flex items-center gap-1 hover:text-white transition-colors">
          <Save className="w-3 h-3" /> Save Changes
        </button>
      </div>
    </div>
  );
}
