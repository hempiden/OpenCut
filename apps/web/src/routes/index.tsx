import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/')({ component: Home })

function Home() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-slate-950 text-white p-6 font-sans">
      <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-2xl p-8 shadow-2xl text-center space-y-6">
        <div className="flex justify-center">
          <img src="https://assets.opencut.app/branding/symbol.svg" alt="OpenCut Logo" className="w-20 h-20 animate-pulse" />
        </div>
        <h1 className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-violet-400 via-pink-500 to-red-400 bg-clip-text text-transparent">
          OpenCut Fork
        </h1>
        <p className="text-slate-400 text-sm leading-relaxed">
          Your fork of OpenCut has been successfully deployed to Cloudflare Workers!
        </p>
        <div className="pt-4 border-t border-slate-800/80">
          <p className="text-xs text-slate-500">
            Edit <code>apps/web/src/routes/index.tsx</code> to start building your video editor.
          </p>
        </div>
      </div>
    </div>
  )
}
