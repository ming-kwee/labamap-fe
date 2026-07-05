/**
 * E2E: Step 2 (Channel Fields wizard) — graceful handling of a product with no
 * Product Type. Backend now returns 422 PRODUCT_TYPE_MISSING (was a raw 500);
 * the wizard must render an actionable state routing back to Step 1, not a
 * "Failed to load channel schema / Internal Server Error" dead-end.
 */
import { test, expect } from "./fixtures";

const PID = "prod-no-type";

test.describe("Step 2 · product without Product Type", () => {
  // 422 contract body: { status, error, message, path }; message carries the code prefix.
  const missing422 = {
    status: 422,
    contentType: "application/json",
    body: JSON.stringify({
      status: 422,
      error: "Unprocessable Entity",
      path: "/labamap/api/v1/ecommerce/form-schema/channel-step",
      message: `PRODUCT_TYPE_MISSING: product '${PID}' has no product type assigned. Assign a product type in Step 1 before configuring channel fields.`,
    }),
  };

  test("shows actionable state + Step 1 link on 422 PRODUCT_TYPE_MISSING", async ({ page }) => {
    const pageErrors: string[] = [];
    page.on("pageerror", (e) => pageErrors.push(e.message));

    // Lazy flow calls GET /stores first, then POST /channel-step per store. The 422
    // can surface from either; the wizard must show the actionable card regardless.
    await page.route("**/ecommerce/form-schema/channel-step/stores**", (route) => route.fulfill(missing422));
    await page.route("**/ecommerce/form-schema/channel-step", (route) => route.fulfill(missing422));

    await page.goto(`/products/${PID}/channel-fields`);

    // Actionable state, not the raw-error dead-end.
    await expect(page.getByText("Produk ini belum punya Product Type")).toBeVisible();
    await expect(page.getByText(/Internal Server Error/)).toHaveCount(0);
    await expect(page.getByText("Failed to load channel schema")).toHaveCount(0);

    // Link routes back to Step 1 (Master Product edit).
    const step1 = page.getByRole("link", { name: /Ke Step 1/ });
    await expect(step1).toBeVisible();
    await expect(step1).toHaveAttribute("href", `/products/${PID}/edit`);

    expect(pageErrors).toEqual([]);
  });

  test("other schema errors still show the generic error state", async ({ page }) => {
    const err500 = { status: 500, contentType: "application/json", body: JSON.stringify({ message: "boom" }) };
    await page.route("**/ecommerce/form-schema/channel-step/stores**", (route) => route.fulfill(err500));
    await page.route("**/ecommerce/form-schema/channel-step", (route) => route.fulfill(err500));
    await page.goto(`/products/${PID}/channel-fields`);
    await expect(page.getByText("Failed to load channel schema")).toBeVisible();
    await expect(page.getByText("Produk ini belum punya Product Type")).toHaveCount(0);
  });
});
