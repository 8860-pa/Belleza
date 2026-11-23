(() => {
  const productKey = "belleza.products";
  const catalogueKey = "belleza.catalogues";
  const wishlistKey = "belleza.wishlist";
  const currencyFormatter = new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  });
  const defaults = [
    { id: "mineral-face-wash", name: "Mineral Face Wash", category: "wellness", price: 28, image: "https://images.unsplash.com/photo-1556228578-8c89e6adf883?auto=format&fit=crop&w=700&q=85", badge: "Bestseller" },
    { id: "stoneware-mug", name: "Stoneware Mug", category: "home", price: 34, image: "https://images.unsplash.com/photo-1514228742587-6b1558fcca3d?auto=format&fit=crop&w=700&q=85", badge: "" },
    { id: "canvas-tote", name: "Canvas Tote", category: "carry", price: 42, image: "https://images.unsplash.com/photo-1590874103328-eac38a683ce7?auto=format&fit=crop&w=700&q=85", badge: "New" },
    { id: "botanical-hand-balm", name: "Botanical Hand Balm", category: "wellness", price: 24, image: "https://images.unsplash.com/photo-1608571423902-eed4a5ad8108?auto=format&fit=crop&w=700&q=85", badge: "" }
  ];

  function readList(key, initial) {
    const saved = localStorage.getItem(key);
    if (saved === null) {
      localStorage.setItem(key, JSON.stringify(initial));
      return [...initial];
    }
    const parsed = JSON.parse(saved);
    if (!Array.isArray(parsed)) throw new Error(`Saved BELLEZA data for ${key} is not a list.`);
    return parsed;
  }

  function writeList(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  window.BELLEZAStore = {
    getProducts: () => readList(productKey, defaults),
    saveProducts: (products) => writeList(productKey, products),
    getCatalogues: () => readList(catalogueKey, []),
    saveCatalogues: (catalogues) => writeList(catalogueKey, catalogues),
    getWishlist: () => readList(wishlistKey, []),
    saveWishlist: (wishlist) => writeList(wishlistKey, wishlist),
    formatPrice: (price) => currencyFormatter.format(Number(price)),
    categories: [
      { value: "home", label: "Home" },
      { value: "wellness", label: "Wellness" },
      { value: "carry", label: "Carry" }
    ]
  };
})();
