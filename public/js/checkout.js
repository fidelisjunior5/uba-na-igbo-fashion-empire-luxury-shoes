(() => {
  const CART_KEY = "ubaNaIgboCart";

  const checkoutForm = document.getElementById("checkoutForm");
  const checkoutContent = document.getElementById("checkoutContent");
  const emptyCheckout = document.getElementById("emptyCheckout");
  const errorMessage = document.getElementById("errorMessage");
  const placeOrderBtn = document.getElementById("placeOrderBtn");

  function getCart() {
    try {
      const cart = JSON.parse(localStorage.getItem(CART_KEY) || "[]");
      return Array.isArray(cart) ? cart : [];
    } catch (error) {
      console.error("Unable to read cart:", error);
      return [];
    }
  }

  function showError(message) {
    if (!errorMessage) return;

    errorMessage.textContent = message;
    errorMessage.style.display = "block";
  }

  function hideError() {
    if (!errorMessage) return;

    errorMessage.textContent = "";
    errorMessage.style.display = "none";
  }

  function updateCartCount() {
    const cartCount = document.getElementById("cartCount");
    if (!cartCount) return;

    const cart = getCart();

    const count = cart.reduce((total, item) => {
      return total + Number(item.quantity || 1);
    }, 0);

    cartCount.textContent = count;
  }

  function formatNaira(amount) {
    return "₦" + Number(amount || 0).toLocaleString("en-NG");
  }

  function getOrderItems(cart) {
    return cart.map(item => ({
      productId: String(item.productId || item.id || "").trim(),
      name: item.name || "",
      price: Number(item.price || 0),
      quantity: Number(item.quantity || 1),
      size: item.size || "",
      color: item.color || "",
      image: item.image || ""
    }));
  }

  function calculateTotal(cart) {
    return cart.reduce((total, item) => {
      const price = Number(item.price || 0);
      const quantity = Number(item.quantity || 1);

      return total + (price * quantity);
    }, 0);
  }

  function renderOrderSummary(cart) {
    const orderSummary = document.getElementById("summaryProducts");

    if (!orderSummary) return;

    orderSummary.innerHTML = "";

    cart.forEach(item => {
      const quantity = Number(item.quantity || 1);
      const price = Number(item.price || 0);

      const row = document.createElement("div");
      row.className = "order-summary-item";

      row.innerHTML = `
        <div>
          <strong>${escapeHtml(item.name || "Product")}</strong>
          <div>
            ${item.size ? "Size: " + escapeHtml(item.size) : ""}
            ${item.color ? " | Colour: " + escapeHtml(item.color) : ""}
            ${" | Qty: " + quantity}
          </div>
        </div>
        <strong>${formatNaira(price * quantity)}</strong>
      `;

      orderSummary.appendChild(row);
    });

    const totalAmount = calculateTotal(cart);

    const subtotalElement = document.getElementById("subtotal");
    const totalElement = document.getElementById("total");
    const deliveryElement = document.getElementById("delivery");

    if (subtotalElement) {
      subtotalElement.textContent = formatNaira(totalAmount);
    }

    if (deliveryElement) {
      deliveryElement.textContent = "To be confirmed";
    }

    if (totalElement) {
      totalElement.textContent = formatNaira(totalAmount);
    }
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function showCheckoutState() {
    const cart = getCart();

    updateCartCount();

    if (!cart.length) {
      if (emptyCheckout) {
        emptyCheckout.style.display = "block";
      }

      if (checkoutContent) {
        checkoutContent.style.display = "none";
      }

      return;
    }

    if (emptyCheckout) {
      emptyCheckout.style.display = "none";
    }

    if (checkoutContent) {
      checkoutContent.style.display = "";
    }

    renderOrderSummary(cart);
  }

  async function placeOrder(event) {
    event.preventDefault();

    hideError();

    const cart = getCart();

    if (!cart.length) {
      showError("Your cart is empty. Please add a product before checkout.");
      return;
    }

    const customerName =
      document.getElementById("customerName")?.value.trim() || "";

    const phone =
      document.getElementById("phone")?.value.trim() || "";

    const email =
      document.getElementById("email")?.value.trim() || "";

    const state =
      document.getElementById("state")?.value.trim() || "";

    const city =
      document.getElementById("city")?.value.trim() || "";

    const address =
      document.getElementById("address")?.value.trim() || "";

    const additionalNote =
      document.getElementById("deliveryNote")?.value.trim() || "";

    if (!customerName || !phone || !email || !state || !city || !address) {
      showError("Please complete all required customer and delivery information.");
      return;
    }

    const orderItems = getOrderItems(cart);

    for (const item of orderItems) {
      if (!item.productId) {
        showError("A product in your cart is missing its product ID. Please return to the shop and add it again.");
        return;
      }

      if (!Number.isInteger(item.quantity) || item.quantity < 1) {
        showError("Invalid product quantity.");
        return;
      }
    }

    const totalAmount = calculateTotal(cart);

    if (!Number.isFinite(totalAmount) || totalAmount <= 0) {
      showError("Unable to calculate your order total.");
      return;
    }

    const fullAddress = [
      address,
      city,
      state,
      additionalNote
    ].filter(Boolean).join(", ");

    if (placeOrderBtn) {
      placeOrderBtn.disabled = true;
      placeOrderBtn.textContent = "Creating Order...";
    }

    try {
      const response = await fetch(
        window.API_BASE + "/api/orders",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            customerName,
            phone,
            email,
            address: fullAddress,
            items: orderItems,
            totalAmount
          })
        }
      );

      const responseText = await response.text();

      let data;

      try {
        data = JSON.parse(responseText);
      } catch (error) {
        console.error("Order API returned non-JSON:", responseText);

        throw new Error(
          "The server returned an unexpected response. Please try again."
        );
      }

      if (!response.ok || !data.success || !data.order) {
        throw new Error(
          data.message || "Unable to create your order."
        );
      }

      const orderNumber = data.order.orderNumber;

      if (!orderNumber) {
        throw new Error("The server did not return an order number.");
      }

      if (placeOrderBtn) {
        placeOrderBtn.textContent = "Opening Payment...";
      }

      const paymentResponse = await fetch(
        window.API_BASE + "/api/payments/initialize",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            orderNumber
          })
        }
      );

      const paymentText = await paymentResponse.text();

      let paymentData;

      try {
        paymentData = JSON.parse(paymentText);
      } catch (error) {
        console.error(
          "Payment initialization returned non-JSON:",
          paymentText
        );

        throw new Error(
          "Unable to connect to the payment system."
        );
      }

      if (!paymentResponse.ok || !paymentData.success) {
        throw new Error(
          paymentData.message ||
          "Unable to initialize payment."
        );
      }

      if (!paymentData.accessCode) {
        throw new Error(
          "Paystack did not return a payment access code."
        );
      }

      if (typeof PaystackPop === "undefined") {
        throw new Error(
          "Paystack payment system is not available. Please refresh the page and try again."
        );
      }

      const popup = new PaystackPop();

      popup.resumeTransaction(
        paymentData.accessCode,
        {
          onSuccess: async function(transaction) {
            if (placeOrderBtn) {
              placeOrderBtn.textContent = "Verifying Payment...";
            }

            try {
              const reference = transaction.reference;

              const verifyResponse = await fetch(
                window.API_BASE +
                "/api/payments/verify/" +
                encodeURIComponent(reference)
              );

              const verifyText = await verifyResponse.text();

              let verifyData;

              try {
                verifyData = JSON.parse(verifyText);
              } catch (error) {
                console.error(
                  "Payment verification returned non-JSON:",
                  verifyText
                );

                throw new Error(
                  "Payment verification returned an unexpected response."
                );
              }

              if (!verifyResponse.ok || !verifyData.success) {
                throw new Error(
                  verifyData.message ||
                  "Payment verification failed."
                );
              }

              localStorage.removeItem(CART_KEY);

              window.location.href =
                "/orders.html?order=" +
                encodeURIComponent(verifyData.orderNumber) +
                "&paid=1";

            } catch (error) {
              console.error("Payment verification error:", error);

              showError(
                error.message ||
                "Payment was received but verification failed. Please contact us."
              );

              if (placeOrderBtn) {
                placeOrderBtn.disabled = false;
                placeOrderBtn.textContent = "Try Payment Again";
              }
            }
          },

          onCancel: function() {
            showError(
              "Payment was cancelled. Your order is still pending until payment is completed."
            );

            if (placeOrderBtn) {
              placeOrderBtn.disabled = false;
              placeOrderBtn.textContent = "Pay Now";
            }
          },

          onError: function(error) {
            console.error("Paystack error:", error);

            showError(
              "Payment could not be completed. Please try again."
            );

            if (placeOrderBtn) {
              placeOrderBtn.disabled = false;
              placeOrderBtn.textContent = "Try Payment Again";
            }
          }
        }
      );

    } catch (error) {
      console.error("Checkout error:", error);

      showError(
        error.message ||
        "Something went wrong while processing your order."
      );

      if (placeOrderBtn) {
        placeOrderBtn.disabled = false;
        placeOrderBtn.textContent = "Place Order";
      }
    }
  }

  if (checkoutForm) {
    checkoutForm.addEventListener("submit", placeOrder);
  }

  showCheckoutState();
})();
