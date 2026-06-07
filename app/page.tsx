export default function SalesPage() {
  return (
    <div className="min-h-screen bg-zinc-950 text-white flex items-center justify-center">
      <div className="max-w-4xl mx-auto px-6 py-20 text-center">
        <div className="text-8xl mb-8">🧠</div>
        <h1 className="text-7xl font-bold mb-6">Orchestrator</h1>
        <p className="text-3xl text-zinc-400 mb-16">Your Personal AI Command Center</p>

        <div className="bg-zinc-900 border border-zinc-700 rounded-3xl p-12 mb-16">
          <h2 className="text-3xl font-semibold mb-8">Ready to Use AI Tool</h2>
          <ul className="text-left text-xl space-y-4 max-w-md mx-auto">
            <li>✅ Natural language tasks</li>
            <li>✅ Image analysis support</li>
            <li>✅ Clean professional UI</li>
            <li>✅ Full source code included</li>
            <li>✅ Live deployment</li>
          </ul>
        </div>

        <div className="mb-12">
          <div className="text-6xl font-bold text-emerald-400">$4,999</div>
          <p className="text-xl text-zinc-400">One-time payment - Full ownership</p>
        </div>

        <a 
          href="https://cal.com" 
          target="_blank"
          className="inline-block bg-white text-black font-semibold text-2xl px-16 py-8 rounded-2xl hover:bg-zinc-100"
        >
          Buy Now - Book a Demo
        </a>

        <p className="mt-8 text-zinc-500">Includes full code + setup assistance</p>
      </div>
    </div>
  );
}