'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch('/api/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });
    if (res.ok) {
      router.push('/');
      router.refresh();
    } else {
      setError('Incorrect password');
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="bg-zinc-900 rounded-2xl p-8 w-full max-w-sm border border-zinc-800">
        <h1 className="text-xl font-black mb-6 text-zinc-100">Brainminds Orchestrator</h1>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-zinc-100 outline-none focus:border-zinc-500"
            autoFocus
          />
          {error && <p className="text-red-400 text-sm">{error}</p>}
          <button
            type="submit"
            className="bg-zinc-100 text-zinc-900 font-black rounded-xl py-3 hover:bg-white transition-colors"
          >
            Enter
          </button>
        </form>
      </div>
    </div>
  );
}
