import type { AnswerBundle } from "@allabout/contracts";

function fold(line: string): string {
  if (line.length <= 75) return line;
  const chunks = [line.slice(0, 75)];
  for (let index = 75; index < line.length; index += 74) {
    chunks.push(` ${line.slice(index, index + 74)}`);
  }
  return chunks.join("\r\n");
}

function escapeText(value: string): string {
  return value.replaceAll("\\", "\\\\").replaceAll("\n", "\\n").replaceAll(",", "\\,").replaceAll(";", "\\;");
}

function utcStamp(iso: string): string {
  return new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function dateStamp(date: string): string {
  return date.replaceAll("-", "");
}

export function answerToIcs(answer: AnswerBundle): string | null {
  const dates = answer.keyDates.filter((item) => item.status === "confirmed");
  if (dates.length === 0) return null;
  const stamp = utcStamp(answer.generatedAt);
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//AllAbout Campus//Deadline//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
  ];
  for (const item of dates) {
    lines.push("BEGIN:VEVENT");
    lines.push(`UID:${item.id}@allabout.campus`);
    lines.push(`DTSTAMP:${stamp}`);
    if (item.value.precision === "instant") {
      lines.push(`DTSTART:${utcStamp(item.value.iso)}`);
    } else if (item.value.precision === "date") {
      lines.push(`DTSTART;VALUE=DATE:${dateStamp(item.value.date)}`);
    } else {
      continue;
    }
    lines.push(fold(`SUMMARY:${escapeText(item.label)}`));
    if (answer.scope.course) {
      lines.push(fold(`DESCRIPTION:${escapeText(`${answer.scope.course}${answer.scope.entity ? ` ${answer.scope.entity}` : ""}`)}`));
    }
    lines.push("END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return `${lines.join("\r\n")}\r\n`;
}
