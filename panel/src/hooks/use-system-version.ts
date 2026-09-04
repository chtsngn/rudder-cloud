"use client"

import { useState, useEffect, useCallback } from "react"

export interface VersionData {
  currentVersion: string
  latestVersion: string
  hasUpdate: boolean
  releaseName: string
  releaseNotes: string
  publishedAt: string
  githubUrl: string
  gitInfo?: { commit: string; branch: string }
  checkedAt?: string
  error?: string
}

let globalVersionData: VersionData | null = null
let listeners: Array<(data: VersionData | null) => void> = []

function notify(data: VersionData | null) {
  globalVersionData = data
  listeners.forEach((l) => l(data))
}

export function useSystemVersion() {
  const [data, setData] = useState<VersionData | null>(globalVersionData)
  const [loading, setLoading] = useState(globalVersionData === null)
  const [checking, setChecking] = useState(false)
  const [isModalOpen, setIsModalOpen] = useState(false)

  useEffect(() => {
    const listener = (newData: VersionData | null) => setData(newData)
    listeners.push(listener)
    return () => {
      listeners = listeners.filter((l) => l !== listener)
    }
  }, [])

  const checkUpdate = useCallback(async (force = false) => {
    setChecking(true)
    try {
      const res = await fetch(`/api/system/version${force ? "?force=true" : ""}`)
      if (res.ok) {
        const json = await res.json()
        notify(json)
      }
    } catch {} finally {
      setLoading(false)
      setChecking(false)
    }
  }, [])

  useEffect(() => {
    if (!globalVersionData) {
      checkUpdate(false)
    }
  }, [checkUpdate])

  return {
    data,
    loading,
    checking,
    checkUpdate,
    isModalOpen,
    setIsModalOpen,
  }
}
