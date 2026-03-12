import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// Only initialize if URL is a valid web address and not the placeholder
const isValidUrl = (url: string | undefined) => {
  try {
    return url ? (url.startsWith('http://') || url.startsWith('https://')) : false;
  } catch {
    return false;
  }
};

export const supabase = (isValidUrl(supabaseUrl) && supabaseAnonKey) 
  ? createClient(supabaseUrl!, supabaseAnonKey)
  : null;

export interface VideoItem {
  id: string;
  youtube_id: string;
  title: string;
  duration: number; // in seconds
  order: number;
}

// Mock data for initial development if Supabase is not configured
export const mockPlaylist: VideoItem[] = [
  {
    id: '1',
    youtube_id: '9tUh86AWDsw',
    title: 'Ankan X Afrin - Long Distance Love',
    duration: 147,
    order: 0,
  },
  {
    id: '2',
    youtube_id: '-FP2Cmc7zj4',
    title: 'Fakirs - Prithibi Ta Naki',
    duration: 174,
    order: 1,
  },
];
