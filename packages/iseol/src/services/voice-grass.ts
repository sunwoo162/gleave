import sharp from "sharp";
import { seoulDateKey } from "./voice-time.js";

const DAY_MS = 86_400_000;
const CELL = 16;
const GAP = 5;
const WEEKS = 53;
const GRID_X = 90;
const GRID_Y = 54;
const WIDTH = 1260;
const HEIGHT = 270;

const LEVEL_COLORS = [
  "#161b22",
  "#0d321f",
  "#0e4429",
  "#006d32",
  "#26a641",
  "#39d353",
  "#7ee787",
];

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function dateKeyFromUtc(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

function intensity(seconds: number): number {
  const hours = seconds / 3600;
  if (hours <= 0) return 0;
  if (hours < 2) return 1;
  if (hours < 4) return 2;
  if (hours < 6) return 3;
  if (hours < 8) return 4;
  if (hours < 10) return 5;
  return 6;
}

function startOfCurrentWeekUtc(): number {
  const todayKey = seoulDateKey();
  const [year, month, day] = todayKey.split("-").map(Number);
  const today = Date.UTC(year ?? 1970, (month ?? 1) - 1, day ?? 1);
  const weekday = new Date(today).getUTCDay();
  return today - weekday * DAY_MS;
}

export async function renderVoiceGrass(
  dailySeconds: Record<string, number>,
  displayName: string,
): Promise<Buffer> {
  const start = startOfCurrentWeekUtc() - (WEEKS - 1) * 7 * DAY_MS;
  const rects: string[] = [];
  const monthLabels: string[] = [];
  let lastMonth = -1;
  let displayedSeconds = 0;

  for (let week = 0; week < WEEKS; week += 1) {
    for (let day = 0; day < 7; day += 1) {
      const ms = start + (week * 7 + day) * DAY_MS;
      const key = dateKeyFromUtc(ms);
      const seconds = dailySeconds[key] ?? 0;
      displayedSeconds += seconds;
      const level = intensity(seconds);
      const x = GRID_X + week * (CELL + GAP);
      const y = GRID_Y + day * (CELL + GAP);
      const hours = (seconds / 3600).toFixed(seconds >= 3600 ? 1 : 2);

      rects.push(
        `<rect x="${x}" y="${y}" width="${CELL}" height="${CELL}" rx="3" fill="${LEVEL_COLORS[level]}" aria-label="${key} ${hours}h"/>`,
      );

      const date = new Date(ms);
      const month = date.getUTCMonth();
      if (day === 0 && month !== lastMonth && date.getUTCDate() <= 7) {
        lastMonth = month;
        const label = new Intl.DateTimeFormat("en-US", { month: "short", timeZone: "UTC" }).format(date);
        monthLabels.push(`<text x="${x}" y="38" fill="#c9d1d9" font-size="17">${escapeXml(label)}</text>`);
      }
    }
  }

  const totalHours = (displayedSeconds / 3600).toFixed(1);
  const legendX = WIDTH - 455;
  const legend = ["0h", "<2h", "2h", "4h", "6h", "8h", "10h+"]
    .map((label, index) => {
      const x = legendX + index * 62;
      return `<g><rect x="${x}" y="226" width="16" height="16" rx="3" fill="${LEVEL_COLORS[index]}"/><text x="${x + 21}" y="240" fill="#8b949e" font-size="13">${escapeXml(label)}</text></g>`;
    })
    .join("");

  const svg = `
  <svg width="${WIDTH}" height="${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
    <rect width="100%" height="100%" rx="16" fill="#0d1117"/>
    <text x="28" y="30" fill="#f0f6fc" font-size="20" font-weight="700">${escapeXml(displayName)} · 음성 공부 잔디</text>
    <text x="28" y="252" fill="#8b949e" font-size="15">최근 1년 누적 ${totalHours}시간</text>
    ${monthLabels.join("")}
    <text x="28" y="86" fill="#c9d1d9" font-size="16">Mon</text>
    <text x="28" y="128" fill="#c9d1d9" font-size="16">Wed</text>
    <text x="28" y="170" fill="#c9d1d9" font-size="16">Fri</text>
    ${rects.join("")}
    ${legend}
  </svg>`;

  return sharp(Buffer.from(svg)).png().toBuffer();
}
