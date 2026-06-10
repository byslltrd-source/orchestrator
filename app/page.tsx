export default function Home() {
  return (
    <div className="min-h-screen bg-zinc-950 text-white flex items-center justify-center">
      <div className="text-center px-6">
        <div className="text-8xl mb-8">🧠</div>
        <h1 className="text-7xl font-bold mb-6">Orchestrator</h1>
        <p className="text-3xl text-zinc-400 mb-12">Your Personal AI Command Center</p>
        
        <div className="bg-zinc-900 p-16 rounded-3xl max-w-lg mx-auto">
          <p className="text-3xl mb-8">✅ The app is now running</p>
          <p className="text-xl text-zinc-400">Basic version is live and stable.</p>
          <p className="mt-8 text-lg">Next steps: User accounts, storage, subscriptions</p>
        </div>
      </div>
    </div>
  );
}