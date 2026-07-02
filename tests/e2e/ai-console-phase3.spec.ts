/**
 * E2E: AI Admin Console — Phase 3 (P2-K · Value Mappings Manager).
 *
 * P2-I (JOLT Specs) and P2-J (Semantic Knowledge) are pre-existing platform-admin
 * pages linked into the AI Console group — not re-tested here. P2-K is the new
 * manager; backend `/admin/channel-mappings` is mocked in ./fixtures.
 */
import { test, expect } from "./fixtures";

const json = (body: unknown) => ({
  status: 200,
  contentType: "application/json",
  body: JSON.stringify(body),
});

test.describe("P2-K · Value Mappings Manager", () => {
  test("lists value mappings with stats and expandable value pairs", async ({ page }) => {
    const pageErrors: string[] = [];
    page.on("pageerror", (e) => pageErrors.push(e.message));

    await page.goto("/platform-admin/channel-value-mappings");
    await expect(page.getByRole("heading", { name: "Value Mappings" })).toBeVisible();

    // Rows render master → channel field. Target the unique channel-field codes.
    await expect(page.getByText("colour_id")).toBeVisible();
    await expect(page.getByText("fabric")).toBeVisible();

    // Expand the tiktok row → its value pairs (master → channel) become visible.
    await page.getByRole("row", { name: /tiktok/ }).getByRole("button", { name: "View values" }).click();
    await expect(page.getByText("COLOUR_0001")).toBeVisible();

    expect(pageErrors).toEqual([]);
  });

  test("filters by channel", async ({ page }) => {
    await page.goto("/platform-admin/channel-value-mappings");
    await expect(page.getByText("colour_id")).toBeVisible(); // tiktok row present

    // Channel filter select → only shopify remains.
    await page.getByRole("combobox").selectOption("shopify");
    await expect(page.getByText("fabric")).toBeVisible();
    await expect(page.getByText("colour_id")).toHaveCount(0);
  });

  test("create modal validates and posts a new mapping", async ({ page }) => {
    let posted: unknown = null;
    await page.route("**/admin/channel-mappings", (route) => {
      if (route.request().method() === "POST") {
        posted = route.request().postDataJSON();
        return route.fulfill(json({ id: "vm-new", ...(posted as object) }));
      }
      return route.continue();
    });

    await page.goto("/platform-admin/channel-value-mappings");
    await page.getByRole("button", { name: /Add Mapping/ }).click();

    // Create button disabled until required fields + at least one valid row.
    const createBtn = page.getByRole("button", { name: /Create mapping/ });
    await expect(createBtn).toBeDisabled();

    await page.getByPlaceholder("mis. color").fill("size");
    await page.getByPlaceholder("mis. colour_id").fill("size_id");
    await page.getByPlaceholder("black").first().fill("small");
    await page.getByPlaceholder("COLOUR_0001").first().fill("SIZE_S");
    await expect(createBtn).toBeEnabled();

    await createBtn.click();
    await expect(page.getByText(/Value mapping created/)).toBeVisible();
    expect(posted).toMatchObject({
      masterFieldName: "size",
      channelFieldName: "size_id",
      mappings: [{ masterValue: "small", channelValue: "SIZE_S" }],
    });
  });

  test("delete asks for confirmation before removing", async ({ page }) => {
    let deletedId: string | null = null;
    // Rows sort shopify-first, so "first delete" targets vm-2 — match any id.
    await page.route("**/admin/channel-mappings/*", (route) => {
      if (route.request().method() === "DELETE") {
        deletedId = route.request().url().split("/").pop() ?? "";
        return route.fulfill({ status: 204, body: "" });
      }
      return route.continue();
    });

    await page.goto("/platform-admin/channel-value-mappings");
    await page.getByRole("button", { name: "Delete", exact: true }).first().click();

    await expect(page.getByText(/Delete Value Mapping/)).toBeVisible();
    await page.getByRole("button", { name: /Delete Permanently/ }).click();

    await expect(page.getByText(/Value mapping deleted/)).toBeVisible();
    expect(deletedId).not.toBeNull();
  });
});
