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
        setError(body?.error ?? "Kullanici adi veya sifre yanlis.")
        return
      }
      router.push("/")
      router.refresh()
    } catch {
      setError("Sunucuya baglanılamadı. Lutfen tekrar deneyin.")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4"
      style={{
        background: "radial-gradient(ellipse at 50% 30%, #2d0a0e 0%, #0f0d0b 60%)",
      }}
    >
      {/* Subtle decorative overlay */}
      <div
        className="pointer-events-none fixed inset-0"
        style={{
          background: "radial-gradient(ellipse at 50% -10%, rgba(201,169,110,0.06) 0%, transparent 60%)",
        }}
      />

      <div className="relative z-10 w-full max-w-sm">
        {/* Logo + Brand */}
        <div className="flex flex-col items-center mb-8 gap-3">
          <Image
            src="/rudder-helm-logo.png"
            alt="Rudder helm"
            width={90}
            height={90}
            className="object-contain drop-shadow-[0_4px_24px_rgba(139,26,42,0.6)]"
            priority
          />
          <div className="text-center">
            <h1
              className="font-heading text-4xl font-bold tracking-[0.25em]"
              style={{ color: "#c9a96e", textShadow: "0 2px 16px rgba(201,169,110,0.3)" }}
            >
              RUDDER
            </h1>
            <p className="text-[12px] mt-1 tracking-[0.1em] uppercase" style={{ color: "#4a3a2a" }}>
              Server Panel
            </p>
          </div>
        </div>

        {/* Card */}
        <div
          className="rounded-xl p-6 space-y-5"
          style={{
            background: "#16110d",
            border: "1px solid rgba(201,169,110,0.15)",
            boxShadow: "0 8px 40px rgba(0,0,0,0.5), inset 0 1px 0 rgba(201,169,110,0.06)",
          }}
        >
          <div className="mb-1">
            <h2 className="text-[15px] font-semibold" style={{ color: "#f0e6d0" }}>Giris Yap</h2>
            <p className="text-[12px] mt-0.5" style={{ color: "#4a3a2a" }}>
              Panele erisim icin giris yapin.
            </p>
          </div>

          {error && (
            <div
              className="rounded-lg px-3.5 py-2.5 text-[12px]"
              style={{ background: "rgba(139,26,42,0.15)", border: "1px solid rgba(139,26,42,0.3)", color: "#f0a0a0" }}
            >
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label
                htmlFor="username"
                className="block text-[12px] font-medium"
                style={{ color: "#7a6a55" }}
              >
                Kullanici Adi
              </label>
              <input
                id="username"
                type="text"
                autoComplete="username"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full rounded-lg px-3 py-2.5 text-[13px] outline-none transition-all"
                style={{
                  background: "#100d0a",
                  border: "1px solid rgba(201,169,110,0.15)",
                  color: "#f0e6d0",
                }}
                onFocus={e => (e.currentTarget.style.borderColor = "rgba(201,169,110,0.45)")}
                onBlur={e => (e.currentTarget.style.borderColor = "rgba(201,169,110,0.15)")}
              />
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="password"
                className="block text-[12px] font-medium"
                style={{ color: "#7a6a55" }}
              >
                Sifre
              </label>
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-lg px-3 py-2.5 text-[13px] outline-none transition-all"
                style={{
                  background: "#100d0a",
                  border: "1px solid rgba(201,169,110,0.15)",
                  color: "#f0e6d0",
                }}
                onFocus={e => (e.currentTarget.style.borderColor = "rgba(201,169,110,0.45)")}
                onBlur={e => (e.currentTarget.style.borderColor = "rgba(201,169,110,0.15)")}
              />
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full flex items-center justify-center gap-2 rounded-lg py-2.5 text-[13px] font-bold tracking-wider transition-all disabled:opacity-60 mt-2"
              style={{
                background: "linear-gradient(135deg, #5a0a12 0%, #8b1a2a 50%, #6a0e18 100%)",
                border: "1px solid rgba(201,169,110,0.2)",
                color: "#f0e6d0",
                boxShadow: "0 2px 16px rgba(139,26,42,0.35)",
              }}
            >
              {submitting && <Loader2 className="size-4 animate-spin" />}
              Giris Yap
            </button>
          </form>
        </div>

        {/* Footer */}
        <p className="text-center text-[11px] mt-5" style={{ color: "#2a2018" }}>
          Rudder Server Panel &copy; {new Date().getFullYear()}
        </p>
      </div>
    </div>
  )
}
