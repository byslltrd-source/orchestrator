'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

export default function Orchestrator() {
  const [task, setTask] = useState('');
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [result, setResult] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
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

      const res = await fetch('/api/orchestrate', {
        method: 'POST',
        body: formData,
      });

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

  return (
    <div className="min-h-screen bg-zinc-950 text-white p-8">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center gap-4 mb-12">
          <div className="text-6xl">🧠</div>
          <div>
            <h1 className="text-6xl font-bold">Orchestrator</h1>
            <p className="text-zinc-400 text-2xl">Your Personal AI Command Center</p>
          </div>
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
              {imagePreview && <img src={imagePreview} className="mt-4 max-h-64 rounded-xl" />}
            </div>

            <Button onClick={runTask} disabled={isLoading} className="w-full py-7 text-lg bg-white text-black">
              {isLoading ? "Thinking..." : "🚀 Run Task"}
            </Button>

            {error && <div className="p-4 bg-red-900/50 text-red-400 rounded-xl">❌ {error}</div>}

            {result && (
              <Card className="bg-zinc-950 border-zinc-700">
                <CardHeader><CardTitle>Result</CardTitle></CardHeader>
                <CardContent>
                  <pre className="whitespace-pre-wrap text-zinc-200 text-[15px] leading-relaxed">{result}</pre>
                </CardContent>
              </Card>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}