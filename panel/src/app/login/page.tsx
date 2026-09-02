"use client"

import { useState, type FormEvent } from "react"
import { useRouter } from "next/navigation"
import Image from "next/image"
import { Loader2 } from "lucide-react"

export default function LoginPage() {
  const router = useRouter()
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        setError(body?.error ?? "Kullanıcı adı veya şifre yanlış.")
        return
      }
      router.push("/")
      router.refresh()
    } catch {
      setError("Sunucuya bağlanılamadı. Lütfen tekrar deneyin.")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4"
      style={{
        background: "linear-gradient(135deg, #3d0510 0%, #6e0d25 50%, #4a0717 100%)",
      }}
    >
      <div className="relative z-10 w-full max-w-sm">
        {/* Logo + Brand */}
        <div className="flex flex-col items-center mb-8 gap-3">
          <Image
            src="/rudder-helm-transparent.png"
            alt="Rudder Dümen"
            width={84}
            height={84}
            className="object-contain drop-shadow-[0_6px_24px_rgba(0,0,0,0.6)]"
            priority
          />
          <div className="text-center">
            <h1
              className="font-heading text-3xl font-bold uppercase tracking-[0.25em]"
              style={{
                color: "#c8a87c",
                textShadow: "0 2px 10px rgba(0,0,0,0.4)",
              }}
            >
              rudder
            </h1>
            <p className="text-xs mt-1 tracking-[0.15em] uppercase text-white/70 font-medium">
              Server Panel
            </p>
          </div>
        </div>

        {/* Card */}
        <div className="rounded-2xl bg-white p-7 shadow-2xl border border-white/20 space-y-5">
          <div className="mb-1">
            <h2 className="text-base font-bold text-slate-800 font-heading">
              Giriş Yap
            </h2>
            <p className="text-xs text-slate-500 mt-0.5 font-sans">
              Sunucu yönetim paneline erişmek için giriş yapın.
            </p>
          </div>

          {error && (
            <div className="rounded-lg bg-red-50 border border-red-200 px-3.5 py-2.5 text-xs text-red-600 font-medium">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label
                htmlFor="username"
                className="block text-xs font-semibold text-slate-700"
              >
                Kullanıcı Adı
              </label>
              <input
                id="username"
                type="text"
                autoComplete="username"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-slate-50 px-3.5 py-2.5 text-sm text-slate-800 outline-none transition-all focus:border-[#6e0d25] focus:bg-white focus:ring-1 focus:ring-[#6e0d25]"
              />
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="password"
                className="block text-xs font-semibold text-slate-700"
              >
                Şifre
              </label>
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-slate-50 px-3.5 py-2.5 text-sm text-slate-800 outline-none transition-all focus:border-[#6e0d25] focus:bg-white focus:ring-1 focus:ring-[#6e0d25]"
              />
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full flex items-center justify-center gap-2 rounded-lg bg-[#6e0d25] hover:bg-[#86102e] py-3 text-xs font-bold uppercase tracking-wider text-white shadow-md transition-all disabled:opacity-60 mt-2 border border-[#c8a87c]/30"
            >
              {submitting && <Loader2 className="size-4 animate-spin" />}
              Giriş Yap
            </button>
          </form>
        </div>

        {/* Footer */}
        <p className="text-center text-xs mt-6 text-white/40 font-mono">
          Rudder Server Panel &copy; {new Date().getFullYear()}
        </p>
      </div>
    </div>
  )
}