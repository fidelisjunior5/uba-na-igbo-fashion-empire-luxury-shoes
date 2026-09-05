let allProducts = [];
let currentCategory = "all";

async function loadProducts() {
  const container = document.getElementById("shopProducts");
  const count = document.getElementById("productCount");

  try {
    const response = await fetch("/api/products");
    const data = await response.json();

    if (!data.success) {
      throw new Error("Could not load products");
    }

    allProducts = data.products || [];

    const params = new URLSearchParams(window.location.search);
    const category = params.get("category");

    if (category) {
      currentCategory = category;

      document.querySelectorAll(".filter-btn").forEach(button => {
        button.classList.toggle(
          "active",
          button.dataset.category === category
        );
      });
    }

    renderProducts();

  } catch (error) {
    console.error(error);

    container.innerHTML = `
      <div class="shop-empty">
        <h2>Unable to load products</h2>
        <p>Please refresh the page and try again.</p>
      </div>
    `;

    count.textContent = "";
  }
}

function renderProducts() {
  const container = document.getElementById("shopProducts");
  const count = document.getElementById("productCount");

  let products = allProducts.filter(product => product.available);

  if (currentCategory === "preorder") {
    products = products.filter(product => product.preOrder);
  } else if (currentCategory !== "all") {
    products = products.filter(
      product => product.category === currentCategory
    );
  }

  count.textContent =
    `${products.length} product${products.length === 1 ? "" : "s"}`;

  if (!products.length) {
    container.innerHTML = `
      <div class="shop-empty">
        <h2>No products found</h2>
        <p>There are currently no products in this category.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = products.map(product => `
    <article class="shop-product-card">

      <a href="/product.html?id=${encodeURIComponent(product.id)}">

        <div class="shop-product-image">

          ${
            product.preOrder
              ? `<span class="product-label">PRE-ORDER</span>`
              : ""
          }

          <img
            src="${product.image}"
            alt="${escapeHTML(product.name)}"
            onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';"
          >

          <div class="placeholder" style="display:none;">
            ${escapeHTML(product.subcategory || product.category)}
          </div>

        </div>

      </a>

      <div class="shop-product-info">

        <p class="category">
          ${escapeHTML(product.subcategory || product.category)}
        </p>

        <h2>${escapeHTML(product.name)}</h2>

        <p class="shop-price">
          ₦${Number(product.price).toLocaleString("en-NG")}
        </p>

        <a
          href="/product.html?id=${encodeURIComponent(product.id)}"
          class="shop-view"
        >
          View Product
        </a>

      </div>

    </article>
  `).join("");

  updateCartCount();
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
  const cart =
    JSON.parse(localStorage.getItem("ubaNaIgboCart")) || [];

  const count = cart.reduce(
    (total, item) => total + Number(item.quantity || 1),
    0
  );

  const cartCount = document.getElementById("cartCount");

  if (cartCount) {
    cartCount.textContent = count;
  }
}

document.addEventListener("DOMContentLoaded", () => {

  document.querySelectorAll(".filter-btn").forEach(button => {

    button.addEventListener("click", () => {

      currentCategory = button.dataset.category;

      document.querySelectorAll(".filter-btn").forEach(btn => {
        btn.classList.remove("active");
      });

      button.classList.add("active");

      const url = new URL(window.location.href);

      if (currentCategory === "all") {
        url.searchParams.delete("category");
      } else {
        url.searchParams.set("category", currentCategory);
      }

      window.history.replaceState({}, "", url);

      renderProducts();
    });

  });

  loadProducts();
});
