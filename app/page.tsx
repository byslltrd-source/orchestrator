'use client';

import { useState, useEffect } from 'react';
import { createClientComponentClient } from '@supabase/ssr';

export default function Orchestrator() {
  const [user, setUser] = useState<any>(null);
  const supabase = createClientComponentClient();

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
    });
  }, [supabase]);

  const signIn = () => supabase.auth.signInWithOAuth({ provider: 'google' });
  const signOut = () => supabase.auth.signOut();

  if (!user) {
    return (
      <div className="min-h-screen bg-zinc-950 text-white flex items-center justify-center">
        <div className="text-center max-w-md px-6">
          <div className="text-8xl mb-8">🧠</div>
          <h1 className="text-6xl font-bold mb-4">Orchestrator</h1>
          <p className="text-xl text-zinc-400 mb-12">Your Personal AI Command Center</p>
          
          <button 
            onClick={signIn}
            className="w-full bg-white text-black py-6 rounded-2xl text-2xl font-semibold hover:bg-zinc-200 transition"
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
          <div>
            <h1 className="text-6xl font-bold">Orchestrator</h1>
            <p className="text-zinc-400 text-xl">Welcome back, {user.email}</p>
          </div>
          <button 
            onClick={signOut}
            className="bg-red-600 hover:bg-red-700 px-8 py-4 rounded-2xl text-lg"
          >
            Sign Out
          </button>
        </div>

        <div className="bg-zinc-900 p-16 rounded-3xl text-center">
          <p className="text-3xl mb-6">✅ User Authentication is Working!</p>
          <p className="text-xl text-zinc-400">Next step: Add conversation storage</p>
        </div>
      </div>
    </div>
  );
}