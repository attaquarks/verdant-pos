"use client";

import Link from "next/link";
import { useState } from "react";
import {
  ArrowRight,
  Banknote,
  CircleDollarSign,
  CreditCard,
  Package,
  Plus,
  ShoppingBag,
  TrendingUp,
  Wallet,
} from "lucide-react";
import type { DashboardData, Shop } from "../lib/types";
import { money, quantity, stockStatus } from "../lib/money";
import { formatDate } from "../lib/dates";
import { RevenueChart } from "./charts";
import { Badge, Button, DateRangeControl, EmptyState, Metric, Notice, PageHeading } from "./ui";
import { PaymentBadge, SaleDetailsDialog, SaleStatus } from "./sale-details";
import { SaleDialog } from "./sale-dialog";

export function DashboardView({ data, shop }: { data: DashboardData; shop: Shop }) {
  const [saleOpen, setSaleOpen] = useState(false);
  const [selectedSale, setSelectedSale] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const summary = data.today.summary;
  const bestSellers = data.period.products.slice(0, 5);
  return (
    <>
      <PageHeading
        title="Dashboard"
        subtitle="A clear view of your shop. Every number comes from your recorded activity."
        actions={
          <>
            <Link href="/inventory" className="button button--secondary">
              <Package size={16} />
              Manage inventory
            </Link>
            <Button onClick={() => setSaleOpen(true)}>
              <Plus size={17} />
              New sale
            </Button>
          </>
        }
      />
      {success && (
        <Notice tone="success" onDismiss={() => setSuccess(null)}>
          {success}
        </Notice>
      )}
      <div className="section-eyebrow">
        <span>
          AT A GLANCE <span aria-hidden="true">/</span> TODAY
        </span>
        <span>
          {shop.currency} · Shop timezone: {shop.time_zone.replaceAll("_", " ")}
        </span>
      </div>
      <div className="metric-grid">
        <Metric
          label="Today’s revenue"
          value={money(summary.revenue, shop.currency)}
          detail="Sales less returns recorded today"
          icon={CircleDollarSign}
          tone="green"
        />
        <Metric
          label="Units sold today"
          value={quantity(summary.units)}
          detail={`${summary.sales_count.toLocaleString()} recorded sales · net of returns`}
          icon={ShoppingBag}
        />
        <Metric
          label="Weekly revenue"
          value={money(data.week.summary.revenue, shop.currency)}
          detail="Monday through today · net of returns"
          icon={TrendingUp}
        />
        <Metric
          label="Low-stock products"
          value={data.lowStockCount.toLocaleString()}
          detail="Active products needing attention"
          icon={Package}
          tone={data.lowStockCount > 0 ? "amber" : undefined}
        />
      </div>
      <div className="dashboard-main-grid">
        <section className="panel revenue-panel">
          <div className="panel-heading">
            <div>
              <h2>Revenue over time</h2>
              <p>Net sales in {data.range.label.toLowerCase()}</p>
            </div>
            <span className="chart-legend">
              <i />
              Net revenue
            </span>
          </div>
          <div className="dashboard-range">
            <DateRangeControl range={data.range} />
          </div>
          <RevenueChart data={data.period.trend} currency={shop.currency} />
          <div className="chart-footer">
            <span>
              Period revenue <strong>{money(data.period.summary.revenue, shop.currency)}</strong>
            </span>
            <Link
              href={
                data.range.preset === "custom"
                  ? `/reports?from=${data.range.from}&to=${data.range.to}`
                  : `/reports?preset=${encodeURIComponent(data.range.preset)}`
              }
              className="text-link"
            >
              View report
              <ArrowRight size={14} />
            </Link>
          </div>
        </section>
        <section className="panel payments-panel">
          <div className="panel-heading">
            <div>
              <h2>Today’s payments</h2>
              <p>Money movement, separate from revenue</p>
            </div>
          </div>
          <dl className="payment-breakdown">
            <div>
              <dt>
                <span className="method-icon">
                  <Banknote size={17} />
                </span>
                Cash received
              </dt>
              <dd>{money(summary.cash_received, shop.currency)}</dd>
            </div>
            <div>
              <dt>
                <span className="method-icon">
                  <CreditCard size={17} />
                </span>
                Digital received
              </dt>
              <dd>{money(summary.digital_received, shop.currency)}</dd>
            </div>
            <div className="credit-breakdown">
              <dt>
                <span className="method-icon">
                  <Wallet size={17} />
                </span>
                Credit sales
              </dt>
              <dd>{money(summary.credit_sales, shop.currency)}</dd>
            </div>
            <div>
              <dt>Refunds issued</dt>
              <dd>{money(summary.refunds, shop.currency)}</dd>
            </div>
          </dl>
          <div className="payment-panel-note">
            <Wallet size={16} aria-hidden="true" />
            <p>
              Credit is revenue, not cash. Collections appear in money received, not in sales again.
            </p>
          </div>
          <Link href="/cashbook" className="panel-bottom-link">
            Open cashbook
            <ArrowRight size={15} />
          </Link>
        </section>
      </div>
      <div className="dashboard-secondary-grid">
        <section className="panel">
          <div className="panel-heading">
            <div>
              <h2>Best sellers</h2>
              <p>By net revenue · {data.range.label}</p>
            </div>
            <Link className="text-link" href="/reports">
              All products
              <ArrowRight size={14} />
            </Link>
          </div>
          {!bestSellers.length ? (
            <EmptyState
              compact
              icon={ShoppingBag}
              title="Your best sellers will appear here"
              description="Record your first sales to see what’s moving."
            />
          ) : (
            <div className="table-scroll">
              <table className="data-table compact-table">
                <caption className="sr-only">Best-selling products for {data.range.label}</caption>
                <thead>
                  <tr>
                    <th>Product</th>
                    <th className="numeric">Net units</th>
                    <th className="numeric">Net revenue</th>
                  </tr>
                </thead>
                <tbody>
                  {bestSellers.map((product, index) => (
                    <tr key={product.product_id}>
                      <td>
                        <span className="rank-number">{String(index + 1).padStart(2, "0")}</span>
                        <span className="rank-product">
                          <strong>{product.name}</strong>
                          <span className="cell-meta">{product.category || "Uncategorized"}</span>
                        </span>
                      </td>
                      <td className="numeric">{quantity(product.units)}</td>
                      <td className="numeric amount-cell">
                        {money(product.revenue, shop.currency)}
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
              <h2>
                Stock needs attention{" "}
                {data.lowStockCount > 0 && <Badge tone="amber">{data.lowStockCount}</Badge>}
              </h2>
              <p>Active products at or below their alert level</p>
            </div>
            <Link href="/inventory?stock=alerts&sort=stock&active=active" className="text-link">
              Inventory
              <ArrowRight size={14} />
            </Link>
          </div>
          {!data.lowStock.length ? (
            <EmptyState
              compact
              icon={Package}
              title="No low-stock alerts"
              description="Your active inventory has no products at or below their configured alert levels."
            />
          ) : (
            <ul className="low-stock-list">
              {data.lowStock.slice(0, 5).map((product) => (
                <li key={product.id}>
                  <span className="product-thumbnail" aria-hidden="true">
                    <Package size={17} />
                  </span>
                  <div>
                    <Link
                      href={`/inventory?q=${encodeURIComponent(product.sku || product.name)}`}
                      className="subtle-link"
                    >
                      <strong>{product.name}</strong>
                    </Link>
                    <span className="cell-meta">
                      Alert at {quantity(product.low_stock_threshold)} {product.unit}
                    </span>
                  </div>
                  <div className="low-stock-amount">
                    <strong
                      className={stockStatus(product) === "out" ? "danger-text" : "amber-text"}
                    >
                      {quantity(product.current_stock)} <small>{product.unit}</small>
                    </strong>
                    <span>{stockStatus(product) === "out" ? "Out of stock" : "Low stock"}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
      <section className="panel recent-sales-panel">
        <div className="panel-heading">
          <div>
            <h2>Recent sales</h2>
            <p>The latest transactions in your shop</p>
          </div>
          <Link href="/sales" className="text-link">
            View all sales
            <ArrowRight size={14} />
          </Link>
        </div>
        {!data.recentSales.length ? (
          <EmptyState
            compact
            icon={ShoppingBag}
            title="Ready for your first sale"
            description="Choose a product, select a payment method, and record your first transaction."
            action={
              <Button size="sm" onClick={() => setSaleOpen(true)}>
                <Plus size={15} />
                New sale
              </Button>
            }
          />
        ) : (
          <div className="table-scroll">
            <table className="data-table responsive-table">
              <caption className="sr-only">Recent sales</caption>
              <thead>
                <tr>
                  <th>Reference</th>
                  <th>Customer</th>
                  <th>Date & time</th>
                  <th>Payment</th>
                  <th className="numeric">Net amount</th>
                  <th>Status</th>
                  <th>
                    <span className="sr-only">View sale</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.recentSales.map((sale) => (
                  <tr key={sale.id}>
                    <td data-label="Sale">
                      <button
                        type="button"
                        className="table-link"
                        onClick={() => setSelectedSale(sale.id)}
                      >
                        {sale.reference}
                      </button>
                    </td>
                    <td data-label="Customer">
                      {sale.customer_name || <span className="muted">Walk-in</span>}
                    </td>
                    <td data-label="Date & time">
                      {formatDate(sale.occurred_at, shop.time_zone, {
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </td>
                    <td data-label="Payment">
                      <PaymentBadge method={sale.payment_method} />
                    </td>
                    <td data-label="Net amount" className="numeric amount-cell">
                      {money(sale.net_total, shop.currency)}
                    </td>
                    <td data-label="Status">
                      <SaleStatus sale={sale} />
                    </td>
                    <td className="row-actions">
                      <button
                        className="icon-button"
                        type="button"
                        aria-label={`View sale ${sale.reference}`}
                        onClick={() => setSelectedSale(sale.id)}
                      >
                        <ArrowRight size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <p className="page-footnote">
        This week: {money(data.week.summary.revenue, shop.currency)} net revenue across{" "}
        {data.week.summary.sales_count.toLocaleString()} recorded sales. Revenue and cash are
        deliberately reported separately.
      </p>
      {saleOpen && (
        <SaleDialog
          shop={shop}
          onClose={() => setSaleOpen(false)}
          onSuccess={(message) => {
            setSaleOpen(false);
            setSuccess(message);
          }}
        />
      )}
      {selectedSale && (
        <SaleDetailsDialog
          saleId={selectedSale}
          shop={shop}
          onClose={() => setSelectedSale(null)}
        />
      )}
    </>
  );
}
