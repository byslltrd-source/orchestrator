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
        <div className="text-center">
          <div className="text-8xl mb-8">🧠</div>
          <h1 className="text-6xl font-bold mb-6">Orchestrator</h1>
          <p className="text-2xl text-zinc-400 mb-12">Your Personal AI Command Center</p>
          
          <button 
            onClick={signIn}
            className="bg-white hover:bg-zinc-100 text-black px-12 py-6 rounded-2xl text-2xl font-semibold"
          >
            Sign in with Google
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-white p-12">
      <div className="max-w-4xl mx-auto">
        <div className="flex justify-between items-center mb-16">
          <h1 className="text-6xl font-bold">Orchestrator</h1>
          <button onClick={signOut} className="bg-red-600 px-8 py-4 rounded-xl">Sign Out</button>
        </div>

        <div className="bg-zinc-900 p-16 rounded-3xl text-center">
          <p className="text-4xl mb-6">✅ Logged in as {user.email}</p>
          <p className="text-xl text-zinc-400">User accounts are now working.</p>
          <p className="mt-8">Next step: Add conversation storage and subscriptions.</p>
        </div>
      </div>
    </div>
  );
}