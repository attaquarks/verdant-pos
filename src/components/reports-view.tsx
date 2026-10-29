"use client";

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
  const summary = report.summary;
  return (
    <>
      <PageHeading
        title="Reports"
        subtitle="Sales performance, costs, and cash — with the distinctions that matter."
        actions={
          <a
            href={`/api/export?type=report&from=${range.from}&to=${range.to}`}
            className="button button--secondary"
          >
            <Download size={16} />
            Export report
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
          {summary.unknown_cost_lines.toLocaleString()} sale{" "}
          {summary.unknown_cost_lines === 1 ? "line has" : "lines have"} unknown historical cost.
          Gross and net profit are unavailable for this period; known costs below are not complete
          costs.
        </Notice>
      )}
      <div className="metric-grid">
        <Metric
          label="Net revenue"
          value={money(summary.revenue, shop.currency)}
          detail={`${summary.sales_count.toLocaleString()} sales · ${quantity(summary.units)} net units`}
          icon={CircleDollarSign}
          tone="green"
        />
        <Metric
          label="Gross profit"
          value={
            summary.gross_profit === null ? (
              <span className="metric-unavailable">Unavailable</span>
            ) : (
              money(summary.gross_profit, shop.currency)
            )
          }
          detail={
            summary.gross_profit === null
              ? "Historical cost is missing"
              : "Net revenue less cost of goods"
          }
          icon={TrendingUp}
        />
        <Metric
          label="Operating expenses"
          value={money(summary.expenses, shop.currency)}
          detail="Recorded expenses in this period"
          icon={Receipt}
        />
        <Metric
          label="Estimated net profit"
          value={
            summary.estimated_net_profit === null ? (
              <span className="metric-unavailable">Unavailable</span>
            ) : (
              money(summary.estimated_net_profit, shop.currency)
            )
          }
          detail="Gross profit less recorded expenses"
          icon={ChartNoAxesCombined}
        />
      </div>
      <div className="reports-chart-grid">
        <section className="panel">
          <div className="panel-heading">
            <div>
              <h2>Revenue trend</h2>
              <p>{range.label} · Returns on the date recorded</p>
            </div>
            <span className="chart-legend">
              <i />
              Net revenue
            </span>
          </div>
          <RevenueChart data={report.trend} currency={shop.currency} />
        </section>
        <section className="panel">
          <div className="panel-heading">
            <div>
              <h2>Revenue by category</h2>
              <p>Top categories · {shop.currency}</p>
            </div>
          </div>
          <CategoryChart data={report.categories} currency={shop.currency} />
        </section>
      </div>
      <div className="report-summary-grid">
        <section className="panel">
          <div className="panel-heading">
            <div>
              <h2>Profit breakdown</h2>
              <p>Recognized sales, not money collected</p>
            </div>
          </div>
          <dl className="report-breakdown">
            <div>
              <dt>Net sales revenue</dt>
              <dd>{money(summary.revenue, shop.currency)}</dd>
            </div>
            <div>
              <dt>
                {summary.unknown_cost_lines ? "Known cost of goods only" : "Cost of goods sold"}
              </dt>
              <dd>{money(summary.cost_of_goods, shop.currency)}</dd>
            </div>
            <div className="breakdown-subtotal">
              <dt>Gross profit</dt>
              <dd>
                {summary.gross_profit === null ? (
                  <span className="unavailable">Unavailable</span>
                ) : (
                  money(summary.gross_profit, shop.currency)
                )}
              </dd>
            </div>
            <div>
              <dt>Operating expenses</dt>
              <dd>{money(summary.expenses, shop.currency)}</dd>
            </div>
            <div className="breakdown-total">
              <dt>Estimated net profit</dt>
              <dd>
                {summary.estimated_net_profit === null ? (
                  <span className="unavailable">Unavailable</span>
                ) : (
                  money(summary.estimated_net_profit, shop.currency)
                )}
              </dd>
            </div>
          </dl>
          {summary.unknown_cost_lines > 0 && (
            <p className="panel-inline-note">
              Known-cost gross profit: {money(summary.known_gross_profit, shop.currency)}. This is
              partial information, not the shop’s total profit.
            </p>
          )}
        </section>
        <section className="panel">
          <div className="panel-heading">
            <div>
              <h2>Receipts & credit</h2>
              <p>Collections are cash movement, not new revenue</p>
            </div>
          </div>
          <dl className="report-breakdown">
            <div>
              <dt>Cash received</dt>
              <dd>{money(summary.cash_received, shop.currency)}</dd>
            </div>
            <div>
              <dt>Digital received</dt>
              <dd>{money(summary.digital_received, shop.currency)}</dd>
            </div>
            <div>
              <dt>
                Credit sales <span className="muted">(not cash)</span>
              </dt>
              <dd>{money(summary.credit_sales, shop.currency)}</dd>
            </div>
            <div>
              <dt>Refunds paid</dt>
              <dd>{money(summary.refunds, shop.currency)}</dd>
            </div>
            <div className="breakdown-total">
              <dt>
                Net money movement <span className="muted">(all methods)</span>
              </dt>
              <dd>{money(summary.net_cash_movement, shop.currency)}</dd>
            </div>
          </dl>
          <p className="panel-inline-note">
            Money movement includes supplier payments, expenses, and owner deposits / withdrawals.
            It is not profit.
          </p>
        </section>
      </div>
      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>Product performance</h2>
            <p>Original sale snapshots, net of return adjustments · sorted by net revenue</p>
          </div>
          <span className="muted small-text">
            {report.products.length.toLocaleString()} products
          </span>
        </div>
        {!report.products.length ? (
          <EmptyState
            compact
            icon={ChartNoAxesCombined}
            title="No product activity in this period"
            description="Sales and returns will build this report. Try a different date range."
          />
        ) : (
          <div className="table-scroll">
            <table className="data-table responsive-table report-products-table">
              <caption className="sr-only">Product performance for {range.label}</caption>
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Category</th>
                  <th className="numeric">Net units</th>
                  <th className="numeric">Net revenue</th>
                  <th className="numeric">Cost of goods</th>
                  <th className="numeric">Gross profit</th>
                </tr>
              </thead>
              <tbody>
                {report.products.map((product) => (
                  <tr key={product.product_id}>
                    <td data-label="Product">
                      <strong className="table-strong">{product.name}</strong>
                      <span className="cell-meta">{product.sku || "No SKU"}</span>
                    </td>
                    <td data-label="Category">{product.category || "Uncategorized"}</td>
                    <td data-label="Net units" className="numeric">
                      {quantity(product.units)}
                    </td>
                    <td data-label="Net revenue" className="numeric amount-cell">
                      {money(product.revenue, shop.currency)}
                    </td>
                    <td data-label="Cost of goods" className="numeric">
                      {product.unknown_cost_lines > 0 ? (
                        <span
                          className="unavailable"
                          title={`${product.unknown_cost_lines} lines have unknown cost`}
                        >
                          Incomplete
                        </span>
                      ) : (
                        money(product.cost, shop.currency)
                      )}
                    </td>
                    <td data-label="Gross profit" className="numeric">
                      {product.gross_profit === null ? (
                        <span className="unavailable">Unavailable</span>
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
            <h2>Cashbook by payment method</h2>
            <p>All receipts and outflows for the selected dates</p>
          </div>
          <Banknote size={19} className="muted" aria-hidden="true" />
        </div>
        {!report.payment_methods.length ? (
          <EmptyState
            compact
            icon={Banknote}
            title="No cash or digital movements"
            description="Recorded receipts, refunds, and payments will appear here."
          />
        ) : (
          <div className="table-scroll">
            <table className="data-table">
              <caption className="sr-only">Money movement by payment method</caption>
              <thead>
                <tr>
                  <th>Method</th>
                  <th className="numeric">Money in</th>
                  <th className="numeric">Money out</th>
                  <th className="numeric">Net movement</th>
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
      <p className="page-footnote">
        Dates use {shop.time_zone.replaceAll("_", " ")}. Weeks start on Monday. Credit sales create
        receivables; their collections never count as revenue again. Estimated net profit excludes
        any costs not recorded in this app.
      </p>
    </>
  );
}
