async function loadFeaturedProducts() {
  const productGrid = document.querySelector(".product-grid");

  if (!productGrid) return;

  try {
    const response = await fetch(window.API_BASE + "/api/products");
    const data = await response.json();

    if (!data.success || !data.products.length) {
      productGrid.innerHTML = `
        <div class="empty-products">
          <p>Our collection is being updated.</p>
          <a href="/shop.html" class="btn btn-dark">Visit Shop</a>
        </div>
      `;
      return;
    }

    const products = data.products
      .filter(product => product.available)
      .slice(0, 3);

    productGrid.innerHTML = products.map(product => `
      <article class="product-card">

        <a href="/product.html?id=${encodeURIComponent(product.id)}">

          <div class="product-image">

            ${
              product.preOrder
                ? `<span class="product-label">PRE-ORDER</span>`
                : ""
            }

            <img
              src="${product.image}"
              alt="${escapeHTML(product.name)}"
              onerror="this.style.display='none'; this.parentElement.querySelector('.product-image-placeholder').style.display='flex';"
            >

            <div class="product-image-placeholder">
              ${escapeHTML(product.subcategory || product.category)}
            </div>

          </div>

        </a>

        <div class="product-info">

          <p class="product-category">
            ${escapeHTML(product.subcategory || product.category)}
          </p>

          <h3>
            ${escapeHTML(product.name)}
          </h3>

          <p class="product-price">
            ₦${Number(product.price).toLocaleString("en-NG")}
          </p>

          ${
            product.preOrder
              ? `<p class="delivery-note">
                  Ready in ${escapeHTML(product.preparationTime)}
                </p>`
              : ""
          }

          <a
            href="/product.html?id=${encodeURIComponent(product.id)}"
            class="product-btn product-btn-link"
          >
            View Product
          </a>

        </div>

      </article>
    `).join("");

  } catch (error) {
    console.error("Unable to load products:", error);

    productGrid.innerHTML = `
      <div class="empty-products">
        <p>Unable to load products right now.</p>
      </div>
    `;
  }
}

function escapeHTML(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function updateCartCount() {
  try {
    const cart = JSON.parse(localStorage.getItem("ubaNaIgboCart")) || [];

    const count = cart.reduce(
      (total, item) => total + Number(item.quantity || 1),
      0
    );

    const cartCount = document.getElementById("cartCount");

    if (cartCount) {
      cartCount.textContent = count;
    }
  } catch (error) {
    console.error("Cart count error:", error);
  }
}

document.addEventListener("DOMContentLoaded", () => {
  loadFeaturedProducts();
  updateCartCount();
});
