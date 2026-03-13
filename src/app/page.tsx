import HLSPlayer from "@/components/player/HLSPlayer";

export default function Home() {
  return (
    <main className="fixed inset-0 w-screen h-screen bg-black overflow-hidden pointer-events-none">
      <div className="w-full h-full pointer-events-auto">
        <HLSPlayer />
      </div>
    </main>
  );
}
