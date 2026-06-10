export default function Home() {
  return (
    <div className="min-h-screen bg-zinc-950 text-white flex items-center justify-center p-8">
      <div className="text-center max-w-2xl">
        <div className="text-8xl mb-8">🧠</div>
        <h1 className="text-7xl font-bold mb-6">Orchestrator</h1>
        <p className="text-3xl text-zinc-400 mb-16">Your Personal AI Command Center</p>
        
        <div className="bg-zinc-900 p-16 rounded-3xl">
          <p className="text-4xl mb-6">✅ The app is live and stable</p>
          <p className="text-xl text-zinc-400">Basic version is working.</p>
          <p className="mt-8 text-lg">We can add user accounts, storage, and subscriptions on top of this stable base.</p>
        </div>
      </div>
    </div>
  );
}