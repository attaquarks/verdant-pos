"use client";
import { useT, useDateFormatter } from "./preferences";

import { useId } from "react";
import { ChartNoAxesCombined } from "lucide-react";
import { money } from "../lib/money";

import { EmptyState } from "./ui";

/** Number conversion below is exclusively for SVG coordinates, never ledger arithmetic. */
export function RevenueChart({
  data,
  currency,
}: {
  data: { date: string; revenue: string }[];
  currency: string;
}) {
  const formatDate = useDateFormatter();
  const t = useT();
  const id = useId();
  if (!data.length || data.every((point) => Number(point.revenue) === 0))
    return (
      <EmptyState
        compact
        icon={ChartNoAxesCombined}
        title={t("No revenue in this period")}
        description={t("Posted sales and return adjustments will appear here.")}
      />
    );
  const width = 760,
    height = 240,
    left = 96,
    right = 24,
    top = 22,
    bottom = 42;
  const values = data.map((point) => Number(point.revenue));
  const minimum = Math.min(0, ...values),
    maximum = Math.max(0, ...values);
  const span = maximum - minimum || 1;
  const x = (index: number) =>
    left + (data.length === 1 ? 0.5 : index / (data.length - 1)) * (width - left - right);
  const y = (value: number) => top + ((maximum - value) / span) * (height - top - bottom);
  const points = data.map((point, index) => `${x(index)},${y(Number(point.revenue))}`).join(" ");
  const labelIndexes = Array.from(
    new Set([
      0,
      Math.floor((data.length - 1) / 3),
      Math.floor(((data.length - 1) * 2) / 3),
      data.length - 1,
    ]),
  );
  const dateLabel = (date: string) =>
    formatDate(`${date}T12:00:00Z`, "UTC", { month: "short", day: "numeric" });
  return (
    <div className="chart-wrap">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="line-chart"
        role="img"
        aria-labelledby={`${id}-title ${id}-desc`}
      >
        <title id={`${id}-title`}>{t("Net revenue over time, {v0}", { v0: currency })}</title>
        <desc id={`${id}-desc`}>
          {data.map((point) => `${point.date}: ${money(point.revenue, currency)}`).join("; ")}
          {t(". Returns reduce revenue on the day recorded.")}
        </desc>
        {[0, 1, 2, 3, 4].map((tick) => {
          const value = minimum + (span * tick) / 4;
          return (
            <g key={tick}>
              <line
                x1={left}
                y1={y(value)}
                x2={width - right}
                y2={y(value)}
                className="chart-grid"
              />
              <text x={left - 12} y={y(value) + 4} textAnchor="end" className="chart-axis">
                {money(value.toFixed(2), currency)}
              </text>
            </g>
          );
        })}
        {minimum < 0 && (
          <line x1={left} y1={y(0)} x2={width - right} y2={y(0)} className="chart-baseline" />
        )}
        <polyline
          points={points}
          fill="none"
          className="chart-line"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {data.map((point, index) => (
          <circle
            key={point.date}
            cx={x(index)}
            cy={y(Number(point.revenue))}
            r={data.length > 45 ? 2 : 3.5}
            className="chart-point"
          >
            <title>
              {t("{v0} · {v1}", { v0: dateLabel(point.date), v1: money(point.revenue, currency) })}
            </title>
          </circle>
        ))}
        {labelIndexes.map((index) => (
          <text
            key={index}
            x={x(index)}
            y={height - 12}
            textAnchor={index === 0 ? "start" : index === data.length - 1 ? "end" : "middle"}
            className="chart-axis"
          >
            {dateLabel(data[index].date)}
          </text>
        ))}
      </svg>
    </div>
  );
}

export function CategoryChart({
  data,
  currency,
}: {
  data: { category: string; revenue: string }[];
  currency: string;
}) {
  const t = useT();
  const id = useId();
  const rows = data.slice(0, 6);
  if (!rows.length || rows.every((row) => Number(row.revenue) === 0))
    return (
      <EmptyState
        compact
        icon={ChartNoAxesCombined}
        title={t("No category revenue yet")}
        description={t("Category performance will follow your recorded sales.")}
      />
    );
  const width = 680,
    left = 148,
    right = 84,
    top = 8,
    barHeight = 34,
    bottom = 34;
  const height = top + rows.length * barHeight + bottom;
  const min = Math.min(0, ...rows.map((row) => Number(row.revenue)));
  const max = Math.max(0, ...rows.map((row) => Number(row.revenue)));
  const span = max - min || 1;
  const x = (value: number) => left + ((value - min) / span) * (width - left - right);
  return (
    <div className="chart-wrap">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        className="bar-chart"
        aria-labelledby={`${id}-title ${id}-desc`}
      >
        <title id={`${id}-title`}>{t("Net revenue by category, {v0}", { v0: currency })}</title>
        <desc id={`${id}-desc`}>
          {rows.map((row) => `${row.category}: ${money(row.revenue, currency)}`).join("; ")}
        </desc>
        {[0, 0.5, 1].map((fraction) => {
          const value = min + span * fraction;
          return (
            <g key={fraction}>
              <line
                x1={x(value)}
                y1={top}
                x2={x(value)}
                y2={height - bottom}
                className="chart-grid"
              />
              <text
                x={x(value)}
                y={height - 10}
                textAnchor={fraction === 0 ? "start" : fraction === 1 ? "end" : "middle"}
                className="chart-axis"
              >
                {money(value.toFixed(2), currency)}
              </text>
            </g>
          );
        })}
        {rows.map((row, index) => {
          const value = Number(row.revenue);
          return (
            <g key={row.category}>
              <text
                x={left - 14}
                y={top + index * barHeight + 19}
                textAnchor="end"
                className="chart-label"
              >
                {row.category.length > 20 ? `${row.category.slice(0, 19)}…` : row.category}
              </text>
              <rect
                x={Math.min(x(0), x(value))}
                y={top + index * barHeight + 6}
                width={Math.max(1, Math.abs(x(value) - x(0)))}
                height={18}
                rx="3"
                className={value < 0 ? "chart-bar chart-bar--negative" : "chart-bar"}
              >
                <title>
                  {t("{v0}: {v1}", { v0: row.category, v1: money(row.revenue, currency) })}
                </title>
              </rect>
              <text
                x={value >= 0 ? x(value) + 8 : x(value) - 8}
                y={top + index * barHeight + 19}
                textAnchor={value >= 0 ? "start" : "end"}
                className="chart-value"
              >
                {money(row.revenue, currency)}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
