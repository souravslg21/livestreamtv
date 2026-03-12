const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const PLAYLIST_DIR = path.join(__dirname, '../playlist');
const OUTPUT_DIR = path.join(__dirname, '../public/live');
const CONCAT_FILE = path.join(__dirname, 'concat.txt');

// Ensure output directory exists
if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

function updateConcatFile() {
    const files = fs.readdirSync(PLAYLIST_DIR)
        .filter(file => file.endsWith('.mp4') || file.endsWith('.mkv') || file.endsWith('.mov'))
        .map(file => `file '${path.join(PLAYLIST_DIR, file).replace(/\\/g, '/')}'`);

    if (files.length === 0) {
        console.error('No video files found in playlist folder.');
        process.exit(1);
    }

    // Write the concat file for FFmpeg
    fs.writeFileSync(CONCAT_FILE, files.join('\n'));
    console.log(`Updated concat.txt with ${files.length} videos.`);
}

function startStreaming() {
    updateConcatFile();

    console.log('Starting FFmpeg streaming process...');

    const ffmpeg = spawn('ffmpeg', [
        '-re',                          // Read input at native frame rate
        '-f', 'concat',                 // Use concat demuxer
        '-safe', '0',                   // Allow any file path
        '-stream_loop', '-1',           // Infinite loop
        '-i', CONCAT_FILE,              // Input from concat file
        '-c:v', 'libx264',              // Video codec: H.264
        '-preset', 'veryfast',          // Speed/quality tradeoff
        '-b:v', '4500k',                // Target bitrate
        '-maxrate', '4500k',            // Cap bitrate
        '-bufsize', '9000k',            // Buffer size
        '-pix_fmt', 'yuv420p',          // Compatibility
        '-g', '60',                     // Keyframe interval (2s for 30fps)
        '-s', '1920x1080',              // Force 1080p
        '-r', '30',                     // Force 30fps
        '-c:a', 'aac',                  // Audio codec: AAC
        '-b:a', '128k',                 // Audio bitrate
        '-ar', '44100',                 // Audio sample rate
        '-f', 'hls',                    // Output format: HLS
        '-hls_time', '4',               // Segment length: 4s
        '-hls_list_size', '10',         // Number of segments in manifest
        '-hls_flags', 'delete_segments', // Cleanup old segments
        '-hls_segment_filename', path.join(OUTPUT_DIR, 'seg%d.ts'),
        path.join(OUTPUT_DIR, 'index.m3u8')
    ]);

    ffmpeg.stdout.on('data', (data) => console.log(`FFmpeg: ${data}`));
    ffmpeg.stderr.on('data', (data) => console.error(`FFmpeg Log: ${data}`));

    ffmpeg.on('close', (code) => {
        console.error(`FFmpeg process exited with code ${code}. Restarting in 5 seconds...`);
        setTimeout(startStreaming, 5000);
    });
}

startStreaming();
