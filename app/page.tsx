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
          <h1 className="text-6xl font-bold mb-4">Orchestrator</h1>
          <p className="text-xl mb-8">Your Personal AI Command Center</p>
          <button 
            onClick={signIn}
            className="bg-white text-black px-8 py-4 rounded-xl text-xl font-medium hover:bg-zinc-200"
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
          <h1 className="text-5xl font-bold">Orchestrator</h1>
          <button onClick={signOut} className="bg-red-600 px-6 py-3 rounded-xl">Sign Out</button>
        </div>
        <div className="bg-zinc-900 p-12 rounded-3xl text-center">
          <p className="text-2xl">Welcome back, {user.email}!</p>
          <p className="mt-8 text-zinc-400">User accounts are now working.</p>
          <p className="mt-4">Next: We'll add storage and subscriptions.</p>
        </div>
      </div>
    </div>
  );
}