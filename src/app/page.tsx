import HLSPlayer from "@/components/player/HLSPlayer";
import { Tv, Radio, MonitorPlay, Zap } from "lucide-react";

export default function Home() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-6 md:p-24 relative overflow-hidden bg-slate-950">
      {/* Abstract Background Orbs */}
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-blue-600/10 blur-[120px] rounded-full" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-purple-600/10 blur-[120px] rounded-full" />

      <div className="z-10 w-full max-w-5xl flex flex-col items-center gap-12">
        <header className="flex flex-col items-center gap-4 text-center">
          <div className="flex items-center gap-2 px-4 py-2 rounded-full border border-white/5 bg-white/5 animate-fade-in">
            <Zap className="w-4 h-4 text-yellow-400 fill-yellow-400" />
            <span className="text-xs font-bold uppercase tracking-[0.2em] text-slate-400">Ultra Low Latency Stream</span>
          </div>
          
          <h1 className="text-5xl md:text-7xl font-outfit font-black tracking-tight text-white">
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-500">SRV CREATION TV</span>
          </h1>
          <p className="max-w-2xl text-slate-400 font-medium md:text-lg leading-relaxed">
            Your premium 24/7 digital broadcasting experience. Seamlessly curated, continuously streaming in 1080p.
          </p>
        </header>

        <div className="w-full relative group p-1 rounded-[2.2rem] bg-gradient-to-b from-white/10 to-transparent">
          <HLSPlayer />
        </div>

        <section className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full">
          {[
            { icon: Tv, title: "FHD Resolution", desc: "Crystal clear high-definition playback." },
            { icon: Radio, title: "Always Live", desc: "Non-stop broadcast, 24 hours a day." },
            { icon: MonitorPlay, title: "Vercel Hosted", desc: "Fast delivery powered by Edge network." },
          ].map((feature, i) => (
            <div key={i} className="glass p-6 rounded-2xl flex flex-col gap-4 group hover:border-slate-700 transition-colors">
              <div className="w-10 h-10 rounded-xl bg-slate-900 flex items-center justify-center border border-white/10 group-hover:scale-110 transition-transform">
                <feature.icon className="w-5 h-5 text-blue-400" />
              </div>
              <div>
                <h3 className="font-bold text-slate-100">{feature.title}</h3>
                <p className="text-sm text-slate-500">{feature.desc}</p>
              </div>
            </div>
          ))}
        </section>

        <footer className="w-full flex justify-between items-center text-slate-600 text-xs font-medium uppercase tracking-widest pt-12 border-t border-white/5">
          <span>&copy; 2026 SrV Creation</span>
          <div className="flex gap-6">
            <a href="/admin" className="hover:text-blue-400 transition-colors cursor-pointer">Admin Access</a>
            <span className="cursor-default">Privacy</span>
          </div>
        </footer>
      </div>
    </main>
  );
}
