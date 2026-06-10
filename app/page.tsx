'use client';

import { useState, useEffect } from 'react';

export default function Orchestrator() {
  const [user, setUser] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Fake auth for now (we'll replace with real Supabase later)
  useEffect(() => {
    // Simulate logged in user for testing
    setTimeout(() => {
      setUser({ email: "test@example.com" });
      setIsLoading(false);
    }, 800);
  }, []);

  const signOut = () => {
    setUser(null);
  };

  if (isLoading) {
    return <div className="min-h-screen bg-zinc-950 text-white flex items-center justify-center">Loading...</div>;
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-zinc-950 text-white flex items-center justify-center">
        <div className="text-center">
          <div className="text-8xl mb-8">🧠</div>
          <h1 className="text-6xl font-bold mb-6">Orchestrator</h1>
          <p className="text-2xl text-zinc-400 mb-12">Your Personal AI Command Center</p>
          <button 
            onClick={() => alert("Google Sign In would go here (Supabase setup needed)")}
            className="bg-white text-black px-12 py-6 rounded-2xl text-2xl font-semibold hover:bg-zinc-200"
          >
            Sign in with Google
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-white p-8">
      <div className="max-w-4xl mx-auto">
        <div className="flex justify-between items-center mb-12">
          <h1 className="text-6xl font-bold">Orchestrator</h1>
          <button onClick={signOut} className="bg-red-600 px-8 py-4 rounded-2xl">Sign Out</button>
        </div>

        <div className="bg-zinc-900 p-16 rounded-3xl text-center">
          <p className="text-4xl">✅ Logged in as {user.email}</p>
          <p className="mt-8 text-xl text-zinc-400">User accounts skeleton is ready.</p>
          <p className="mt-12 text-2xl">Next: Add conversation storage + subscriptions</p>
        </div>
      </div>
    </div>
  );
}