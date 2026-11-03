"use client";
import { useMessage, useT } from "./preferences";

import {
  Banknote,
  ChartNoAxesCombined,
  CircleDollarSign,
  Download,
  Receipt,
  TrendingUp,
} from "lucide-react";
import type { DateRange, Report, Shop } from "../lib/types";
import { money, quantity } from "../lib/money";
import { CategoryChart, RevenueChart } from "./charts";
import { DateRangeControl, EmptyState, Metric, Notice, PageHeading } from "./ui";
import { PaymentBadge } from "./sale-details";

export function ReportsView({
  report,
  shop,
  range,
}: {
  report: Report;
  shop: Shop;
  range: DateRange;
}) {
  const t = useT();
  const m = useMessage();
  const summary = report.summary;
  return (
    <>
      <PageHeading
        title={t("Reports")}
        actions={
          <a
            href={`/api/export?type=report&from=${range.from}&to=${range.to}`}
            className="button button--secondary"
          >
            <Download size={16} />
            {t("Export report")}
          </a>
        }
      />
      <div className="range-toolbar">
        <DateRangeControl range={range} />
        <span className="timezone-note">
          {shop.currency} · {shop.time_zone.replaceAll("_", " ")}
        </span>
      </div>
      {summary.unknown_cost_lines > 0 && (
        <Notice tone="warning">
          {summary.unknown_cost_lines.toLocaleString()} {t("sale")}{" "}
          {summary.unknown_cost_lines === 1 ? t("line has") : t("lines have")}{" "}
          {t(
            "unknown historical cost. Gross and net profit are unavailable for this period; known costs below are not complete costs.",
          )}
        </Notice>
      )}
      <div className="metric-grid">
        <Metric
          label={t("Net revenue")}
          value={money(summary.revenue, shop.currency)}
          icon={CircleDollarSign}
          tone="green"
        />
        <Metric
          label={t("Gross profit")}
          value={
            summary.gross_profit === null ? (
              <span className="metric-unavailable">{t("Unavailable")}</span>
            ) : (
              money(summary.gross_profit, shop.currency)
            )
          }
          detail={summary.gross_profit === null ? t("Historical cost is missing") : undefined}
          icon={TrendingUp}
        />
        <Metric
          label={t("Operating expenses")}
          value={money(summary.expenses, shop.currency)}
          icon={Receipt}
        />
        <Metric
          label={t("Estimated net profit")}
          value={
            summary.estimated_net_profit === null ? (
              <span className="metric-unavailable">{t("Unavailable")}</span>
            ) : (
              money(summary.estimated_net_profit, shop.currency)
            )
          }
          icon={ChartNoAxesCombined}
        />
      </div>
      <div className="reports-chart-grid">
        <section className="panel">
          <div className="panel-heading">
            <div>
              <h2>{t("Revenue trend")}</h2>
            </div>
            <span className="chart-legend">
              <i />
              {t("Net revenue")}
            </span>
          </div>
          <RevenueChart data={report.trend} currency={shop.currency} />
        </section>
        <section className="panel">
          <div className="panel-heading">
            <div>
              <h2>{t("Revenue by category")}</h2>
            </div>
          </div>
          <CategoryChart data={report.categories} currency={shop.currency} />
        </section>
      </div>
      <div className="report-summary-grid">
        <section className="panel">
          <div className="panel-heading">
            <div>
              <h2>{t("Profit breakdown")}</h2>
            </div>
          </div>
          <dl className="report-breakdown">
            <div>
              <dt>{t("Net sales revenue")}</dt>
              <dd>{money(summary.revenue, shop.currency)}</dd>
            </div>
            <div>
              <dt>
                {summary.unknown_cost_lines
                  ? t("Known cost of goods only")
                  : t("Cost of goods sold")}
              </dt>
              <dd>{money(summary.cost_of_goods, shop.currency)}</dd>
            </div>
            <div className="breakdown-subtotal">
              <dt>{t("Gross profit")}</dt>
              <dd>
                {summary.gross_profit === null ? (
                  <span className="unavailable">{t("Unavailable")}</span>
                ) : (
                  money(summary.gross_profit, shop.currency)
                )}
              </dd>
            </div>
            <div>
              <dt>{t("Operating expenses")}</dt>
              <dd>{money(summary.expenses, shop.currency)}</dd>
            </div>
            <div className="breakdown-total">
              <dt>{t("Estimated net profit")}</dt>
              <dd>
                {summary.estimated_net_profit === null ? (
                  <span className="unavailable">{t("Unavailable")}</span>
                ) : (
                  money(summary.estimated_net_profit, shop.currency)
                )}
              </dd>
            </div>
          </dl>
          {summary.unknown_cost_lines > 0 && (
            <p className="panel-inline-note">
              {t("Known-cost gross profit:")} {money(summary.known_gross_profit, shop.currency)}
              {t(". This is partial information, not the shop’s total profit.")}
            </p>
          )}
        </section>
        <section className="panel">
          <div className="panel-heading">
            <div>
              <h2>{t("Receipts & credit")}</h2>
            </div>
          </div>
          <dl className="report-breakdown">
            <div>
              <dt>{t("Cash received")}</dt>
              <dd>{money(summary.cash_received, shop.currency)}</dd>
            </div>
            <div>
              <dt>{t("Digital received")}</dt>
              <dd>{money(summary.digital_received, shop.currency)}</dd>
            </div>
            <div>
              <dt>
                {t("Credit sales")} <span className="muted">{t("(not cash)")}</span>
              </dt>
              <dd>{money(summary.credit_sales, shop.currency)}</dd>
            </div>
            <div>
              <dt>{t("Refunds paid")}</dt>
              <dd>{money(summary.refunds, shop.currency)}</dd>
            </div>
            <div className="breakdown-total">
              <dt>
                {t("Net money movement")} <span className="muted">{t("(all methods)")}</span>
              </dt>
              <dd>{money(summary.net_cash_movement, shop.currency)}</dd>
            </div>
          </dl>
        </section>
      </div>
      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>{t("Product performance")}</h2>
          </div>
          <span className="muted small-text">
            {report.products.length.toLocaleString()} {t("products")}
          </span>
        </div>
        {!report.products.length ? (
          <EmptyState
            compact
            icon={ChartNoAxesCombined}
            title={t("No product activity in this period")}
          />
        ) : (
          <div className="table-scroll">
            <table className="data-table responsive-table report-products-table">
              <caption className="sr-only">
                {t("Product performance for")} {m(range.label)}
              </caption>
              <thead>
                <tr>
                  <th>{t("Product")}</th>
                  <th>{t("Category")}</th>
                  <th className="numeric">{t("Net units")}</th>
                  <th className="numeric">{t("Net revenue")}</th>
                  <th className="numeric">{t("Cost of goods")}</th>
                  <th className="numeric">{t("Gross profit")}</th>
                </tr>
              </thead>
              <tbody>
                {report.products.map((product) => (
                  <tr key={product.product_id}>
                    <td data-label={t("Product")}>
                      <strong className="table-strong">{product.name}</strong>
                      <span className="cell-meta">{product.sku || t("No SKU")}</span>
                    </td>
                    <td data-label={t("Category")}>{product.category || t("Uncategorized")}</td>
                    <td data-label={t("Net units")} className="numeric">
                      {quantity(product.units)}
                    </td>
                    <td data-label={t("Net revenue")} className="numeric amount-cell">
                      {money(product.revenue, shop.currency)}
                    </td>
                    <td data-label={t("Cost of goods")} className="numeric">
                      {product.unknown_cost_lines > 0 ? (
                        <span
                          className="unavailable"
                          title={t("{v0} lines have unknown cost", {
                            v0: product.unknown_cost_lines,
                          })}
                        >
                          {t("Incomplete")}
                        </span>
                      ) : (
                        money(product.cost, shop.currency)
                      )}
                    </td>
                    <td data-label={t("Gross profit")} className="numeric">
                      {product.gross_profit === null ? (
                        <span className="unavailable">{t("Unavailable")}</span>
                      ) : (
                        money(product.gross_profit, shop.currency)
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>{t("Cashbook by payment method")}</h2>
          </div>
          <Banknote size={19} className="muted" aria-hidden="true" />
        </div>
        {!report.payment_methods.length ? (
          <EmptyState compact icon={Banknote} title={t("No cash or digital movements")} />
        ) : (
          <div className="table-scroll">
            <table className="data-table">
              <caption className="sr-only">{t("Money movement by payment method")}</caption>
              <thead>
                <tr>
                  <th>{t("Method")}</th>
                  <th className="numeric">{t("Money in")}</th>
                  <th className="numeric">{t("Money out")}</th>
                  <th className="numeric">{t("Net movement")}</th>
                </tr>
              </thead>
              <tbody>
                {report.payment_methods.map((method) => (
                  <tr key={method.method}>
                    <td>
                      <PaymentBadge method={method.method} />
                    </td>
                    <td className="numeric">{money(method.inflow, shop.currency)}</td>
                    <td className="numeric">{money(method.outflow, shop.currency)}</td>
                    <td className="numeric amount-cell">{money(method.net, shop.currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
