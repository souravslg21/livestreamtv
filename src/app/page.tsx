import YouTubePlayer from "@/components/player/YouTubePlayer";
import { Tv, Radio, MonitorPlay, Zap } from "lucide-react";

export default function Home() {
  return (
    <main className="fixed inset-0 w-screen h-screen bg-black overflow-hidden pointer-events-none">
      <div className="w-full h-full pointer-events-auto">
        <YouTubePlayer />
      </div>
    </main>
  );
}
