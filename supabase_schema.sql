-- Run this SQL in your Supabase SQL Editor to create the necessary table
-- Link: https://supabase.com/dashboard/project/_/editor

CREATE TABLE IF NOT EXISTS playlist (
  id TEXT PRIMARY KEY,
  youtube_id TEXT NOT NULL,
  title TEXT NOT NULL,
  duration INTEGER NOT NULL,
  "order" INTEGER NOT NULL,
  is_live BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Enable Row Level Security
ALTER TABLE playlist ENABLE ROW LEVEL SECURITY;

-- Create policies for public demo (Adjust these for production security!)
-- Allow anyone to read the playlist
CREATE POLICY "Allow public read access" ON playlist
  FOR SELECT USING (true);

-- Allow anyone to insert/update/delete for now (Since we are using 
-- a simple 'Push Changes' from the admin panel)
CREATE POLICY "Allow public insert" ON playlist
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Allow public update" ON playlist
  FOR UPDATE USING (true);

CREATE POLICY "Allow public delete" ON playlist
  FOR DELETE USING (true);
