"use client";
import { useMessage, useT, useDateFormatter } from "./preferences";

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

import { RevenueChart } from "./charts";
import { Badge, Button, DateRangeControl, EmptyState, Metric, Notice, PageHeading } from "./ui";
import { PaymentBadge, SaleDetailsDialog, SaleStatus } from "./sale-details";
import { SaleDialog } from "./sale-dialog";

export function DashboardView({ data, shop }: { data: DashboardData; shop: Shop }) {
  const formatDate = useDateFormatter();
  const t = useT();
  const m = useMessage();
  const [saleOpen, setSaleOpen] = useState(false);
  const [selectedSale, setSelectedSale] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const summary = data.today.summary;
  const bestSellers = data.period.products.slice(0, 5);
  return (
    <>
      <PageHeading
        title={t("Dashboard")}
        eyebrow={t("Daily hisaab")}
        subtitle={t("A clear view of your shop. Every number comes from your recorded activity.")}
        actions={
          <>
            <Link href="/inventory" className="button button--secondary">
              <Package size={16} />
              {t("Manage inventory")}
            </Link>
            <Button onClick={() => setSaleOpen(true)}>
              <Plus size={17} />
              {t("New sale")}
            </Button>
          </>
        }
      />
      {success && (
        <Notice tone="success" onDismiss={() => setSuccess(null)}>
          {success}
        </Notice>
      )}
      <section className="daily-tasks" aria-labelledby="daily-tasks-title">
        <div className="daily-tasks-heading">
          <h2 id="daily-tasks-title">{t("What do you need to do?")}</h2>
          <p>{t("Choose a task. Your saved records stay safe.")}</p>
        </div>
        <div className="task-grid">
          <button
            type="button"
            className="task-card task-card--primary"
            onClick={() => setSaleOpen(true)}
          >
            <ShoppingBag size={24} aria-hidden="true" />
            <strong>{t("Sell to a customer")}</strong>
            <span>{t("Choose maal, then cash, digital or udhaar.")}</span>
          </button>
          <Link href="/inventory" className="task-card">
            <Package size={24} aria-hidden="true" />
            <strong>{t("Check stock / maal")}</strong>
            <span>{t("See what is left. Receive new deliveries here.")}</span>
          </Link>
          <Link href="/sales?method=credit" className="task-card">
            <Wallet size={24} aria-hidden="true" />
            <strong>{t("Collect udhaar")}</strong>
            <span>{t("Open a credit sale and record the money received.")}</span>
          </Link>
          <Link href="/expenses" className="task-card">
            <Banknote size={24} aria-hidden="true" />
            <strong>{t("Record a daily expense")}</strong>
            <span>{t("Rent, electricity or transport — keep a clear record.")}</span>
          </Link>
        </div>
      </section>
      <div className="section-eyebrow">
        <span>
          {t("AT A GLANCE")} <span aria-hidden="true">/</span> {t("TODAY")}
        </span>
        <span>
          {shop.currency} {t("· Shop timezone:")} {shop.time_zone.replaceAll("_", " ")}
        </span>
      </div>
      <div className="metric-grid">
        <Metric
          label={t("Today’s revenue")}
          value={money(summary.revenue, shop.currency)}
          detail={t("Sales less returns recorded today")}
          icon={CircleDollarSign}
          tone="green"
        />
        <Metric
          label={t("Units sold today")}
          value={quantity(summary.units)}
          detail={t("{v0} recorded sales · net of returns", {
            v0: summary.sales_count.toLocaleString(),
          })}
          icon={ShoppingBag}
        />
        <Metric
          label={t("Weekly revenue")}
          value={money(data.week.summary.revenue, shop.currency)}
          detail={t("Monday through today · net of returns")}
          icon={TrendingUp}
        />
        <Metric
          label={t("Low-stock products")}
          value={data.lowStockCount.toLocaleString()}
          detail={t("Active products needing attention")}
          icon={Package}
          tone={data.lowStockCount > 0 ? "amber" : undefined}
        />
      </div>
      <div className="dashboard-main-grid">
        <section className="panel revenue-panel">
          <div className="panel-heading">
            <div>
              <h2>{t("Revenue over time")}</h2>
              <p>
                {t("Net sales in")} {m(data.range.label)}
              </p>
            </div>
            <span className="chart-legend">
              <i />
              {t("Net revenue")}
            </span>
          </div>
          <div className="dashboard-range">
            <DateRangeControl range={data.range} />
          </div>
          <RevenueChart data={data.period.trend} currency={shop.currency} />
          <div className="chart-footer">
            <span>
              {t("Period revenue")}{" "}
              <strong>{money(data.period.summary.revenue, shop.currency)}</strong>
            </span>
            <Link
              href={
                data.range.preset === "custom"
                  ? `/reports?from=${data.range.from}&to=${data.range.to}`
                  : `/reports?preset=${encodeURIComponent(data.range.preset)}`
              }
              className="text-link"
            >
              {t("View report")} <ArrowRight size={14} />
            </Link>
          </div>
        </section>
        <section className="panel payments-panel">
          <div className="panel-heading">
            <div>
              <h2>{t("Today’s payments")}</h2>
              <p>{t("Money movement, separate from revenue")}</p>
            </div>
          </div>
          <dl className="payment-breakdown">
            <div>
              <dt>
                <span className="method-icon">
                  <Banknote size={17} />
                </span>
                {t("Cash received")}
              </dt>
              <dd>{money(summary.cash_received, shop.currency)}</dd>
            </div>
            <div>
              <dt>
                <span className="method-icon">
                  <CreditCard size={17} />
                </span>
                {t("Digital received")}
              </dt>
              <dd>{money(summary.digital_received, shop.currency)}</dd>
            </div>
            <div className="credit-breakdown">
              <dt>
                <span className="method-icon">
                  <Wallet size={17} />
                </span>
                {t("Credit sales")}
              </dt>
              <dd>{money(summary.credit_sales, shop.currency)}</dd>
            </div>
            <div>
              <dt>{t("Refunds issued")}</dt>
              <dd>{money(summary.refunds, shop.currency)}</dd>
            </div>
          </dl>
          <div className="payment-panel-note">
            <Wallet size={16} aria-hidden="true" />
            <p>
              {t(
                "Credit is revenue, not cash. Collections appear in money received, not in sales again.",
              )}
            </p>
          </div>
          <Link href="/cashbook" className="panel-bottom-link">
            {t("Open cashbook")} <ArrowRight size={15} />
          </Link>
        </section>
      </div>
      <div className="dashboard-secondary-grid">
        <section className="panel">
          <div className="panel-heading">
            <div>
              <h2>{t("Best sellers")}</h2>
              <p>
                {t("By net revenue ·")} {m(data.range.label)}
              </p>
            </div>
            <Link className="text-link" href="/reports">
              {t("All products")} <ArrowRight size={14} />
            </Link>
          </div>
          {!bestSellers.length ? (
            <EmptyState
              compact
              icon={ShoppingBag}
              title={t("Your best sellers will appear here")}
              description={t("Record your first sales to see what’s moving.")}
            />
          ) : (
            <div className="table-scroll">
              <table className="data-table compact-table">
                <caption className="sr-only">
                  {t("Best-selling products for")} {m(data.range.label)}
                </caption>
                <thead>
                  <tr>
                    <th>{t("Product")}</th>
                    <th className="numeric">{t("Net units")}</th>
                    <th className="numeric">{t("Net revenue")}</th>
                  </tr>
                </thead>
                <tbody>
                  {bestSellers.map((product, index) => (
                    <tr key={product.product_id}>
                      <td>
                        <span className="rank-number">{String(index + 1).padStart(2, "0")}</span>
                        <span className="rank-product">
                          <strong>{product.name}</strong>
                          <span className="cell-meta">
                            {product.category || t("Uncategorized")}
                          </span>
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
                {t("Stock needs attention")}{" "}
                {data.lowStockCount > 0 && <Badge tone="amber">{data.lowStockCount}</Badge>}
              </h2>
              <p>{t("Active products at or below their alert level")}</p>
            </div>
            <Link href="/inventory?stock=alerts&sort=stock&active=active" className="text-link">
              {t("Inventory")} <ArrowRight size={14} />
            </Link>
          </div>
          {!data.lowStock.length ? (
            <EmptyState
              compact
              icon={Package}
              title={t("No low-stock alerts")}
              description={t(
                "Your active inventory has no products at or below their configured alert levels.",
              )}
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
                      {t("Alert at")} {quantity(product.low_stock_threshold)} {product.unit}
                    </span>
                  </div>
                  <div className="low-stock-amount">
                    <strong
                      className={stockStatus(product) === "out" ? "danger-text" : "amber-text"}
                    >
                      {quantity(product.current_stock)} <small>{product.unit}</small>
                    </strong>
                    <span>
                      {stockStatus(product) === "out" ? t("Out of stock") : t("Low stock")}
                    </span>
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
            <h2>{t("Recent sales")}</h2>
            <p>{t("The latest transactions in your shop")}</p>
          </div>
          <Link href="/sales" className="text-link">
            {t("View all sales")} <ArrowRight size={14} />
          </Link>
        </div>
        {!data.recentSales.length ? (
          <EmptyState
            compact
            icon={ShoppingBag}
            title={t("Ready for your first sale")}
            description={t(
              "Choose a product, select a payment method, and record your first transaction.",
            )}
            action={
              <Button size="sm" onClick={() => setSaleOpen(true)}>
                <Plus size={15} />
                {t("New sale")}
              </Button>
            }
          />
        ) : (
          <div className="table-scroll">
            <table className="data-table responsive-table">
              <caption className="sr-only">{t("Recent sales")}</caption>
              <thead>
                <tr>
                  <th>{t("Reference")}</th>
                  <th>{t("Customer")}</th>
                  <th>{t("Date & time")}</th>
                  <th>{t("Payment")}</th>
                  <th className="numeric">{t("Net amount")}</th>
                  <th>{t("Status")}</th>
                  <th>
                    <span className="sr-only">{t("View sale")}</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.recentSales.map((sale) => (
                  <tr key={sale.id}>
                    <td data-label={t("Sale")}>
                      <button
                        type="button"
                        className="table-link"
                        onClick={() => setSelectedSale(sale.id)}
                      >
                        {sale.reference}
                      </button>
                    </td>
                    <td data-label={t("Customer")}>
                      {sale.customer_name || <span className="muted">{t("Walk-in")}</span>}
                    </td>
                    <td data-label={t("Date & time")}>
                      {formatDate(sale.occurred_at, shop.time_zone, {
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </td>
                    <td data-label={t("Payment")}>
                      <PaymentBadge method={sale.payment_method} />
                    </td>
                    <td data-label={t("Net amount")} className="numeric amount-cell">
                      {money(sale.net_total, shop.currency)}
                    </td>
                    <td data-label={t("Status")}>
                      <SaleStatus sale={sale} />
                    </td>
                    <td className="row-actions">
                      <button
                        className="icon-button"
                        type="button"
                        aria-label={t("View sale {v0}", { v0: sale.reference })}
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
        {t("This week:")} {money(data.week.summary.revenue, shop.currency)}{" "}
        {t("net revenue across")} {data.week.summary.sales_count.toLocaleString()}{" "}
        {t("recorded sales. Revenue and cash are deliberately reported separately.")}
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
