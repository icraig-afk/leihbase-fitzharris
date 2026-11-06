import { expect, test } from "@playwright/test";
import type { Location } from "../../web/models/location";
import { createLocation } from "../lib/location";
import { uniqueId, waitForClientMount, waitForHydration } from "../lib/utils";
import { pocketbase } from "../services/pocketbase";

async function createNamedProduct(
  location: Location,
  name: string,
  active = true
) {
  const pb = await pocketbase();
  return pb.collection("products").create({
    active,
    name,
    location: location.id,
    deposit: 10,
    description: "<p>Lorem ipsum dolor.</p>",
  });
}

async function setLocationActive(location: Location, active: boolean) {
  const pb = await pocketbase();
  await pb.collection("location").update(location.id, { active });
}

test.describe("search across locations", () => {
  test("finds products at all active locations", async ({ page }) => {
    const name = `Hammer ${uniqueId()}`;
    const locationA = await createLocation("multiple");
    const locationB = await createLocation("multiple");
    const inactiveLocation = await createLocation("multiple");
    const productA = await createNamedProduct(locationA, name);
    const productB = await createNamedProduct(locationB, name);
    const productOfInactiveLocation = await createNamedProduct(
      inactiveLocation,
      name
    );
    const inactiveProduct = await createNamedProduct(locationA, name, false);
    await setLocationActive(inactiveLocation, false);

    await page.goto(`/search?query=${encodeURIComponent(name)}`);
    await waitForHydration(page);

    await expect(page.getByTestId(`product-card-${productA.id}`)).toBeVisible();
    await expect(page.getByTestId(`product-card-${productB.id}`)).toBeVisible();
    await expect(
      page.getByTestId(`product-card-location-${productA.id}`)
    ).toHaveText(locationA.name);
    await expect(
      page.getByTestId(`product-card-location-${productB.id}`)
    ).toHaveText(locationB.name);
    await expect(
      page.getByTestId(`product-card-${productOfInactiveLocation.id}`)
    ).toHaveCount(0);
    await expect(
      page.getByTestId(`product-card-${inactiveProduct.id}`)
    ).toHaveCount(0);
  });

  test("links to the product page of its location", async ({ page }) => {
    const name = `Saw ${uniqueId()}`;
    const location = await createLocation("multiple");
    const product = await createNamedProduct(location, name);

    await page.goto(`/search?query=${encodeURIComponent(name)}`);
    await waitForHydration(page);
    await waitForClientMount(page.getByTestId(`product-card-${product.id}`));
    await page.getByTestId(`product-card-${product.id}`).click();
    await page.waitForURL(`**/l/${location.slug}/p/${product.id}`);
    await expect(page.getByTestId("product-page-h1")).toBeVisible();
  });

  test("can search from the home page", async ({ page }) => {
    const name = `Drill ${uniqueId()}`;
    const location = await createLocation("multiple");
    const product = await createNamedProduct(location, name);

    await page.goto("/");
    await waitForHydration(page);
    await page.getByTestId("home-search-input").fill(name);
    await page.getByTestId("home-search-submit").click();
    await page.waitForURL(/\/search\?query=/);
    await expect(page.getByTestId("search-h1")).toBeVisible();
    await expect(page.getByTestId(`product-card-${product.id}`)).toBeVisible();
  });
});
