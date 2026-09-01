import os from "node:os"

import { NextResponse } from "next/server"
import si from "systeminformation"

import { getSession } from "@/lib/auth"
import { isSuperAdmin } from "@/lib/permissions"

// systeminformation shells out / reads /proc — needs the Node runtime, not Edge.
export const runtime = "nodejs"

const GB = 1024 ** 3

function round1(value: number): number {
  return Math.round(value * 10) / 10
}

export async function GET() {
  // Middleware already protects /api/system/* (session-level); rol
  // kontrolü burada — sistem istatistikleri SADECE SUPER_ADMIN'e açık.
  const session = await getSession()
  if (!session || !(await isSuperAdmin(session.userId))) {
    return NextResponse.json({ error: "Bu işlem için yetkiniz yok." }, { status: 403 })
  }

  try {
    const [cpuLoad, mem, fsSizeList, osInfo, defaultIface] = await Promise.all([
      si.currentLoad(),
      si.mem(),
      si.fsSize(),
      si.osInfo(),
      si.networkInterfaces("default").catch(() => null),
    ])

    const rootDisk =
      fsSizeList.find((disk) => disk.mount === "/") ??
      fsSizeList.slice().sort((a, b) => b.size - a.size)[0] ??
      null

    const memUsedBytes = Math.max(0, mem.total - mem.available)

    return NextResponse.json({
      cpu: {
        usedPercent: Math.round(cpuLoad.currentLoad),
        cores: os.cpus().length,
        loadAvg: os.loadavg().map(round1),
      },
      mem: {
        usedPercent: mem.total ? Math.round((memUsedBytes / mem.total) * 100) : 0,
        usedGB: round1(memUsedBytes / GB),
        totalGB: round1(mem.total / GB),
      },
      disk: {
        usedPercent: rootDisk ? Math.round(rootDisk.use) : 0,
        usedGB: rootDisk ? round1(rootDisk.used / GB) : 0,
        totalGB: rootDisk ? round1(rootDisk.size / GB) : 0,
      },
      host: {
        hostname: osInfo.hostname || os.hostname(),
        platform: [osInfo.distro, osInfo.release].filter(Boolean).join(" ") || os.platform(),
        uptimeSeconds: Math.round(os.uptime()),
        ip: defaultIface?.ip4 || "-",
      },
    })
  } catch (error) {
    console.error("Sistem istatistikleri alınamadı:", error)
    return NextResponse.json({ error: "Sistem istatistikleri alınamadı." }, { status: 500 })
  }
}
