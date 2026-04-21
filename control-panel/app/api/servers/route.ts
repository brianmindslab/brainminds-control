import { NextResponse } from 'next/server';
import os from 'os';

const PRODUCTION_SERVER_IP = process.env.PRODUCTION_SERVER_IP ?? '46.225.217.226';

async function pingProduction() {
  try {
    const res = await fetch(`http://${PRODUCTION_SERVER_IP}/api/diagnostics`, {
      signal: AbortSignal.timeout(5000),
    });
    return { ok: res.ok, status: res.status };
  } catch {
    return { ok: false, status: null };
  }
}

function builderStats() {
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const usedMem = totalMem - freeMem;
  const cpuLoad = os.loadavg()[0]; // 1-minute average

  return {
    cpu: Math.round((cpuLoad / os.cpus().length) * 100),
    memPercent: Math.round((usedMem / totalMem) * 100),
    memUsedGb: (usedMem / 1024 ** 3).toFixed(1),
    memTotalGb: (totalMem / 1024 ** 3).toFixed(1),
    uptime: Math.floor(os.uptime() / 60), // minutes
  };
}

export async function GET() {
  const [prod, builder] = await Promise.all([pingProduction(), Promise.resolve(builderStats())]);

  return NextResponse.json({
    builder: { ...builder, ok: true },
    production: { ...prod, ip: PRODUCTION_SERVER_IP },
  });
}
