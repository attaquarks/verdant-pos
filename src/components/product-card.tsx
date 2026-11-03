"use client";

import { useEffect, useId, useRef, useState } from "react";
import { History } from "lucide-react";
import type { Product, Shop } from "@/lib/types";
import { money, quantity } from "@/lib/money";
import { useT } from "./preferences";
import { message as sourceMessage } from "@/lib/translations";
import { unitCost } from "./format";
import { Button, Modal, Notice } from "./ui";
import {
  PhotoField,
  ProductPhoto,
  photoErrorKey,
  preparePhoto,
  uploadPhoto,
  type PhotoAttempt,
} from "./product-photo";

export function ProductCard({
  product,
  shop,
  version,
  photoLoading,
  photoError,
  onPhotoSaved,
  onMovements,
  onClose,
}: {
  product: Product;
  shop: Shop;
  version?: string | null;
  photoLoading: boolean;
  photoError: boolean;
  onPhotoSaved: () => void;
  onMovements: () => void;
  onClose: () => void;
}) {
  const t = useT();
  const id = useId();
  const [file, setFile] = useState<File | null>(null);
  const [current, setCurrent] = useState<string | null>(version ?? null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const attempt = useRef<PhotoAttempt | null>(null);
  useEffect(() => {
    if (!photoLoading && !photoError) setCurrent(version ?? null);
  }, [version, photoLoading, photoError]);
  async function savePhoto() {
    if (!file || pending || photoLoading || photoError) return;
    setPending(true);
    setError(null);
    setMessage(null);
    try {
      if (!attempt.current)
        attempt.current = {
          productId: product.id,
          expected: current,
          requestId: crypto.randomUUID(),
          bytes: await preparePhoto(file),
        };
      const next = await uploadPhoto(attempt.current);
      setCurrent(next);
      setFile(null);
      attempt.current = null;
      onPhotoSaved();
      setMessage(sourceMessage("Photo saved."));
    } catch (caught) {
      setError(sourceMessage(photoErrorKey(caught)));
    } finally {
      setPending(false);
    }
  }
  return (
    <Modal
      title={product.name}
      onClose={onClose}
      busy={pending}
      footer={
        <>
          <Button variant="secondary" onClick={onMovements} disabled={pending}>
            <History size={16} aria-hidden="true" />
            {t("Stock movements")}
          </Button>
          <Button variant="secondary" onClick={onClose} disabled={pending}>
            {t("Close")}
          </Button>
        </>
      }
    >
      {error && <Notice>{error}</Notice>}
      {message && <Notice tone="success">{message}</Notice>}
      {photoError && <Notice tone="warning">{t("Photo unavailable. Try again later.")}</Notice>}
      <div className="product-card-image">
        <ProductPhoto productId={product.id} name={product.name} version={current} size="card" />
      </div>
      <dl className="product-card-details">
        <div>
          <dt>{t("Category")}</dt>
          <dd>{product.category?.name || t("Uncategorized")}</dd>
        </div>
        <div>
          <dt>{t("SKU")}</dt>
          <dd dir="auto">{product.sku || "—"}</dd>
        </div>
        <div>
          <dt>{t("Barcode")}</dt>
          <dd dir="auto">{product.barcode || "—"}</dd>
        </div>
        <div>
          <dt>{t("Selling price")}</dt>
          <dd>{money(product.selling_price, shop.currency)}</dd>
        </div>
        <div>
          <dt>{t("Unit cost")}</dt>
          <dd>{unitCost(product.cost_price, shop.currency, t("Unavailable"))}</dd>
        </div>
        <div>
          <dt>{t("Stock on hand")}</dt>
          <dd>
            {quantity(product.current_stock)} {product.unit}
          </dd>
        </div>
        <div>
          <dt>{t("Low-stock alert at")}</dt>
          <dd>
            {quantity(product.low_stock_threshold)} {product.unit}
          </dd>
        </div>
        <div>
          <dt>{t("Status")}</dt>
          <dd>{product.is_active ? t("Active product") : t("Inactive")}</dd>
        </div>
      </dl>
      <PhotoField
        id={`${id}-photo`}
        disabled={pending || photoLoading || photoError}
        onChange={(selected) => {
          setFile(selected);
          attempt.current = null;
          setError(null);
          setMessage(null);
        }}
      />
      {file && (
        <Button onClick={savePhoto} pending={pending} disabled={photoLoading || photoError}>
          {t("Save photo")}
        </Button>
      )}
    </Modal>
  );
}
