"use client";
import { useT, useDateFormatter } from "./preferences";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { ChartNoAxesCombined } from "lucide-react";
import { money } from "../lib/money";

import { EmptyState } from "./ui";

/** Reserve space conservatively for unmeasured text, including wide and RTL glyphs.
 * This keeps full labels in the SVG without relying on client font-loading timing. */
const textSpace = (text: string) => text.length * 14;
// Numerals and punctuation in currency labels are narrower than arbitrary names.
const moneySpace = (text: string) =>
  Array.from(text).reduce((width, char) => width + (/[0-9.,$+\- ]/.test(char) ? 9 : 14), 0);

function ChartViewport({ children, label }: { children: ReactNode; label: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [scrollable, setScrollable] = useState(false);
  const t = useT();
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const update = () => setScrollable(element.scrollWidth > element.clientWidth + 1);
    const observer = new ResizeObserver(update);
    observer.observe(element);
    if (element.firstElementChild) observer.observe(element.firstElementChild);
    update();
    return () => observer.disconnect();
  }, []);
  const hint = t("Scroll sideways to see the whole chart");
  return (
    <div className="chart-container">
      {scrollable && <p className="chart-scroll-hint">↔ {hint}</p>}
      <div
        ref={ref}
        className="chart-wrap"
        role={scrollable ? "region" : undefined}
        aria-label={scrollable ? `${label}. ${hint}` : undefined}
        tabIndex={scrollable ? 0 : undefined}
      >
        {children}
      </div>
    </div>
  );
}

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
    return <EmptyState compact icon={ChartNoAxesCombined} title={t("No revenue in this period")} />;
  const height = 240,
    right = 24,
    top = 22,
    bottom = 42;
  const values = data.map((point) => Number(point.revenue));
  const minimum = Math.min(0, ...values),
    maximum = Math.max(0, ...values);
  const span = maximum - minimum || 1;
  const ticks = [0, 1, 2, 3, 4].map((tick) => minimum + (span * tick) / 4);
  const left = Math.max(
    96,
    ...ticks.map((value) => moneySpace(money(value.toFixed(2), currency)) + 20),
  );
  const dateLabel = (date: string) =>
    formatDate(`${date}T12:00:00Z`, "UTC", { month: "short", day: "numeric" });
  // With six observations the closest chosen dates are one fifth of the plot apart.
  const plotWidth = Math.max(
    440,
    5 * (Math.max(...data.map((p) => textSpace(dateLabel(p.date)))) + 12),
  );
  const width = left + plotWidth + right;
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
  return (
    <ChartViewport label={t("Net revenue over time, {v0}", { v0: currency })}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="line-chart"
        style={{ width }}
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
    </ChartViewport>
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
  const limited = data.length > rows.length;
  if (!rows.length)
    return <EmptyState compact icon={ChartNoAxesCombined} title={t("No category revenue yet")} />;

  // Reserve room for complete names and exact values, even when values are negative.
  // Number is used only for plot coordinates; displayed amounts come from the original strings.
  const min = Math.min(0, ...rows.map((row) => Number(row.revenue)));
  const max = Math.max(0, ...rows.map((row) => Number(row.revenue)));
  const range = max - min;
  const span = range || 1;
  const ticks = range ? [min, min + span / 2, max] : [0];
  const nameWidth = Math.max(...rows.map((row) => textSpace(row.category)));
  const valueWidth = Math.max(...rows.map((row) => moneySpace(money(row.revenue, currency))));
  const negativeValueWidth = Math.max(
    0,
    ...rows
      .filter((row) => Number(row.revenue) < 0)
      .map((row) => moneySpace(money(row.revenue, currency))),
  );
  const tickWidth = Math.max(
    ...ticks.map((value) => moneySpace(money(value.toFixed(2), currency))),
  );
  const left = Math.max(148, nameWidth + negativeValueWidth + 30, tickWidth / 2 + 8);
  const right = Math.max(84, valueWidth + 16, tickWidth / 2 + 8);
  const plotWidth = Math.max(448, tickWidth * 2 + 24);
  const width = left + plotWidth + right;
  const top = 8,
    barHeight = 34,
    bottom = 34;
  const height = top + rows.length * barHeight + bottom;
  const x = (value: number) => left + ((value - min) / span) * plotWidth;
  return (
    <div className="category-revenue">
      {limited && (
        <p className="category-limit">
          {t("Showing first {v0} of {v1} categories", { v0: rows.length, v1: data.length })}
        </p>
      )}
      <div className="category-revenue-desktop">
        <ChartViewport label={t("Net revenue by category, {v0}", { v0: currency })}>
          <svg
            viewBox={`0 0 ${width} ${height}`}
            style={{ width }}
            role="img"
            className="bar-chart"
            aria-labelledby={`${id}-title ${id}-desc`}
          >
            <title id={`${id}-title`}>{t("Net revenue by category, {v0}", { v0: currency })}</title>
            <desc id={`${id}-desc`}>
              {rows.map((row) => `${row.category}: ${money(row.revenue, currency)}`).join("; ")}
            </desc>
            {ticks.map((value, index) => (
              <g key={index}>
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
                  textAnchor={index === 0 ? "start" : index === 2 ? "end" : "middle"}
                  className="chart-axis"
                >
                  {money(value.toFixed(2), currency)}
                </text>
              </g>
            ))}
            {rows.map((row, index) => {
              const value = Number(row.revenue);
              return (
                <g key={index} className="category-bar-row">
                  <text
                    x={left - negativeValueWidth - 14}
                    y={top + index * barHeight + 19}
                    textAnchor="end"
                    className="chart-label"
                  >
                    {row.category}
                  </text>
                  {value !== 0 && (
                    <rect
                      x={Math.min(x(0), x(value))}
                      y={top + index * barHeight + 6}
                      width={Math.abs(x(value) - x(0))}
                      height={18}
                      rx="3"
                      className={value < 0 ? "chart-bar chart-bar--negative" : "chart-bar"}
                    >
                      <title>
                        {t("{v0}: {v1}", { v0: row.category, v1: money(row.revenue, currency) })}
                      </title>
                    </rect>
                  )}
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
        </ChartViewport>
      </div>
      <ul
        className="category-revenue-list"
        aria-label={t("Net revenue by category, {v0}", { v0: currency })}
      >
        {rows.map((row, index) => (
          <li className="category-revenue-row" key={index}>
            <bdi className="category-revenue-name" dir="auto">
              {row.category}
            </bdi>
            <bdi className="category-revenue-value" dir="ltr">
              {money(row.revenue, currency)}
            </bdi>
          </li>
        ))}
      </ul>
    </div>
  );
}
