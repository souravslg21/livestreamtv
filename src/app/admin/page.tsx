import AdminPanel from "@/components/admin/AdminPanel";
import { Lock } from "lucide-react";

export default function AdminPage() {
  return (
    <main className="min-h-screen bg-[#020617] flex flex-col items-center justify-center p-6 md:p-24 relative">
      <div className="absolute top-10 flex items-center gap-2 text-slate-600 mb-12">
        <Lock className="w-4 h-4" />
        <span className="text-[10px] font-black uppercase tracking-[0.3em]">Secure Management Console</span>
      </div>

      <AdminPanel />
      
      <a href="/" className="mt-12 text-slate-500 hover:text-slate-300 text-xs font-bold transition-colors">
        &larr; Back to Live Stream
      </a>
    </main>
  );
}
