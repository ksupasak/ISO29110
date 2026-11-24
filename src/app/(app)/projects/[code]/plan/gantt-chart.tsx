import Link from "next/link";
import { formatThaiDate } from "@/lib/dates";
import type { GanttModel, GanttTaskInput } from "@/features/plan/gantt";

const HEADER = 40;
const ROW = 32;
const BAR_Y = 7;
const BAR_H = 12;
const ACTUAL_Y = 22;
const ACTUAL_H = 4;
const DIAMOND = 6;
/** Deeper levels keep the depth-4 indent so the code and title stay visible in the narrow column. */
const MAX_INDENT_DEPTH = 4;

const range = (a: Date | null, b: Date | null) => `${formatThaiDate(a ?? b) || "-"} - ${formatThaiDate(b ?? a) || "-"}`;

/** Read-only Gantt chart: an HTML column of task links beside a horizontally scrolling SVG time area. No client JS. */
export function GanttChart({
  model,
  tasks,
  base,
  today,
}: {
  model: NonNullable<GanttModel>;
  tasks: GanttTaskInput[];
  base: string;
  today: Date;
}) {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const height = HEADER + model.rows.length * ROW;

  return (
    <div className="card-body">
      <div className="gantt">
        <div className="gantt-names">
          <div className="gantt-names-head">Task</div>
          {model.rows.map((r) => (
            <div
              key={r.id}
              className="gantt-name"
              style={{ paddingLeft: `${0.5 + Math.min(r.depth, MAX_INDENT_DEPTH) * 0.75}rem` }}
            >
              <Link href={`${base}/plan/${r.code}`} className="fw-medium">{r.code}</Link>
              <span className="gantt-name-title" title={r.title}>{r.title}</span>
              {r.late && <span className="badge text-bg-danger gantt-late">เลยกำหนด</span>}
            </div>
          ))}
        </div>
        <div className="gantt-scroll" tabIndex={0} role="region" aria-label="ช่วงเวลาของ Gantt chart (เลื่อนซ้ายขวาได้)">
          <svg
            className="gantt-svg"
            width={model.width}
            height={height}
            viewBox={`0 0 ${model.width} ${height}`}
            role="img"
            aria-label="Gantt chart ของแผนงาน"
          >
            <rect className="gantt-head-bg" x={0} y={0} width={model.width} height={HEADER} />
            {model.ticks.map((t) => (
              <g key={t.x}>
                <line className={t.major ? "gantt-grid gantt-grid-major" : "gantt-grid"} x1={t.x} x2={t.x} y1={0} y2={height} />
                <text className={t.major ? "gantt-tick gantt-tick-major" : "gantt-tick"} x={t.x + 4} y={17}>
                  {t.label}
                </text>
              </g>
            ))}
            {model.rows.map((r, i) => (
              <line key={r.id} className="gantt-row-line" x1={0} x2={model.width} y1={HEADER + (i + 1) * ROW} y2={HEADER + (i + 1) * ROW} />
            ))}
            <line className="gantt-row-line" x1={0} x2={model.width} y1={HEADER} y2={HEADER} />

            {model.rows.map((r, i) => {
              const t = byId.get(r.id);
              const top = HEADER + i * ROW;
              const tip = [
                `${r.code} ${r.title}`,
                `ตามแผน: ${t ? range(t.plannedStart, t.plannedEnd) : "-"}`,
                `ความคืบหน้า: ${t?.percent ?? 0}%`,
                ...(t?.actualStart ? [`วันจริง: ${formatThaiDate(t.actualStart)} - ${formatThaiDate(t.actualEnd) || "ยังไม่เสร็จ"}`] : []),
                ...(r.late ? ["เลยกำหนด"] : []),
              ].join("\n");
              return (
                <g key={r.id}>
                  {r.planned && (
                    <g>
                      <title>{tip}</title>
                      <rect
                        className={r.late ? "gantt-bar gantt-bar-late" : "gantt-bar"}
                        x={r.planned.x}
                        y={top + BAR_Y}
                        width={r.planned.width}
                        height={BAR_H}
                        rx={3}
                      />
                      {r.progressWidth > 0 && (
                        <rect
                          className={r.late ? "gantt-progress gantt-progress-late" : "gantt-progress"}
                          x={r.planned.x}
                          y={top + BAR_Y}
                          width={r.progressWidth}
                          height={BAR_H}
                          rx={3}
                        />
                      )}
                    </g>
                  )}
                  {r.actual && (
                    <rect className="gantt-actual" x={r.actual.x} y={top + ACTUAL_Y} width={r.actual.width} height={ACTUAL_H} rx={2}>
                      <title>{tip}</title>
                    </rect>
                  )}
                </g>
              );
            })}

            {model.todayX !== null && (
              <line className="gantt-today" x1={model.todayX} x2={model.todayX} y1={0} y2={height}>
                <title>{`วันนี้ ${formatThaiDate(today)}`}</title>
              </line>
            )}

            {model.milestones.map((m) => (
              <g key={m.id} className="gantt-milestone">
                <title>{`${m.code} ${m.name}`}</title>
                <line className="gantt-milestone-line" x1={m.x} x2={m.x} y1={HEADER - 4} y2={height} />
                <polygon
                  points={`${m.x},${HEADER - 4 - 2 * DIAMOND} ${m.x + DIAMOND},${HEADER - 4 - DIAMOND} ${m.x},${HEADER - 4} ${m.x - DIAMOND},${HEADER - 4 - DIAMOND}`}
                />
              </g>
            ))}
          </svg>
        </div>
      </div>
      <ul className="gantt-legend" aria-label="คำอธิบายสี">
        <li><span className="gantt-swatch gantt-swatch-planned" />ตามแผน</li>
        <li><span className="gantt-swatch gantt-swatch-progress" />ความคืบหน้า</li>
        <li><span className="gantt-swatch gantt-swatch-actual" />วันจริง</li>
        <li><span className="gantt-swatch gantt-swatch-late" />เลยกำหนด</li>
        <li><span className="gantt-swatch gantt-swatch-milestone" />Milestone</li>
        <li><span className="gantt-swatch gantt-swatch-today" />วันนี้</li>
      </ul>
    </div>
  );
}
