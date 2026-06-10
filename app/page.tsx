export default function Home() {
  return (
    <div className="min-h-screen bg-zinc-950 text-white flex items-center justify-center">
      <div className="text-center">
        <div className="text-8xl mb-8">🧠</div>
        <h1 className="text-6xl font-bold mb-6">Orchestrator</h1>
        <p className="text-2xl text-zinc-400 mb-12">Your Personal AI Command Center</p>
        
        <div className="bg-zinc-900 p-12 rounded-3xl inline-block">
          <p className="text-3xl mb-6">✅ Basic Version Running</p>
          <p className="text-xl text-zinc-400">User accounts + storage coming next</p>
        </div>
      </div>
    </div>
  );
}