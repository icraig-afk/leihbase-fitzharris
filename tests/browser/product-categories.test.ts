import { expect, test } from "@playwright/test";
import { createProduct, navigateToProductPage } from "../lib/product";
import { uniqueId } from "../lib/utils";
import { pocketbase } from "../services/pocketbase";

test.describe("product categories", () => {
  test("product page shows its categories in the current locale", async ({
    page,
  }) => {
    const pb = await pocketbase();
    const id = uniqueId();
    const category = await pb.collection("categories").create({
      name_en: `Garden ${id}`,
      name_de: `Garten ${id}`,
    });
    const product = await createProduct();
    await pb
      .collection("products")
      .update(product.id, { categories: [category.id] });

    await navigateToProductPage(page, product.id);
    await expect(
      page.getByRole("link", { name: `Garden ${id}` })
    ).toBeVisible();
  });
});
