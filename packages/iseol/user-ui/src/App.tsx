import { Suspense } from 'react';
import { RouterProvider } from 'react-router';
import { router } from './app/routes';

export default function App() {
  return <Suspense fallback={<div className="flex min-h-screen items-center justify-center bg-amber-50 p-6 text-sm font-bold text-slate-600">화면을 불러오는 중…</div>}><RouterProvider router={router} /></Suspense>;
}
