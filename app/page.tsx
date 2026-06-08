'use client';

import { useState, useEffect } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

export default function Orchestrator() {
  const [task, setTask] = useState('');
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [result, setResult] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [user, setUser] = useState<any>(null);

  const supabase = createClientComponentClient();

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
    });
  }, [supabase]);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      const reader = new FileReader();
      reader.onload = (e) => setImagePreview(e.target?.result as string);
      reader.readAsDataURL(file);
    }
  };

  const runTask = async () => {
    if (!task.trim()) {
      setError("Please enter a task");
      return;
    }

    setIsLoading(true);
    setError('');
    setResult('');

    try {
      const formData = new FormData();
      formData.append('task', task);
      if (selectedFile) formData.append('image', selectedFile);

      const res = await fetch('/api/orchestrate', { method: 'POST', body: formData });
      const data = await res.json();

      if (res.ok) {
        setResult(data.result);
      } else {
        setError(data.error || 'Something went wrong');
      }
    } catch (err) {
      setError('Could not connect to server');
    } finally {
      setIsLoading(false);
    }
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
  };

  // Login Screen
  if (!user) {
    return (
      <div className="min-h-screen bg-zinc-950 text-white flex items-center justify-center p-8">
        <Card className="bg-zinc-900 border-zinc-700 w-full max-w-md">
          <CardHeader>
            <CardTitle className="text-3xl text-center">Orchestrator</CardTitle>
            <p className="text-center text-zinc-400 mt-2">Sign in to continue</p>
          </CardHeader>
          <CardContent className="pt-8">
            <Button 
              onClick={() => supabase.auth.signInWithOAuth({ provider: 'google' })}
              className="w-full py-7 text-lg"
            >
              Sign in with Google
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Main App (Logged in)
  return (
    <div className="min-h-screen bg-zinc-950 text-white p-8">
      <div className="max-w-4xl mx-auto">
        <div className="flex justify-between items-center mb-12">
          <div>
            <h1 className="text-5xl font-bold">Orchestrator</h1>
            <p className="text-zinc-400">Welcome back, {user.email}</p>
          </div>
          <Button onClick={signOut} variant="outline">Sign Out</Button>
        </div>

        <Card className="bg-zinc-900 border-zinc-700 shadow-2xl">
          <CardHeader>
            <CardTitle>What do you want me to do?</CardTitle>
          </CardHeader>
          <CardContent className="space-y-8 pt-6">
            <Textarea
              value={task}
              onChange={(e) => setTask(e.target.value)}
              placeholder="Describe your task..."
              className="min-h-[120px] bg-zinc-950 border-zinc-700 text-white text-lg"
            />

            <div>
              <label className="block text-sm text-zinc-400 mb-3">Upload Image (Vision enabled)</label>
              <input type="file" accept="image/*" onChange={handleImageUpload} className="block w-full text-sm text-zinc-400" />
              {imagePreview && <img src={imagePreview} className="mt-4 max-h-64 rounded-xl border border-zinc-700" />}
            </div>

            <Button onClick={runTask} disabled={isLoading} className="w-full py-7 text-lg bg-white text-black">
              {isLoading ? "Thinking..." : "🚀 Run Task"}
            </Button>

            {error && <div className="p-4 bg-red-900/50 text-red-400 rounded-xl">❌ {error}</div>}
            {result && <pre className="bg-zinc-950 p-6 rounded-xl text-zinc-200 whitespace-pre-wrap">{result}</pre>}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}